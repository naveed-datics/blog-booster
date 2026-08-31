import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized } from "@/lib/cronAuth";
import { ensureArticleDraftsTable } from "@/lib/articleDrafts";
import { isInvocationTimeout } from "@/lib/articlePipeline";
import { getCronBaseUrl } from "@/lib/productionBaseUrl";

export const maxDuration = 300;

// Detects quota/rate-limit style failures (Tavily, SerpAPI, Azure OpenAI,
// etc.) from an error message or step list, so the batch can stop early
// instead of burning through every remaining item against a dead quota -
// exactly what happened before this guard existed (10/10 failures in one
// run, all against the same exhausted SerpAPI account).
function looksLikeQuotaError(text) {
  if (!text) return false;
  const t = String(text).toLowerCase();
  return (
    t.includes('isquotaerror') ||
    t.includes('429') ||
    t.includes(' 432') ||
    t.includes('out of searches') ||
    t.includes('insufficient credits') ||
    t.includes('not enough credits') ||
    t.includes('rate limit') ||
    t.includes('quota')
  );
}

// Helper function to get base URL from request
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
  
  // Fallback to environment variables
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

// POST endpoint to automatically generate articles for processing queue
export async function POST(request) {
  try {
    // Check authentication
    if (!(await isAuthorized(request))) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { websiteId, limit = 5 } = body;

    if (!websiteId) {
      return NextResponse.json(
        { error: "websiteId is required" },
        { status: 400 }
      );
    }

    console.log(`Auto-generating articles for website_id: ${websiteId}, limit: ${limit}`);

    await ensureArticleDraftsTable();

    // Get ONLY trends from Processing queue (items without URLs) that do
    // not already have a saved draft. Drafts are published by the
    // retry-publish cron so we never re-run write-blog/humanize for them.
    const trendsResult = await query(
      `SELECT 
        id,
        celebrity_name,
        search_query,
        website_id,
        url
      FROM trends
      WHERE website_id = $1
        AND celebrity_name IS NOT NULL
        AND celebrity_name != ''
        AND (url IS NULL OR url = '' OR TRIM(url) = '')
        AND skip_reason IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM article_drafts d
          WHERE d.website_id = trends.website_id
            AND d.celebrity_name = trends.celebrity_name
            AND d.pipeline_status IN ('draft_ready', 'publishing', 'published')
        )
      ORDER BY created_at ASC
      LIMIT $2`,
      [parseInt(websiteId), parseInt(limit) > 0 ? parseInt(limit) : 1000]
    );

    if (trendsResult.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No trends in processing queue",
        processed: 0,
        results: [],
      });
    }

    console.log(`Found ${trendsResult.rows.length} trends to process`);

    const baseUrl = getBaseUrl(request);
    const cookies = request.headers.get("cookie") || "";
    const cronSecret = request.headers.get("x-cron-secret") || "";
    const results = [];
    let quotaExhausted = false;
    let quotaExhaustedReason = null;
    const deadlineMs = Date.now() + 4 * 60 * 1000;
    
    console.log(`Using base URL: ${baseUrl}`);

    // Process each trend one by one (ONLY Processing tab items - no URLs)
    for (const trend of trendsResult.rows) {
      if (quotaExhausted) {
        console.log(`⏹️ Stopping batch early - quota exhausted (${quotaExhaustedReason}). Remaining items left untouched for the next run.`);
        break;
      }

      if (Date.now() > deadlineMs) {
        console.log("⏹️ Stopping batch early - approaching function timeout. Remaining items stay in the queue.");
        break;
      }

      const celebrityName = trend.celebrity_name;

      // Double-check: This item should NOT have a URL (Processing tab only)
      if (trend.url && trend.url.trim() !== '') {
        console.log(`⚠️ Skipping ${celebrityName} - has URL (should be in Complete/Update tab, not Processing)`);
        continue;
      }
      
      console.log(`[Processing Queue] Generating article for: ${celebrityName} (Processing tab item - no URL)`);

      try {
        // Call the generate-article API internally
        const generateResponse = await fetch(`${baseUrl}/api/generate-article`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookies,
            "x-cron-secret": cronSecret,
          },
          body: JSON.stringify({
            celebrityName,
            websiteId: websiteId,
            trendId: trend.id,
          }),
        });

        if (!generateResponse.ok) {
          const errorText = await generateResponse.text();
          console.error(`Failed to generate article for ${celebrityName}:`, errorText);
          results.push({
            celebrity_name: celebrityName,
            trend_id: trend.id,
            success: false,
            error: `HTTP ${generateResponse.status}: ${errorText.substring(0, 200)}`,
          });
          if (isInvocationTimeout(generateResponse.status, errorText)) {
            console.log("⏹️ Stopping batch early - generate-article timed out.");
            break;
          }
          continue;
        }

        // Check if response is JSON (not HTML error page)
        const contentType = generateResponse.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          const errorText = await generateResponse.text();
          console.error(`Invalid response from generate-article API. Expected JSON but got: ${contentType}`);
          results.push({
            celebrity_name: celebrityName,
            trend_id: trend.id,
            success: false,
            error: `Invalid response format: ${contentType}. Response: ${errorText.substring(0, 200)}`,
          });
          continue;
        }

        const generateData = await generateResponse.json();

        if (generateData.deferred_publish || (generateData.draft_saved && !generateData.success)) {
          results.push({
            celebrity_name: celebrityName,
            trend_id: trend.id,
            success: false,
            deferred_publish: true,
            error: "WordPress publish deferred; draft saved for retry",
          });
          continue;
        }

        if (generateData.success && generateData.result) {
          // Check if WordPress post was created successfully
          const wpData = generateData.result.wordpress;
          let postUrl = null;

          if (wpData && wpData.status === "success" && wpData.post_id) {
            // Fetch the actual post_url from wordpress_posts table
            const wpPostResult = await query(
              `SELECT post_url FROM wordpress_posts 
               WHERE website_id = $1 AND celebrity_name = $2 AND post_id = $3 
               ORDER BY created_at DESC LIMIT 1`,
              [parseInt(websiteId), celebrityName, parseInt(wpData.post_id)]
            );

            if (wpPostResult.rows.length > 0 && wpPostResult.rows[0].post_url) {
              postUrl = wpPostResult.rows[0].post_url;
            } else if (wpData.slug) {
              // Fallback: construct URL from slug
              postUrl = `https://whatreligionisinfo.com/${wpData.slug}/`;
            }

            // Update the trend's URL in the database
            if (postUrl) {
              await query(
                `UPDATE trends 
                 SET url = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [postUrl, trend.id]
              );
              console.log(`✅ Updated trend ${trend.id} with URL: ${postUrl}`);
            }
          }

          results.push({
            celebrity_name: celebrityName,
            trend_id: trend.id,
            success: true,
            wordpress_post_id: wpData?.post_id || null,
            url: postUrl,
          });
        } else {
          const stepErrors = (generateData.steps || [])
            .filter((s) => s.status === "error")
            .map((s) => s.error || "")
            .join(" | ");

          if (looksLikeQuotaError(stepErrors) || looksLikeQuotaError(generateData.error)) {
            quotaExhausted = true;
            quotaExhaustedReason = stepErrors || generateData.error;
          }

          results.push({
            celebrity_name: celebrityName,
            trend_id: trend.id,
            success: false,
            error: generateData.error || "Article generation failed",
            steps: generateData.steps,
          });
        }
      } catch (error) {
        console.error(`Error processing article for ${celebrityName}:`, error);

        if (looksLikeQuotaError(error.message)) {
          quotaExhausted = true;
          quotaExhaustedReason = error.message;
        }

        results.push({
          celebrity_name: celebrityName,
          trend_id: trend.id,
          success: false,
          error: error.message,
        });
      }

      // Add a small delay between processing to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const successCount = results.filter((r) => r.success).length;
    const deferredCount = results.filter((r) => r.deferred_publish).length;
    const failureCount = results.filter((r) => !r.success && !r.deferred_publish).length;

    console.log(`✅ Auto-generation complete: ${successCount} succeeded, ${deferredCount} deferred publish, ${failureCount} failed`);

    return NextResponse.json({
      success: true,
      processed: trendsResult.rows.length,
      attempted: results.length,
      succeeded: successCount,
      deferred_publish: deferredCount,
      failed: failureCount,
      stopped_early_for_quota: quotaExhausted,
      quota_exhausted_reason: quotaExhaustedReason,
      results: results,
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

