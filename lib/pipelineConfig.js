/** Recovery mode and daily publish limits (env-driven). */

export function isRecoveryActive() {
  return process.env.RECOVERY_MODE === 'true';
}

export function getRecoveryStartDate() {
  const raw = process.env.RECOVERY_START_DATE;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getRecoveryMinWeeks() {
  return parseInt(process.env.RECOVERY_MIN_WEEKS || '8', 10);
}

export function getDailyNewLimit() {
  if (isRecoveryLoosened()) {
    return parseInt(process.env.NORMAL_DAILY_LIMIT || '3', 10);
  }
  if (isRecoveryActive()) {
    return parseInt(process.env.RECOVERY_DAILY_LIMIT || '1', 10);
  }
  return parseInt(process.env.NORMAL_DAILY_LIMIT || '3', 10);
}

export function getDailyUpdateLimit() {
  if (isRecoveryLoosened()) {
    return parseInt(process.env.NORMAL_REFRESH_LIMIT || '5', 10);
  }
  if (isRecoveryActive()) {
    return parseInt(process.env.RECOVERY_REFRESH_LIMIT || '1', 10);
  }
  return parseInt(process.env.NORMAL_REFRESH_LIMIT || '5', 10);
}

export function bulkRemediationBypassesQuota() {
  return process.env.BULK_REMEDIATION_BYPASS_QUOTA !== 'false';
}

let loosenedCache = null;

export function setRecoveryLoosenedCache(value) {
  loosenedCache = value;
}

export function isRecoveryLoosened() {
  if (loosenedCache !== null) return loosenedCache;
  return false;
}

export const PIPELINE_ACTIONS = {
  CREATE_NEW: 'create-new',
  LIGHT_UPDATE: 'light-update',
  FULL_REWRITE: 'full-rewrite',
  REVIVE_DRAFT: 'revive-draft',
  CONSOLIDATE: 'consolidate',
};

export function isNewCreateAction(action) {
  return action === PIPELINE_ACTIONS.CREATE_NEW || action === PIPELINE_ACTIONS.REVIVE_DRAFT;
}

export function isUpdateAction(action) {
  return (
    action === PIPELINE_ACTIONS.LIGHT_UPDATE ||
    action === PIPELINE_ACTIONS.FULL_REWRITE ||
    action === PIPELINE_ACTIONS.CONSOLIDATE
  );
}
