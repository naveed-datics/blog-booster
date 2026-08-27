import { NextResponse } from "next/server";
import {
  claimDueDrafts,
  findExistingWordpressPost,
  markPublished,
  postUrlFromWpData,
  schedulePublishRetry,
} from "@/lib/articleDrafts";
import { getCronBaseUrl } from "@/lib/productionBaseUrl";

export const maxDuration = 120;

const PUBLISH_RETRY_LIMIT = 2;

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = getCronBaseUrl();
  const claimed = await claimDueDrafts(PUBLISH_RETRY_LIMIT);
  const results = [];

  for (const draft of claimed) {
    const celebrityName = draft.celebrity_name;
    const websiteId = draft.website_id;

    try {
      const existing = await findExistingWordpressPost(websiteId, celebrityName);
      if (existing?.post_url || existing?.slug) {
        const postUrl =
          existing.post_url ||
          (existing.slug ? `https://whatreligionisinfo.com/${existing.slug}/` : null);
        await markPublished({
          websiteId,
          celebrityName,
          trendId: draft.trend_id,
          postUrl,
        });
        results.push({
          celebrity_name: celebrityName,
          success: true,
          recovered_existing: true,
          url: postUrl,
        });
        continue;
      }

      const wpResponse = await fetch(`${baseUrl}/api/wp-create-post`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({
          post_content: draft.draft_html,
          keyword: celebrityName,
          website_id: websiteId,
          image_url: draft.image_url || null,
        }),
      });

      const errorText = wpResponse.ok ? "" : await wpResponse.text();
      const wpData = wpResponse.ok ? await wpResponse.json() : null;

      if (!wpResponse.ok || wpData?.status !== "success") {
        const message =
          errorText || wpData?.error || wpData?.message || "WordPress publish failed";
        await schedulePublishRetry({
          websiteId,
          celebrityName,
          error: message,
          status: wpResponse.status,
        });
        results.push({
          celebrity_name: celebrityName,
          success: false,
          deferred: true,
          error: String(message).substring(0, 300),
        });
        continue;
      }

      const postUrl = postUrlFromWpData(wpData);
      await markPublished({
        websiteId,
        celebrityName,
        trendId: draft.trend_id,
        postUrl,
      });

      try {
        const saveResponse = await fetch(`${baseUrl}/api/wordpress-posts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": cronSecret,
          },
          body: JSON.stringify({
            website_id: websiteId,
            celebrity_name: celebrityName,
            post_title: wpData.title || draft.draft_title || celebrityName,
            post_id: wpData.post_id,
            post_url: postUrl,
            image_url: wpData.image_url || draft.image_url || null,
            content: draft.draft_html,
            slug: wpData.slug || null,
            meta_description: wpData.meta_description || null,
          }),
        });
        if (!saveResponse.ok) {
          console.error(
            `[cron/retry-publish] wordpress-posts save failed for ${celebrityName}:`,
            await saveResponse.text()
          );
        }
      } catch (saveError) {
        console.error(
          `[cron/retry-publish] wordpress-posts save error for ${celebrityName}:`,
          saveError
        );
      }

      results.push({
        celebrity_name: celebrityName,
        success: true,
        wordpress_post_id: wpData.post_id || null,
        url: postUrl,
      });
    } catch (error) {
      console.error(`[cron/retry-publish] Error for ${celebrityName}:`, error);
      await schedulePublishRetry({
        websiteId,
        celebrityName,
        error: error.message,
        status: 500,
      });
      results.push({
        celebrity_name: celebrityName,
        success: false,
        deferred: true,
        error: error.message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    claimed: claimed.length,
    attempted: results.length,
    succeeded: results.filter((r) => r.success).length,
    deferred: results.filter((r) => r.deferred).length,
    results,
  });
}
