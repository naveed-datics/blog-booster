import { query } from "@/lib/db";
import {
  MAX_PUBLISH_ATTEMPTS,
  PIPELINE_STATUS,
  isRetryablePublishError,
  nextRetryAt,
} from "@/lib/articlePipeline";

const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS article_drafts (
    id SERIAL PRIMARY KEY,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    trend_id INTEGER REFERENCES trends(id) ON DELETE SET NULL,
    celebrity_name TEXT NOT NULL,
    draft_html TEXT NOT NULL,
    draft_title TEXT,
    image_url TEXT,
    pipeline_status VARCHAR(32) NOT NULL DEFAULT 'draft_ready',
    last_error TEXT,
    retry_after TIMESTAMP WITH TIME ZONE,
    publish_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, celebrity_name)
  );
  CREATE INDEX IF NOT EXISTS idx_article_drafts_status_retry
    ON article_drafts (pipeline_status, retry_after);
  CREATE INDEX IF NOT EXISTS idx_article_drafts_website
    ON article_drafts (website_id);
`;

let ensured = false;

export async function ensureArticleDraftsTable() {
  if (ensured) return;
  await query(ENSURE_TABLE_SQL);
  ensured = true;
}

export async function saveDraft({
  websiteId,
  celebrityName,
  trendId,
  draftHtml,
  draftTitle,
  imageUrl,
}) {
  if (!websiteId || !celebrityName || !draftHtml) return null;
  await ensureArticleDraftsTable();

  const firstRetry = nextRetryAt(0);

  const result = await query(
    `INSERT INTO article_drafts
       (website_id, trend_id, celebrity_name, draft_html, draft_title, image_url,
        pipeline_status, last_error, retry_after, publish_attempts, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, 0, NOW())
     ON CONFLICT (website_id, celebrity_name)
     DO UPDATE SET
       trend_id = COALESCE(EXCLUDED.trend_id, article_drafts.trend_id),
       draft_html = EXCLUDED.draft_html,
       draft_title = EXCLUDED.draft_title,
       image_url = EXCLUDED.image_url,
       pipeline_status = EXCLUDED.pipeline_status,
       last_error = NULL,
       retry_after = EXCLUDED.retry_after,
       publish_attempts = 0,
       updated_at = NOW()
     WHERE article_drafts.pipeline_status <> 'published'
     RETURNING *`,
    [
      parseInt(websiteId, 10),
      trendId ? parseInt(trendId, 10) : null,
      celebrityName.trim(),
      draftHtml,
      draftTitle || celebrityName.trim(),
      imageUrl || null,
      PIPELINE_STATUS.PUBLISHING,
      firstRetry,
    ]
  );

  return result.rows[0] || null;
}

export async function findTrendIdForCelebrity(websiteId, celebrityName) {
  if (!websiteId || !celebrityName) return null;
  const result = await query(
    `SELECT id FROM trends
     WHERE website_id = $1
       AND celebrity_name = $2
       AND (url IS NULL OR url = '' OR TRIM(url) = '')
     ORDER BY created_at ASC
     LIMIT 1`,
    [parseInt(websiteId, 10), celebrityName.trim()]
  );
  return result.rows[0]?.id || null;
}

export async function schedulePublishRetry({
  websiteId,
  celebrityName,
  error,
  status,
}) {
  if (!websiteId || !celebrityName) return null;
  await ensureArticleDraftsTable();

  const existing = await query(
    `SELECT publish_attempts FROM article_drafts
     WHERE website_id = $1 AND celebrity_name = $2`,
    [parseInt(websiteId, 10), celebrityName.trim()]
  );
  const attempts = (existing.rows[0]?.publish_attempts || 0) + 1;
  const retryable = isRetryablePublishError(status, error);
  const exhausted = attempts >= MAX_PUBLISH_ATTEMPTS;
  const nextStatus =
    retryable && !exhausted
      ? PIPELINE_STATUS.DRAFT_READY
      : PIPELINE_STATUS.PUBLISH_FAILED;

  const result = await query(
    `UPDATE article_drafts
     SET pipeline_status = $1,
         last_error = $2,
         publish_attempts = $3,
         retry_after = $4,
         updated_at = NOW()
     WHERE website_id = $5 AND celebrity_name = $6
     RETURNING *`,
    [
      nextStatus,
      String(error || "").substring(0, 1000),
      attempts,
      nextStatus === PIPELINE_STATUS.DRAFT_READY ? nextRetryAt(attempts - 1) : null,
      parseInt(websiteId, 10),
      celebrityName.trim(),
    ]
  );

  return result.rows[0] || null;
}

export async function markPublished({
  websiteId,
  celebrityName,
  trendId,
  postUrl,
}) {
  if (!websiteId || !celebrityName) return;
  await ensureArticleDraftsTable();

  await query(
    `UPDATE article_drafts
     SET pipeline_status = $1,
         last_error = NULL,
         retry_after = NULL,
         updated_at = NOW()
     WHERE website_id = $2 AND celebrity_name = $3`,
    [PIPELINE_STATUS.PUBLISHED, parseInt(websiteId, 10), celebrityName.trim()]
  );

  if (!postUrl) return;

  if (trendId) {
    await query(
      `UPDATE trends SET url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [postUrl, parseInt(trendId, 10)]
    );
    return;
  }

  await query(
    `UPDATE trends
     SET url = $1, updated_at = CURRENT_TIMESTAMP
     WHERE website_id = $2
       AND celebrity_name = $3
       AND (url IS NULL OR url = '' OR TRIM(url) = '')`,
    [postUrl, parseInt(websiteId, 10), celebrityName.trim()]
  );
}

export async function claimDueDrafts(limit = 2) {
  await ensureArticleDraftsTable();
  const cap = Math.max(1, parseInt(limit, 10) || 2);

  await query(
    `UPDATE article_drafts
     SET pipeline_status = $1, updated_at = NOW()
     WHERE pipeline_status = $2
       AND updated_at < NOW() - INTERVAL '8 minutes'`,
    [PIPELINE_STATUS.DRAFT_READY, PIPELINE_STATUS.PUBLISHING]
  );

  const due = await query(
    `SELECT * FROM article_drafts
     WHERE pipeline_status = $1
       AND (retry_after IS NULL OR retry_after <= NOW())
       AND publish_attempts < $2
     ORDER BY retry_after ASC NULLS FIRST, updated_at ASC
     LIMIT $3`,
    [PIPELINE_STATUS.DRAFT_READY, MAX_PUBLISH_ATTEMPTS, cap]
  );

  const claimed = [];
  for (const row of due.rows) {
    const locked = await query(
      `UPDATE article_drafts
       SET pipeline_status = $1, updated_at = NOW()
       WHERE id = $2 AND pipeline_status = $3
       RETURNING *`,
      [PIPELINE_STATUS.PUBLISHING, row.id, PIPELINE_STATUS.DRAFT_READY]
    );
    if (locked.rows[0]) claimed.push(locked.rows[0]);
  }
  return claimed;
}

export async function findExistingWordpressPost(websiteId, celebrityName) {
  if (!websiteId || !celebrityName) return null;
  const result = await query(
    `SELECT post_url, post_id, slug FROM wordpress_posts
     WHERE website_id = $1 AND celebrity_name = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [parseInt(websiteId, 10), celebrityName.trim()]
  );
  return result.rows[0] || null;
}

export function postUrlFromWpData(wpData) {
  if (!wpData) return null;
  if (wpData.slug) return `https://whatreligionisinfo.com/${wpData.slug}/`;
  return null;
}
