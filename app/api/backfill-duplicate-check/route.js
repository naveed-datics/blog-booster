import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized } from "@/lib/cronAuth";
import { searchCelebrityUrl } from "@/lib/duplicateCheck";

// One-time (repeatable) cleanup for a real gap: trend-search's duplicate
// check only applies to NEW trends going forward. Any "Processing" queue
// entry (url IS NULL) that existed before that check shipped was never
// re-validated, and auto-generate-articles has no idea it should skip
// them - it just sees url IS NULL and processes them normally. This is
// exactly what caused a second duplicate-publishing incident: 7 posts
// published from old backlog entries, all duplicates of posts from
// months earlier, despite the duplicate check working correctly for
// anything added after it shipped.
//
// Run this BEFORE re-enabling the cron after any gap in duplicate
// checking, and periodically if trends can be added to the queue through
// any path that doesn't go through trend-search's check.

const DEFAULT_BATCH_SIZE = 50;

export async function GET(request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const websiteId = parseInt(searchParams.get("website_id")) || null;
  const batchSize = parseInt(searchParams.get("batch_size")) || DEFAULT_BATCH_SIZE;

  if (!websiteId) {
    return NextResponse.json({ error: "website_id is required" }, { status: 400 });
  }

  // Distinct celebrity names still sitting in the queue with no URL,
  // regardless of how old - this is the whole point of a backfill.
  const totalResult = await query(
    `SELECT DISTINCT celebrity_name
     FROM trends
     WHERE website_id = $1
       AND celebrity_name IS NOT NULL AND celebrity_name != ''
       AND (url IS NULL OR url = '' OR TRIM(url) = '')`,
    [websiteId]
  );

  const allNames = totalResult.rows.map((r) => r.celebrity_name);
  const batch = allNames.slice(0, batchSize);

  const results = [];
  let markedDuplicate = 0;

  for (const celebrityName of batch) {
    try {
      const existingUrl = await searchCelebrityUrl(celebrityName);

      if (existingUrl) {
        await query(
          `UPDATE trends
           SET url = $1, updated_at = CURRENT_TIMESTAMP
           WHERE website_id = $2
             AND celebrity_name = $3
             AND (url IS NULL OR url = '' OR TRIM(url) = '')`,
          [existingUrl, websiteId, celebrityName]
        );
        markedDuplicate++;
        results.push({ celebrity_name: celebrityName, duplicate_of: existingUrl });
      } else {
        results.push({ celebrity_name: celebrityName, duplicate_of: null });
      }
    } catch (error) {
      console.error(`Backfill check error for "${celebrityName}":`, error);
      results.push({ celebrity_name: celebrityName, error: error.message });
    }
  }

  return NextResponse.json({
    success: true,
    total_names_in_backlog: allNames.length,
    checked_this_run: batch.length,
    remaining_after_this_run: allNames.length - batch.length,
    marked_as_duplicate: markedDuplicate,
    results,
  });
}
