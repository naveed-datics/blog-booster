import { query } from '@/lib/db';

export async function queueForReview({
  websiteId,
  trendId = null,
  celebrityName,
  failedGate,
  gateDetail = {},
  spikeTier = null,
  proposedAction = null,
}) {
  const result = await query(
    `INSERT INTO review_queue
      (website_id, trend_id, celebrity_name, failed_gate, gate_detail, spike_tier, proposed_action, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING *`,
    [
      parseInt(websiteId, 10),
      trendId,
      celebrityName,
      failedGate,
      JSON.stringify(gateDetail),
      spikeTier,
      proposedAction,
    ]
  );
  return result.rows[0];
}

export async function listPendingReview(websiteId, { limit = 50 } = {}) {
  const result = await query(
    `SELECT rq.*, t.trend_text, t.url AS trend_url
     FROM review_queue rq
     LEFT JOIN trends t ON t.id = rq.trend_id
     WHERE rq.website_id = $1 AND rq.status = 'pending'
     ORDER BY rq.created_at ASC
     LIMIT $2`,
    [parseInt(websiteId, 10), limit]
  );
  return result.rows;
}

export async function approveReviewItem(id, resolvedBy = 'dashboard') {
  const result = await query(
    `UPDATE review_queue SET status = 'approved', resolved_at = NOW(), resolved_by = $2
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, resolvedBy]
  );
  return result.rows[0] || null;
}

export async function rejectReviewItem(id, resolvedBy = 'dashboard') {
  const result = await query(
    `UPDATE review_queue SET status = 'rejected', resolved_at = NOW(), resolved_by = $2
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, resolvedBy]
  );
  return result.rows[0] || null;
}

export async function getReviewItem(id) {
  const result = await query(`SELECT * FROM review_queue WHERE id = $1`, [id]);
  return result.rows[0] || null;
}
