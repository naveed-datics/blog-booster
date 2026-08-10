import { NextResponse } from "next/server";

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

function getBaseUrl(request) {
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  if (host) {
    return `${protocol}://${host}`;
  }
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = getBaseUrl(request);
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
    summary.trend_search = await trendResponse.json();

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
      throw new Error(
        `auto-generate-articles failed: ${autoGenResponse.status} ${errorText.substring(0, 300)}`
      );
    }
    summary.auto_generate = await autoGenResponse.json();

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
      throw new Error(
        `update-stale-articles failed: ${refreshResponse.status} ${errorText.substring(0, 300)}`
      );
    }
    summary.refresh_stale = await refreshResponse.json();
  } catch (error) {
    console.error("[cron/daily-articles] Error:", error);
    summary.error = error.message;
  }

  summary.finished_at = new Date().toISOString();
  console.log("[cron/daily-articles] Summary:", JSON.stringify(summary));

  return NextResponse.json(summary, {
    status: summary.error ? 500 : 200,
  });
}
