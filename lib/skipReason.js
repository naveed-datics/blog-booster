import { query } from "@/lib/db";

// Standardized stage prefixes for trends.skip_reason, so failures are
// greppable/filterable by where in the pipeline they happened without a
// schema change. Every automatic skip (no human review needed) goes
// through here so the reason is always visible and consistently shaped.
export const SKIP_STAGE = {
  FETCH_SOURCES_FAILED: "fetch-sources-failed",
  FETCH_CONTENT_FAILED: "fetch-content-failed",
  NO_ANSWER: "no-answer",
  WRITE_FAILED: "write-failed",
  CHECKLIST_FAILED: "checklist-failed",
  DUPLICATE: "duplicate",
  PUBLISH_ERROR: "publish-error",
};

// Marks a trend as permanently skipped so auto-generate-articles's queue
// query (which filters `skip_reason IS NULL`) never re-processes it. Used
// for outcomes that re-running the pipeline wouldn't change (no public
// answer, a genuine duplicate) as well as ones that failed hard enough
// this run that we'd rather log and move on than retry indefinitely with
// no distinction from a fresh attempt.
export async function markTrendSkipped({ trendId, stage, detail }) {
  if (!trendId) {
    console.warn(`Cannot mark trend skipped (no trendId) - stage: ${stage}, detail: ${detail}`);
    return false;
  }
  const reason = detail ? `${stage}: ${detail}` : stage;
  try {
    await query(
      `UPDATE trends SET skip_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [reason.substring(0, 1000), trendId]
    );
    console.log(`⏭️ Trend ${trendId} skipped - ${reason}`);
    return true;
  } catch (error) {
    console.error(`Failed to mark trend ${trendId} skipped:`, error);
    return false;
  }
}
