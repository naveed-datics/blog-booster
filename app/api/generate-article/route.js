import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cronAuth";
import {
  findTrendIdForCelebrity,
  markPublished,
  saveDraft,
  schedulePublishRetry,
} from "@/lib/articleDrafts";
import { getCronBaseUrl } from "@/lib/productionBaseUrl";
import { lookupPerson } from "@/lib/personLookup";
import { resolveAction, shouldRunCreateNewGates } from "@/lib/personPageRouter";
import { assertPublishQuota } from "@/lib/publishQuota";
import { runPipelineGates } from "@/lib/pipelineGates";
import { queueForReview } from "@/lib/reviewQueue";
import { loadRecoveryLoosenedFromDb } from "@/lib/gscRecoverySignal";
import { markTrendSkipped, SKIP_STAGE } from "@/lib/skipReason";
import { query } from "@/lib/db";

export const maxDuration = 300;

function getBaseUrl(request) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret");
  if (cronSecret && providedSecret && providedSecret === cronSecret) {
    return getCronBaseUrl();
  }

  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ||
                   (request.headers.get("x-forwarded-ssl") === "on" ? "https" : "http");

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

// POST endpoint to generate article using the research -> write -> publish
// pipeline. No human review step: an article that passes every automated
// check (sourced answer found, checklist passed, no duplicate) publishes
// live immediately. Anything that fails a check is skipped and logged via
// markTrendSkipped() with a stage-prefixed reason instead of being created
// as a WordPress draft awaiting manual review - it is never re-queued
// (auto-generate-articles filters skip_reason IS NULL), since re-running
// the same failed research wouldn't produce a different, honest outcome.
//
// Image search only happens AFTER the article is written, checklisted, and
// actually about to be created in WordPress (see lib/wpPost.js) - this
// used to run first, burning an image-search API call on every candidate
// even when most of them never reach publication.
export async function POST(request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      celebrityName,
      websiteId,
      trendId: requestedTrendId,
      bulkRemediation = false,
      pipelineActionOverride = null,
      skipGates = false,
    } = body;

    if (!celebrityName || !celebrityName.trim()) {
      return NextResponse.json(
        { error: "celebrityName is required" },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl(request);
    const steps = [];
    let finalResult = null;
    let skippedResult = null;
    let deferredPublish = false;
    let draftSaved = false;
    let pipelineTrendId = requestedTrendId || null;

    const cookies = request.headers.get("cookie") || "";
    const cronSecret = request.headers.get("x-cron-secret") || "";

    console.log(`[Generate Article] Using base URL: ${baseUrl} for celebrity: ${celebrityName}`);

    async function resolveTrendId() {
      if (pipelineTrendId) return pipelineTrendId;
      if (!websiteId) return null;
      try {
        pipelineTrendId = await findTrendIdForCelebrity(websiteId, celebrityName);
      } catch (error) {
        console.error("Failed to resolve trend id:", error);
      }
      return pipelineTrendId;
    }

    async function queueReview(failedGate, gateDetail, proposedAction) {
      const trendId = await resolveTrendId();
      await queueForReview({
        websiteId,
        trendId,
        celebrityName,
        failedGate,
        gateDetail,
        proposedAction,
      });
      skippedResult = { stage: "review_queue", detail: failedGate, gateDetail };
    }

    async function skip(stage, detail) {
      const trendId = await resolveTrendId();
      await markTrendSkipped({ trendId, stage, detail });
      skippedResult = { stage, detail };
    }

    try {
      if (websiteId) {
        await loadRecoveryLoosenedFromDb(websiteId);
      }

      // Step 0: Person lookup + router
      steps.push({ step: "Person lookup...", status: "in_progress" });
      const lookup = websiteId
        ? await lookupPerson(websiteId, celebrityName)
        : { match: "none" };
      const resolved = pipelineActionOverride
        ? { action: pipelineActionOverride, postId: lookup.postId, reason: "override" }
        : resolveAction(lookup);
      steps.push({
        step: "Router action resolved",
        status: "completed",
        data: { lookup, resolved },
      });

      const quota = await assertPublishQuota(websiteId, resolved.action, {
        bulkRemediation,
      });
      if (!quota.allowed) {
        steps.push({ step: "Quota deferred", status: "completed", data: quota });
        return NextResponse.json({
          success: false,
          deferred: true,
          defer_reason: quota.reason,
          pipeline_action: resolved.action,
          celebrityName,
          steps,
        });
      }

      if (resolved.action === "consolidate") {
        steps.push({
          step: "Consolidate required",
          status: "completed",
          data: { canonical: resolved.canonical, duplicate: resolved.duplicate },
        });
        await queueReview("consolidate_pending", resolved, "consolidate");
        throw { handled: true };
      }

      if (shouldRunCreateNewGates(resolved) && !skipGates) {
        let gateEvidence = null;
        const trendId = await resolveTrendId();
        if (trendId) {
          const tr = await query(
            `SELECT gate_evidence FROM trends WHERE id = $1`,
            [trendId]
          );
          gateEvidence = tr.rows[0]?.gate_evidence || null;
        }
        const gates = await runPipelineGates(celebrityName, {
          gateEvidence: gateEvidence || undefined,
        });
        steps.push({ step: "Pipeline gates", status: "completed", data: gates });
        if (!gates.passed) {
          await queueForReview({
            websiteId,
            trendId: await resolveTrendId(),
            celebrityName,
            failedGate: gates.failures[0]?.gate || "gates",
            gateDetail: { failures: gates.failures, evidence: gates.evidence },
            spikeTier: gates.spikeTier,
            proposedAction: resolved.action,
          });
          skippedResult = { stage: "review_queue", detail: gates.failures };
          throw { handled: true };
        }
      }

      const pipelineAction = resolved.action;
      const existingPostId = resolved.postId || lookup.postId;

      // Step 1: Find Sources
      steps.push({ step: "Finding sources...", status: "in_progress" });
      const findSourcesResponse = await fetch(
        `${baseUrl}/api/find-sources?q=${encodeURIComponent(celebrityName)}`,
        {
          headers: {
            Cookie: cookies,
            "x-cron-secret": cronSecret,
          },
        }
      );

      if (!findSourcesResponse.ok) {
        const errorText = await findSourcesResponse.text();
        steps.push({ step: "Found sources", status: "error", error: errorText.substring(0, 300) });
        await skip(SKIP_STAGE.FETCH_SOURCES_FAILED, `${findSourcesResponse.status} ${errorText.substring(0, 200)}`);
        throw { handled: true };
      }

      const contentType = findSourcesResponse.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const errorText = await findSourcesResponse.text();
        await skip(SKIP_STAGE.FETCH_SOURCES_FAILED, `non-JSON response: ${errorText.substring(0, 200)}`);
        throw { handled: true };
      }

      const sourcesData = await findSourcesResponse.json();
      steps.push({ step: "Found sources", status: "completed", data: sourcesData });

      const urls = Array.isArray(sourcesData.sources) && sourcesData.sources.length > 0
        ? sourcesData.sources.filter(Boolean)
        : [sourcesData.wikipedia, sourcesData.religionURL, sourcesData.religion].filter(Boolean);

      if (urls.length === 0) {
        steps.push({ step: "Fetched content", status: "error", error: "No source URLs found" });
        await skip(SKIP_STAGE.FETCH_SOURCES_FAILED, "no source URLs returned");
        throw { handled: true };
      }

      // Step 2: Fetch Content from all URLs
      steps.push({ step: "Fetching content from URLs...", status: "in_progress" });
      const fetchContentResponse = await fetch(`${baseUrl}/api/fetch-content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies,
          "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({ urls }),
      });

      if (!fetchContentResponse.ok) {
        const errorText = await fetchContentResponse.text();
        steps.push({ step: "Fetched content", status: "error", error: errorText.substring(0, 300) });
        await skip(SKIP_STAGE.FETCH_CONTENT_FAILED, `${fetchContentResponse.status} ${errorText.substring(0, 200)}`);
        throw { handled: true };
      }

      const fetchContentType = fetchContentResponse.headers.get("content-type") || "";
      if (!fetchContentType.includes("application/json")) {
        const errorText = await fetchContentResponse.text();
        await skip(SKIP_STAGE.FETCH_CONTENT_FAILED, `non-JSON response: ${errorText.substring(0, 200)}`);
        throw { handled: true };
      }

      const contentData = await fetchContentResponse.json();
      steps.push({ step: "Fetched content", status: "completed", data: contentData });

      const combinedContent = contentData.results
        .filter((r) => r.success && r.content)
        .map((r) => r.content)
        .join("\n\n");

      if (!combinedContent) {
        steps.push({ step: "Fetched content", status: "error", error: "All source fetches failed" });
        await skip(SKIP_STAGE.FETCH_CONTENT_FAILED, "all source URLs failed to fetch or returned no content");
        throw { handled: true };
      }

      // Step 3: Extract a structured, sourced answer BEFORE writing - never
      // write (or publish) a page whose honest answer is "not publicly
      // known".
      steps.push({ step: "Extracting sourced answer...", status: "in_progress" });
      const extractAnswerResponse = await fetch(`${baseUrl}/api/extract-answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies,
          "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({
          celebrityName,
          combinedContent,
          sourceDetails: sourcesData.sourceDetails || [],
        }),
      });

      if (!extractAnswerResponse.ok) {
        const errorText = await extractAnswerResponse.text();
        steps.push({ step: "Answer extracted", status: "error", error: errorText.substring(0, 300) });
        await skip(SKIP_STAGE.NO_ANSWER, `extract-answer request failed: ${extractAnswerResponse.status}`);
        throw { handled: true };
      }

      const answerData = await extractAnswerResponse.json();
      steps.push({ step: "Answer extracted", status: "completed", data: answerData });

      if (!answerData.hasPublicAnswer) {
        steps.push({ step: "Skipped: no public answer found", status: "completed" });
        await skip(SKIP_STAGE.NO_ANSWER, "no confident, sourced public answer found in fetched content");
        throw { handled: true };
      }

      let humanizedContent = "";
      let blogTitle = celebrityName;

      if (pipelineAction === "light-update") {
        steps.push({
          step: "Light update — skipping full write",
          status: "completed",
        });
        humanizedContent = "";
      } else {
      // Step 4: Write Blog
      steps.push({ step: "Generating blog post...", status: "in_progress" });
      let writeBlogUrl = `${baseUrl}/api/write-blog?keyword=${encodeURIComponent(celebrityName)}`;
      if (websiteId) {
        writeBlogUrl += `&website_id=${encodeURIComponent(websiteId)}`;
      }
      const writeBlogResponse = await fetch(writeBlogUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies,
          "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({
          keyword: celebrityName,
          content: combinedContent,
          answer: answerData,
        }),
      });

      if (!writeBlogResponse.ok) {
        const errorText = await writeBlogResponse.text();
        steps.push({ step: "Blog post generated", status: "error", error: errorText.substring(0, 300) });
        await skip(SKIP_STAGE.WRITE_FAILED, `${writeBlogResponse.status} ${errorText.substring(0, 200)}`);
        throw { handled: true };
      }

      const blogData = await writeBlogResponse.json();
      steps.push({ step: "Blog post generated", status: "completed", data: blogData });

      if (!blogData.blog_post || !blogData.blog_post.content) {
        await skip(SKIP_STAGE.WRITE_FAILED, "write-blog returned no content");
        throw { handled: true };
      }

      // Step 5: Humanize
      steps.push({ step: "Humanizing content...", status: "in_progress" });
      const humanizeResponse = await fetch(`${baseUrl}/api/humanize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies,
          "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({
          html: blogData.blog_post.content,
          call_ai: true,
        }),
      });

      if (!humanizeResponse.ok) {
        const errorText = await humanizeResponse.text();
        throw new Error(`Failed to humanize content: ${humanizeResponse.status} ${humanizeResponse.statusText}. ${errorText.substring(0, 200)}`);
      }

      const humanizedData = await humanizeResponse.json();
      steps.push({
        step: "Content humanized",
        status: "completed",
        data: humanizedData,
      });

      const humanizedContentInner = humanizedData.humanized_html || blogData.blog_post.content;
      humanizedContent = humanizedContentInner;
      blogTitle = blogData.blog_post.title || celebrityName;
      }

      if (pipelineAction !== "light-update") {
      // Persist the finished article before WordPress so a 504/500 on post
      // create can retry publish without re-running sources, extraction,
      // write-blog, or humanize. No image is attached yet - that only
      // happens inside wp-create-post, after the checklist has already
      // decided this article is actually going to publish.
      if (websiteId) {
        try {
          await resolveTrendId();
          const saved = await saveDraft({
            websiteId,
            celebrityName,
            trendId: pipelineTrendId,
            draftHtml: humanizedContent,
            draftTitle: blogTitle,
            imageUrl: null,
            answer: answerData,
          });
          draftSaved = Boolean(saved);
          steps.push({
            step: "Draft saved for publish retry",
            status: "completed",
          });
        } catch (draftError) {
          console.error("Failed to save article draft:", draftError);
          steps.push({
            step: "Draft save failed",
            status: "error",
            error: draftError.message,
          });
        }
      }
      }

      // Step 6: Create or update WordPress post
      steps.push({ step: "Creating WordPress post...", status: "in_progress" });
      const wpUrl = `${baseUrl}/api/wp-create-post`;
      const wpResponse = await fetch(wpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies,
          "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({
          post_content: humanizedContent,
          keyword: celebrityName,
          website_id: websiteId || null,
          answer: answerData,
          pipeline_action: pipelineAction,
          post_id: existingPostId || null,
          bulk_remediation: bulkRemediation,
        }),
      });

      if (!wpResponse.ok) {
        const errorText = await wpResponse.text();
        const wpError = `Failed to create WordPress post: ${wpResponse.status} ${wpResponse.statusText}. ${errorText.substring(0, 200)}`;
        steps.push({
          step: "WordPress post created",
          status: "error",
          error: wpError,
        });
        if (draftSaved) {
          await schedulePublishRetry({
            websiteId,
            celebrityName,
            error: wpError,
            status: wpResponse.status,
          });
          deferredPublish = true;
        } else {
          throw new Error(wpError);
        }
      } else {
        const wpData = await wpResponse.json();

        if (wpData.status === "skipped") {
          // wp-create-post itself declined to publish (duplicate or
          // checklist failure) - no post was created, so there's nothing to
          // retry. Log and mark the trend skipped the same as any other
          // automatic skip.
          steps.push({
            step: "Skipped by publish gate",
            status: "completed",
            data: wpData,
          });
          await skip(
            wpData.skip_stage === "duplicate" ? SKIP_STAGE.DUPLICATE : SKIP_STAGE.CHECKLIST_FAILED,
            wpData.skip_detail
          );
        } else {
          steps.push({
            step: "WordPress post created",
            status: wpData.status === "success" ? "completed" : "error",
            error: wpData.status !== "success" ? (wpData.error || wpData.message || "Unknown error") : undefined,
            data: wpData,
          });

          if (wpData.status === "success") {
            const postUrl = wpData.link || (wpData.slug ? `https://whatreligionisinfo.com/${wpData.slug}/` : null);

            if (websiteId && pipelineAction) {
              try {
                await query(
                  `UPDATE trends SET pipeline_action = $1, url = COALESCE($2, url), updated_at = NOW()
                   WHERE website_id = $3 AND celebrity_name = $4 AND id = COALESCE($5, id)`,
                  [
                    pipelineAction,
                    postUrl,
                    parseInt(websiteId),
                    celebrityName,
                    pipelineTrendId,
                  ]
                );
              } catch (e) {
                console.error("Failed to record pipeline_action:", e);
              }
            }

            if (websiteId) {
              try {
                await markPublished({
                  websiteId,
                  celebrityName,
                  trendId: pipelineTrendId,
                  postUrl,
                });
              } catch (markError) {
                console.error("Failed to mark draft published:", markError);
              }
            }

            finalResult = {
              title: blogTitle,
              content: humanizedContent,
              imageUrl: wpData.image_url || null,
              sources: sourcesData,
              wordpress: wpData,
            };
          } else if (draftSaved) {
            await schedulePublishRetry({
              websiteId,
              celebrityName,
              error: wpData.error || wpData.message || "WordPress publish failed",
              status: 500,
            });
            deferredPublish = true;
          }
        }
      }
    } catch (error) {
      if (error && error.handled) {
        // Already logged via skip() above - nothing more to do.
      } else {
        console.error("Error in generate-article flow:", error);
        steps.push({
          step: "Error occurred",
          status: "error",
          error: error.message,
        });
        if (draftSaved && !deferredPublish) {
          try {
            await schedulePublishRetry({
              websiteId,
              celebrityName,
              error: error.message,
              status: 500,
            });
            deferredPublish = true;
          } catch (retryError) {
            console.error("Failed to schedule publish retry:", retryError);
          }
        }
      }
    }

    return NextResponse.json({
      success: finalResult !== null,
      skipped: skippedResult !== null,
      skip_reason: skippedResult,
      celebrityName,
      draft_saved: draftSaved,
      deferred_publish: deferredPublish,
      steps,
      result: finalResult,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Error in generate-article API:", error);
    return NextResponse.json(
      {
        error: "Failed to generate article",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
