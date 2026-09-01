import { query } from '@/lib/db';
import {
  bulkRemediationBypassesQuota,
  getDailyNewLimit,
  getDailyUpdateLimit,
  isNewCreateAction,
  isUpdateAction,
} from '@/lib/pipelineConfig';

function startOfTodayUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function countActionsToday(websiteId, actions) {
  const since = startOfTodayUtc();
  const result = await query(
    `SELECT COUNT(*)::int AS cnt FROM trends
     WHERE website_id = $1
       AND pipeline_action = ANY($2::text[])
       AND updated_at >= $3
       AND url IS NOT NULL AND trim(url) <> ''`,
    [parseInt(websiteId, 10), actions, since]
  );
  return result.rows[0]?.cnt ?? 0;
}

export async function countNewCreatesToday(websiteId) {
  return countActionsToday(websiteId, ['create-new', 'revive-draft']);
}

export async function countUpdatesToday(websiteId) {
  return countActionsToday(websiteId, [
    'light-update',
    'full-rewrite',
    'consolidate',
  ]);
}

export async function getQuotaRemaining(websiteId) {
  const newLimit = getDailyNewLimit();
  const updateLimit = getDailyUpdateLimit();
  const newUsed = await countNewCreatesToday(websiteId);
  const updateUsed = await countUpdatesToday(websiteId);

  return {
    new_limit: newLimit,
    new_used: newUsed,
    new_remaining: Math.max(0, newLimit - newUsed),
    update_limit: updateLimit,
    update_used: updateUsed,
    update_remaining: Math.max(0, updateLimit - updateUsed),
  };
}

export async function assertPublishQuota(websiteId, action, { bulkRemediation = false } = {}) {
  if (bulkRemediation && bulkRemediationBypassesQuota()) {
    return { allowed: true, reason: 'bulk_remediation bypass' };
  }

  const wid = parseInt(websiteId, 10);
  if (!wid || !action) {
    return { allowed: false, reason: 'missing websiteId or action' };
  }

  if (isNewCreateAction(action)) {
    const used = await countNewCreatesToday(wid);
    const limit = getDailyNewLimit();
    if (used >= limit) {
      return {
        allowed: false,
        reason: `daily new-create limit reached (${used}/${limit})`,
        defer: true,
      };
    }
    return { allowed: true, remaining: limit - used - 1 };
  }

  if (isUpdateAction(action)) {
    const used = await countUpdatesToday(wid);
    const limit = getDailyUpdateLimit();
    if (used >= limit) {
      return {
        allowed: false,
        reason: `daily update limit reached (${used}/${limit})`,
        defer: true,
      };
    }
    return { allowed: true, remaining: limit - used - 1 };
  }

  return { allowed: true };
}
