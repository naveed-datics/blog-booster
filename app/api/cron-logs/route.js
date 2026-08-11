import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized } from "@/lib/cronAuth";

const DEFAULT_LIMIT = 30;

// Read-only endpoint for the AI Dashboard's cron log tab. Returns the most
// recent daily-articles cron runs for a website, newest first, so the
// review can be async instead of requiring a live check each time.
export async function GET(request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("website_id");
  const limit = Math.min(
    parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    100
  );

  if (!websiteId) {
    return NextResponse.json({ error: "website_id is required" }, { status: 400 });
  }

  try {
    const result = await query(
      `SELECT id, website_id, started_at, finished_at, success, error_message,
              new_articles_count, refreshed_articles_count, trends_found_count,
              summary, created_at
       FROM cron_run_logs
       WHERE website_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [websiteId, limit]
    );

    return NextResponse.json({ logs: result.rows });
  } catch (error) {
    // Table may not exist yet if the cron has never run since this feature
    // shipped - treat that as an empty log list rather than an error.
    if (error.code === "42P01") {
      return NextResponse.json({ logs: [] });
    }
    console.error("Error fetching cron run logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch cron run logs", message: error.message },
      { status: 500 }
    );
  }
}
