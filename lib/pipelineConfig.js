/**
 * Recovery mode and daily publish limits.
 *
 * Values live in app_settings (managed on /settings), so the readers are
 * async. The action helpers below stay synchronous - they only classify a
 * string and read no configuration.
 */
import { getBooleanSetting, getNumberSetting, getSetting } from './settings.js';

export async function isRecoveryActive() {
  return getBooleanSetting('RECOVERY_MODE', false);
}

export async function getRecoveryStartDate() {
  const raw = await getSetting('RECOVERY_START_DATE');
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getRecoveryMinWeeks() {
  return getNumberSetting('RECOVERY_MIN_WEEKS', 8);
}

export async function getDailyNewLimit() {
  if (isRecoveryLoosened()) {
    return getNumberSetting('NORMAL_DAILY_LIMIT', 3);
  }
  if (await isRecoveryActive()) {
    return getNumberSetting('RECOVERY_DAILY_LIMIT', 1);
  }
  return getNumberSetting('NORMAL_DAILY_LIMIT', 3);
}

export async function getDailyUpdateLimit() {
  if (isRecoveryLoosened()) {
    return getNumberSetting('NORMAL_REFRESH_LIMIT', 5);
  }
  if (await isRecoveryActive()) {
    return getNumberSetting('RECOVERY_REFRESH_LIMIT', 1);
  }
  return getNumberSetting('NORMAL_REFRESH_LIMIT', 5);
}

export async function bulkRemediationBypassesQuota() {
  return getBooleanSetting('BULK_REMEDIATION_BYPASS_QUOTA', true);
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
