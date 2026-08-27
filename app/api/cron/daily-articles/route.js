import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isInvocationTimeout } from "@/lib/articlePipeline";
import { getCronBaseUrl } from "@/lib/productionBaseUrl";

export const maxDuration = 300;

// Table may not exist yet on a fresh deploy (created lazily here instead of
// requiring a separate manual migration step before this route can log a
// run) - cheap no-op once the table is present.
const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS cron_run_logs (
    id SERIAL PRIMARY KEY,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    new_articles_count INTEGER DEFAULT 0,
    refreshed_articles_count INTEGER DEFAULT 0,
    trends_found_count INTEGER DEFAULT 0,
    summary JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_cron_run_logs_website_id ON cron_run_logs(website_id);
  CREATE INDEX IF NOT EXISTS idx_cron_run_logs_started_at ON cron_run_logs(started_at DESC);
`;

async function logRun(summary) {
  try {
    await query(ENSURE_TABLE_SQL);
    await query(
      `INSERT INTO cron_run_logs
        (website_id, started_at, finished_at, success, error_message,
         new_articles_count, refreshed_articles_count, trends_found_count, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        summary.website_id,
        summary.started_at,
        summary.finished_at,
        !summary.error,
        summary.error,
        summary.auto_generate?.succeeded ?? 0,
        summary.refresh_stale?.updated ?? 0,
        summary.trend_search?.saved_count ?? 0,
        JSON.stringify(summary),
      ]
    );
  } catch (logError) {
    // Logging failures must never take down the actual cron run.
    console.error("[cron/daily-articles] Failed to write run log:", logError);
  }
}

// Daily cron entry point: trend-search (find new trending celebrities) then
// auto-generate-articles (write + publish up to DAILY_ARTICLE_LIMIT of them).
//
// Triggered by Vercel Cron (see vercel.json). Vercel automatically sends
// `Authorization: Bearer ${CRON_SECRET}` on cron-triggered requests when
// CRON_SECRET is set as an env var - we verify that here, then forward our
// own `x-cron-secret` header to the downstream routes so the whole chain
// (which all check for either a session cookie or that header) authorizes
// without ever needing a login session.

const DAILY_ARTICLE_LIMIT = 10;
const DAILY_REFRESH_LIMIT = 5; // stale-but-trending existing articles to refresh/day
const TARGET_WEBSITE_ID = 1; // whatreligionisinfo.com

// Hardcoded on purpose - do NOT derive this from the request's host
// header, and do NOT fall back to NEXT_PUBLIC_BASE_URL. Both were tried
// and both caused real failures:
//   - host-header-derived: if this route is ever invoked via a
//     deployment-specific preview URL (which has Vercel's SSO/deployment
//     protection enabled), every internal fetch hits that SSO gate
//     instead of the real API and gets back an HTML login page, crashing
//     with "Unexpected token '<' ... is not valid JSON".
//   - NEXT_PUBLIC_BASE_URL fallback: that env var is set in this project
//     for an unrelated purpose (likely client-side use) and does not
//     point at a URL this server-side route can actually reach - using
//     it as a fallback caused every internal call to fail instantly with
//     a low-level "fetch failed" (bad host/unreachable URL), even though
//     calling the same routes directly from outside works fine.
// This route's internal calls must always hit the real production
// domain, independent of both of the above.
function getBaseUrl() {
  return getCronBaseUrl();
}

// Defense-in-depth: even with getBaseUrl() fixed, parse failures should
// produce a clear, actionable message rather than a bare
// "Unexpected token '<' ... is not valid JSON" SyntaxError - that message
// alone gives no hint of WHERE the HTML came from. Checking content-type
// before parsing catches this class of failure regardless of cause.
async function parseJsonOrThrow(response, label) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const bodyText = await response.text();
    throw new Error(
      `${label} returned non-JSON response (content-type: "${contentType}", status: ${response.status}). ` +
      `First 200 chars: ${bodyText.substring(0, 200)}`
    );
  }
  return response.json();
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = getBaseUrl();
  const summary = {
    started_at: new Date().toISOString(),
    website_id: TARGET_WEBSITE_ID,
    trend_search: null,
    auto_generate: null,
    refresh_stale: null,
    error: null,
  };

  try {
    // Step 1: pull fresh trending celebrities into the processing queue.
    const trendSearchUrl = `${baseUrl}/api/trend-search?q=religion&website_id=${TARGET_WEBSITE_ID}`;
    const trendResponse = await fetch(trendSearchUrl, {
      headers: { "x-cron-secret": cronSecret },
    });

    if (!trendResponse.ok) {
      const errorText = await trendResponse.text();
      throw new Error(
        `trend-search failed: ${trendResponse.status} ${errorText.substring(0, 300)}`
      );
    }
    summary.trend_search = await parseJsonOrThrow(trendResponse, "trend-search");

    // Step 2: generate + publish articles for whatever is now in the queue,
    // capped at DAILY_ARTICLE_LIMIT for the day.
    const autoGenResponse = await fetch(`${baseUrl}/api/auto-generate-articles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
      },
      body: JSON.stringify({
        websiteId: TARGET_WEBSITE_ID,
        limit: DAILY_ARTICLE_LIMIT,
      }),
    });

    if (!autoGenResponse.ok) {
      const errorText = await autoGenResponse.text();
      if (isInvocationTimeout(autoGenResponse.status, errorText)) {
        summary.auto_generate = {
          timeout: true,
          deferred: true,
          error: errorText.substring(0, 300),
        };
        console.warn(
          "[cron/daily-articles] auto-generate-articles timed out; drafts (if saved) will be published by retry-publish. Continuing to stale refresh."
        );
      } else {
        throw new Error(
          `auto-generate-articles failed: ${autoGenResponse.status} ${errorText.substring(0, 300)}`
        );
      }
    } else {
      summary.auto_generate = await parseJsonOrThrow(autoGenResponse, "auto-generate-articles");
    }

    // Step 3: refresh existing articles that are both currently trending
    // again AND stale, so that search interest we'd otherwise waste (the
    // duplicate check in step 1 skips writing a new article for these)
    // still gets captured. No separate reindex call needed here - Rank
    // Math's Instant Indexing module already auto-submits updated URLs.
    const refreshUrl = `${baseUrl}/api/update-stale-articles?website_id=${TARGET_WEBSITE_ID}&limit=${DAILY_REFRESH_LIMIT}`;
    const refreshResponse = await fetch(refreshUrl, {
      headers: { "x-cron-secret": cronSecret },
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      if (isInvocationTimeout(refreshResponse.status, errorText)) {
        summary.refresh_stale = {
          timeout: true,
          error: errorText.substring(0, 300),
        };
      } else {
        throw new Error(
          `update-stale-articles failed: ${refreshResponse.status} ${errorText.substring(0, 300)}`
        );
      }
    } else {
      summary.refresh_stale = await parseJsonOrThrow(refreshResponse, "update-stale-articles");
    }
  } catch (error) {
    console.error("[cron/daily-articles] Error:", error);
    summary.error = error.message;
  }

  summary.finished_at = new Date().toISOString();
  console.log("[cron/daily-articles] Summary:", JSON.stringify(summary));

  await logRun(summary);

  return NextResponse.json(summary, {
    status: summary.error ? 500 : 200,
  });
}
