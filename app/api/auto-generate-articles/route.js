import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized } from "@/lib/cronAuth";
import { ensureArticleDraftsTable } from "@/lib/articleDrafts";
import { isInvocationTimeout } from "@/lib/articlePipeline";
import { getCronBaseUrl } from "@/lib/productionBaseUrl";
import { isNewCreateAction, isUpdateAction } from "@/lib/pipelineConfig";

export const maxDuration = 300;

function looksLikeQuotaError(text) {
  if (!text) return false;
  const t = String(text).toLowerCase();
  return (
    t.includes("isquotaerror") ||
    t.includes("429") ||
    t.includes(" 432") ||
    t.includes("out of searches") ||
    t.includes("insufficient credits") ||
    t.includes("not enough credits") ||
    t.includes("rate limit") ||
    t.includes("quota")
  );
}

function getBaseUrl(request) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret");
  if (cronSecret && providedSecret && providedSecret === cronSecret) {
    return getCronBaseUrl();
  }

  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

function classifyAction(pipelineAction) {
  const action = pipelineAction || "create-new";
  if (isNewCreateAction(action)) return "create";
  if (isUpdateAction(action)) return "update";
  return "create";
}

async function processOneTrend({
  trend,
  websiteId,
  baseUrl,
  cookies,
  cronSecret,
  skipGates = false,
}) {
  const celebrityName = trend.celebrity_name;
  const pipelineAction = trend.pipeline_action || "create-new";

  if (trend.url && trend.url.trim() !== "" && !trend.pipeline_action) {
    return {
      celebrity_name: celebrityName,
      trend_id: trend.id,
      success: false,
      skipped: true,
      error: "has URL without pipeline_action",
    };
  }

  console.log(
    `[Queue] Generating for: ${celebrityName} (action: ${pipelineAction}, skipGates=${skipGates})`
  );

  const generateResponse = await fetch(`${baseUrl}/api/generate-article`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
      "x-cron-secret": cronSecret,
    },
    body: JSON.stringify({
      celebrityName,
      websiteId,
      trendId: trend.id,
      pipelineActionOverride: trend.pipeline_action || null,
      skipGates,
    }),
  });

  if (!generateResponse.ok) {
    const errorText = await generateResponse.text();
    return {
      celebrity_name: celebrityName,
      trend_id: trend.id,
      success: false,
      pipeline_action: pipelineAction,
      action_kind: classifyAction(pipelineAction),
      error: `HTTP ${generateResponse.status}: ${errorText.substring(0, 200)}`,
      timed_out: isInvocationTimeout(generateResponse.status, errorText),
      quota_error: looksLikeQuotaError(errorText),
    };
  }

  const contentType = generateResponse.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const errorText = await generateResponse.text();
    return {
      celebrity_name: celebrityName,
      trend_id: trend.id,
      success: false,
      pipeline_action: pipelineAction,
      action_kind: classifyAction(pipelineAction),
      error: `Invalid response format: ${contentType}. Response: ${errorText.substring(0, 200)}`,
    };
  }

  const generateData = await generateResponse.json();
  const resolvedAction =
    generateData.pipeline_action ||
    generateData.result?.wordpress?.pipeline_action ||
    pipelineAction;

  if (generateData.deferred || generateData.deferred_publish) {
    return {
      celebrity_name: celebrityName,
      trend_id: trend.id,
      success: false,
      deferred_publish: true,
      pipeline_action: resolvedAction,
      action_kind: classifyAction(resolvedAction),
      error: generateData.defer_reason || "WordPress publish deferred; draft saved for retry",
    };
  }

  if (generateData.success && generateData.result) {
    const wpData = generateData.result.wordpress;
    let postUrl = null;

    if (wpData && wpData.status === "success" && wpData.post_id) {
      const wpPostResult = await query(
        `SELECT post_url FROM wordpress_posts
         WHERE website_id = $1 AND celebrity_name = $2 AND post_id = $3
         ORDER BY created_at DESC LIMIT 1`,
        [parseInt(websiteId, 10), celebrityName, parseInt(wpData.post_id, 10)]
      );

      if (wpPostResult.rows.length > 0 && wpPostResult.rows[0].post_url) {
        postUrl = wpPostResult.rows[0].post_url;
      } else if (wpData.link) {
        postUrl = wpData.link;
      } else if (wpData.slug) {
        postUrl = `https://whatreligionisinfo.com/${wpData.slug}/`;
      }

      if (postUrl) {
        await query(
          `UPDATE trends
           SET url = $1, pipeline_action = COALESCE(pipeline_action, $3), updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [postUrl, trend.id, resolvedAction]
        );
      }
    }

    return {
      celebrity_name: celebrityName,
      trend_id: trend.id,
      success: true,
      pipeline_action: resolvedAction,
      action_kind: classifyAction(resolvedAction),
      wordpress_post_id: wpData?.post_id || null,
      url: postUrl,
    };
  }

  const stepErrors = (generateData.steps || [])
    .filter((s) => s.status === "error")
    .map((s) => s.error || "")
    .join(" | ");

  return {
    celebrity_name: celebrityName,
    trend_id: trend.id,
    success: false,
    pipeline_action: resolvedAction,
    action_kind: classifyAction(resolvedAction),
    error: generateData.error || generateData.skip_reason?.detail || "Article generation failed",
    skip_stage: generateData.skip_reason?.stage || null,
    steps: generateData.steps,
    quota_error:
      looksLikeQuotaError(stepErrors) || looksLikeQuotaError(generateData.error),
  };
}

/**
 * Preferred order for daily posting:
 * create-new → revive-draft → light-update → full-rewrite
 */
async function loadOrderedQueue(websiteId, newLimit, updateLimit) {
  const createNew = await query(
    `SELECT id, celebrity_name, url, pipeline_action
     FROM trends
     WHERE website_id = $1
       AND celebrity_name IS NOT NULL AND celebrity_name != ''
       AND (url IS NULL OR url = '' OR TRIM(url) = '')
       AND skip_reason IS NULL
       AND (pipeline_action IS NULL OR pipeline_action = 'create-new')
       AND NOT EXISTS (
         SELECT 1 FROM article_drafts d
         WHERE d.website_id = trends.website_id
           AND d.celebrity_name = trends.celebrity_name
           AND d.pipeline_status IN ('draft_ready', 'publishing', 'published')
       )
     ORDER BY created_at ASC
     LIMIT $2`,
    [parseInt(websiteId, 10), Math.max(1, parseInt(newLimit, 10) || 1)]
  );

  const revive = await query(
    `SELECT id, celebrity_name, url, pipeline_action
     FROM trends
     WHERE website_id = $1
       AND pipeline_action = 'revive-draft'
       AND skip_reason IS NULL
       AND updated_at >= NOW() - INTERVAL '14 days'
     ORDER BY created_at ASC
     LIMIT $2`,
    [parseInt(websiteId, 10), Math.max(1, parseInt(newLimit, 10) || 1)]
  );

  const light = await query(
    `SELECT id, celebrity_name, url, pipeline_action
     FROM trends
     WHERE website_id = $1
       AND pipeline_action = 'light-update'
       AND skip_reason IS NULL
       AND url IS NOT NULL AND trim(url) <> ''
       AND updated_at >= NOW() - INTERVAL '14 days'
     ORDER BY created_at ASC
     LIMIT $2`,
    [parseInt(websiteId, 10), Math.max(1, parseInt(updateLimit, 10) || 1)]
  );

  const full = await query(
    `SELECT id, celebrity_name, url, pipeline_action
     FROM trends
     WHERE website_id = $1
       AND pipeline_action = 'full-rewrite'
       AND skip_reason IS NULL
       AND url IS NOT NULL AND trim(url) <> ''
       AND updated_at >= NOW() - INTERVAL '14 days'
     ORDER BY created_at ASC
     LIMIT $2`,
    [parseInt(websiteId, 10), Math.max(1, parseInt(updateLimit, 10) || 1)]
  );

  // Prefer creates, then revive (counts as new), then light, then full.
  const newSlots = Math.max(1, parseInt(newLimit, 10) || 1);
  const updateSlots = Math.max(1, parseInt(updateLimit, 10) || 1);

  const creates = [...createNew.rows, ...revive.rows].slice(0, newSlots);
  const updates = [...light.rows, ...full.rows].slice(0, updateSlots);

  return {
    trends: [...creates, ...updates],
    create_candidates: createNew.rows.length,
    revive_candidates: revive.rows.length,
    light_candidates: light.rows.length,
    full_candidates: full.rows.length,
  };
}

async function loadGuaranteeFallback(websiteId, excludeIds = []) {
  const exclude = excludeIds.filter(Boolean);
  const result = await query(
    `SELECT id, celebrity_name, url, pipeline_action
     FROM trends
     WHERE website_id = $1
       AND celebrity_name IS NOT NULL AND celebrity_name != ''
       AND skip_reason IS NULL
       AND (
         (url IS NOT NULL AND trim(url) <> '' AND pipeline_action IN ('light-update', 'full-rewrite', 'revive-draft'))
         OR ((url IS NULL OR trim(url) = '') AND (pipeline_action IS NULL OR pipeline_action = 'create-new'))
       )
       AND ($2::int[] IS NULL OR cardinality($2::int[]) = 0 OR id <> ALL($2::int[]))
       AND updated_at >= NOW() - INTERVAL '30 days'
     ORDER BY
       CASE pipeline_action
         WHEN 'light-update' THEN 1
         WHEN 'full-rewrite' THEN 2
         WHEN 'revive-draft' THEN 3
         WHEN 'create-new' THEN 4
         ELSE 5
       END,
       created_at ASC
     LIMIT 8`,
    [parseInt(websiteId, 10), exclude.length ? exclude : null]
  );
  return result.rows;
}

export async function POST(request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      websiteId,
      limit = 5,
      updateLimit = 2,
      dailyGuarantee = false,
    } = body;

    if (!websiteId) {
      return NextResponse.json({ error: "websiteId is required" }, { status: 400 });
    }

    console.log(
      `Auto-generating articles for website_id: ${websiteId}, new=${limit}, updates=${updateLimit}, guarantee=${dailyGuarantee}`
    );

    await ensureArticleDraftsTable();

    const queue = await loadOrderedQueue(websiteId, limit, updateLimit);
    let allTrends = queue.trends;

    if (allTrends.length === 0 && dailyGuarantee) {
      allTrends = await loadGuaranteeFallback(websiteId);
    }

    if (allTrends.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No trends in processing or update queue",
        processed: 0,
        results: [],
        creates_succeeded: 0,
        updates_succeeded: 0,
        daily_guarantee_met: false,
      });
    }

    const baseUrl = getBaseUrl(request);
    const cookies = request.headers.get("cookie") || "";
    const cronSecret = request.headers.get("x-cron-secret") || "";
    const results = [];
    let quotaExhausted = false;
    let quotaExhaustedReason = null;
    const deadlineMs = Date.now() + 4 * 60 * 1000;
    const attemptedIds = [];

    async function runBatch(trends, { skipGates = false } = {}) {
      for (const trend of trends) {
        if (quotaExhausted) break;
        if (Date.now() > deadlineMs) break;
        if (attemptedIds.includes(trend.id)) continue;
        attemptedIds.push(trend.id);

        try {
          const outcome = await processOneTrend({
            trend,
            websiteId,
            baseUrl,
            cookies,
            cronSecret,
            skipGates,
          });
          results.push(outcome);

          if (outcome.timed_out) break;
          if (outcome.quota_error) {
            quotaExhausted = true;
            quotaExhaustedReason = outcome.error;
            break;
          }
        } catch (error) {
          console.error(`Error processing ${trend.celebrity_name}:`, error);
          if (looksLikeQuotaError(error.message)) {
            quotaExhausted = true;
            quotaExhaustedReason = error.message;
          }
          results.push({
            celebrity_name: trend.celebrity_name,
            trend_id: trend.id,
            success: false,
            pipeline_action: trend.pipeline_action || "create-new",
            action_kind: classifyAction(trend.pipeline_action),
            error: error.message,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    await runBatch(allTrends, { skipGates: false });

    let guaranteeUsed = false;
    let successCount = results.filter((r) => r.success).length;

    // Daily guarantee: if nothing published, retry fallback candidates with
    // skipGates so soft gate failures don't leave the day at zero.
    if (dailyGuarantee && successCount === 0 && !quotaExhausted && Date.now() < deadlineMs) {
      guaranteeUsed = true;
      const fallback = await loadGuaranteeFallback(websiteId, attemptedIds);
      console.log(
        `[daily-guarantee] 0 successes — trying ${fallback.length} fallback candidates with skipGates`
      );
      await runBatch(fallback, { skipGates: true });
      successCount = results.filter((r) => r.success).length;
    }

    const createsSucceeded = results.filter(
      (r) => r.success && r.action_kind === "create"
    ).length;
    const updatesSucceeded = results.filter(
      (r) => r.success && r.action_kind === "update"
    ).length;
    const deferredCount = results.filter((r) => r.deferred_publish).length;
    const failureCount = results.filter(
      (r) => !r.success && !r.deferred_publish && !r.skipped
    ).length;

    console.log(
      `✅ Auto-generation complete: ${successCount} succeeded (creates=${createsSucceeded}, updates=${updatesSucceeded}), ${deferredCount} deferred, ${failureCount} failed, guarantee=${guaranteeUsed}`
    );

    return NextResponse.json({
      success: true,
      processed: allTrends.length,
      attempted: results.length,
      succeeded: successCount,
      creates_succeeded: createsSucceeded,
      updates_succeeded: updatesSucceeded,
      deferred_publish: deferredCount,
      failed: failureCount,
      daily_guarantee: dailyGuarantee,
      daily_guarantee_used: guaranteeUsed,
      daily_guarantee_met: successCount >= 1,
      queue_stats: {
        create_candidates: queue.create_candidates,
        revive_candidates: queue.revive_candidates,
        light_candidates: queue.light_candidates,
        full_candidates: queue.full_candidates,
      },
      stopped_early_for_quota: quotaExhausted,
      quota_exhausted_reason: quotaExhaustedReason,
      results,
    });
  } catch (error) {
    console.error("Error in auto-generate-articles API:", error);
    return NextResponse.json(
      {
        error: "Failed to auto-generate articles",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
