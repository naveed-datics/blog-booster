import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized } from "@/lib/cronAuth";
import { auth } from "@/lib/auth";

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

// DELETE - Clear this website's cron run history.
//
// Session-only (not isAuthorized) so a shared pipeline API key cannot
// destroy the run log it writes to.
export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const websiteId = parseInt(searchParams.get("website_id"), 10);

    if (!Number.isInteger(websiteId) || websiteId <= 0) {
      return NextResponse.json(
        { error: "A numeric website_id is required" },
        { status: 400 }
      );
    }

    const result = await query(
      "DELETE FROM cron_run_logs WHERE website_id = $1 RETURNING id",
      [websiteId]
    );

    return NextResponse.json({
      message: `Deleted ${result.rowCount} cron log(s)`,
      deleted: result.rowCount,
    });
  } catch (error) {
    console.error("Error deleting cron logs:", error);
    return NextResponse.json(
      { error: "Failed to delete cron logs", details: error.message },
      { status: 500 }
    );
  }
}
