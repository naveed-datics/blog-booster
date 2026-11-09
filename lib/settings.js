import { query } from './db.js';
import { SETTING_KEYS, isSecretKey, isSettableKey } from './settingsSchema.js';

/**
 * Reads runtime configuration from the app_settings table.
 *
 * Settings are DB-only by design: the /settings page is the single place
 * keys are managed, so rotating one does not need a redeploy. Only the
 * bootstrap values in BOOTSTRAP_ENV_KEYS still come from the environment.
 *
 * Values are cached briefly in-process. Serverless instances are short-lived
 * and the daily pipeline makes many model calls per run, so caching avoids a
 * query per call while keeping an edit visible within seconds.
 */

const CACHE_TTL_MS = 10_000;

/** @type {{ values: Record<string,string>, expiresAt: number } | null} */
let cache = null;
/**
 * Test-only override. When set, reads resolve from it and never touch the
 * database, so unit tests can exercise configuration-dependent behaviour
 * without a live connection.
 * @type {Record<string,string> | null}
 */
let overrides = null;
/** @type {Promise<Record<string,string>> | null} */
let inflight = null;

function stripQuotes(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/^["']|["']$/g, '').trim();
}

async function loadFromDb() {
  const result = await query('SELECT key, value FROM app_settings', []);
  return result.rows.reduce((acc, row) => {
    const value = stripQuotes(row.value);
    if (value) acc[row.key] = value;
    return acc;
  }, {});
}

/** Drops the in-process cache. Called after a write so the next read is fresh. */
export function invalidateSettingsCache() {
  cache = null;
  inflight = null;
}

/**
 * Replaces all settings reads with `values` (tests only). Pass null to
 * restore normal database-backed behaviour.
 * @param {Record<string,string> | null} values
 */
export function __setSettingsOverrideForTests(values) {
  overrides = values;
  invalidateSettingsCache();
}

/**
 * All settings as a plain object. Missing/blank values are omitted.
 * @returns {Promise<Record<string,string>>}
 */
export async function getAllSettings() {
  if (overrides) return overrides;

  if (cache && cache.expiresAt > Date.now()) {
    return cache.values;
  }

  // Collapse concurrent cold reads (the pipeline fans out) into one query.
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const values = await loadFromDb();
      cache = { values, expiresAt: Date.now() + CACHE_TTL_MS };
      return values;
    } catch (error) {
      console.error('[settings] Failed to load app_settings:', error.message);
      // Surface rather than silently falling back to an empty config - a
      // caller that needs a key will throw a clear "not configured" error.
      throw new Error(
        'Unable to read application settings from the database. Run `npm run migrate:app-settings` and confirm DATABASE_URL.'
      );
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * One setting value, or '' when unset.
 * @param {string} key
 * @returns {Promise<string>}
 */
export async function getSetting(key) {
  const all = await getAllSettings();
  return all[key] || '';
}

/**
 * One setting that the caller cannot proceed without.
 * @param {string} key
 * @param {string} [label] Human-readable name for the error message.
 * @returns {Promise<string>}
 */
export async function requireSetting(key, label) {
  const value = await getSetting(key);
  if (!value) {
    throw new Error(
      `${label || key} is not configured. Add it on the Settings page (/settings).`
    );
  }
  return value;
}

/**
 * Several settings at once.
 * @param {ReadonlyArray<string>} keys
 * @returns {Promise<Record<string,string>>}
 */
export async function getSettings(keys) {
  const all = await getAllSettings();
  return keys.reduce((acc, key) => {
    acc[key] = all[key] || '';
    return acc;
  }, {});
}

/** Truthy check for boolean-ish settings ('true', '1', 'yes', 'on'). */
export async function getBooleanSetting(key, defaultValue = false) {
  const raw = (await getSetting(key)).toLowerCase();
  if (!raw) return defaultValue;
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

/** Numeric setting with a fallback when unset or unparseable. */
export async function getNumberSetting(key, defaultValue) {
  const raw = await getSetting(key);
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Upserts settings. Keys outside the registry are rejected so a stray
 * client payload cannot write arbitrary rows.
 *
 * A blank value deletes the row (treated as "unset") rather than storing ''.
 *
 * @param {Record<string, string>} updates
 * @param {string} [updatedBy]
 * @returns {Promise<{ saved: string[], cleared: string[] }>}
 */
export async function saveSettings(updates, updatedBy) {
  const entries = Object.entries(updates).filter(([key]) => isSettableKey(key));

  const saved = [];
  const cleared = [];

  for (const [key, rawValue] of entries) {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';

    if (!value) {
      await query('DELETE FROM app_settings WHERE key = $1', [key]);
      cleared.push(key);
      continue;
    }

    await query(
      `INSERT INTO app_settings (key, value, is_secret, updated_at, updated_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             is_secret = EXCLUDED.is_secret,
             updated_at = NOW(),
             updated_by = EXCLUDED.updated_by`,
      [key, value, isSecretKey(key), updatedBy || null]
    );
    saved.push(key);
  }

  invalidateSettingsCache();
  return { saved, cleared };
}

/** Masks a secret for display: keeps a short prefix and the last 4 chars. */
export function maskSecret(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/**
 * Settings shaped for the settings UI. Secret values are never returned in
 * full - only a mask plus a `configured` flag.
 * @returns {Promise<Record<string, { value: string, masked: string, configured: boolean, secret: boolean }>>}
 */
export async function getSettingsForDisplay() {
  const all = await getAllSettings();

  return SETTING_KEYS.reduce((acc, key) => {
    const value = all[key] || '';
    const secret = isSecretKey(key);
    acc[key] = {
      value: secret ? '' : value,
      masked: secret ? maskSecret(value) : value,
      configured: Boolean(value),
      secret,
    };
    return acc;
  }, {});
}
