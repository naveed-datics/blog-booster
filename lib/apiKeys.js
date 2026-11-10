import crypto from 'crypto';
import { query } from './db.js';

/**
 * API keys for calling this app's pipeline endpoints from other projects.
 *
 * Only a SHA-256 hash is stored. The plaintext is returned once at creation
 * and cannot be recovered, so the database never holds a usable credential.
 */

const KEY_PREFIX = 'bb_live_';
/** Bytes of entropy per key (32 -> 43 base64url chars). */
const KEY_BYTES = 32;

/** @param {string} key */
export function hashKey(key) {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Generates a key: `bb_live_<43 base64url chars>`. */
export function generateKey() {
  return `${KEY_PREFIX}${crypto.randomBytes(KEY_BYTES).toString('base64url')}`;
}

/**
 * Non-secret identifier shown in the UI. Includes the scheme plus the first
 * 8 random chars - enough to tell keys apart, far too little to guess one.
 * @param {string} key
 */
export function keyPrefixOf(key) {
  return key.slice(0, KEY_PREFIX.length + 8);
}

/**
 * Creates and stores a key.
 * @param {{ name: string, createdBy?: string }} options
 * @returns {Promise<{ key: string, record: object }>} `key` is shown once.
 */
export async function createApiKey({ name, createdBy }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('A name is required for the API key.');

  const key = generateKey();
  const result = await query(
    `INSERT INTO api_keys (name, key_hash, key_prefix, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, key_prefix, created_by, created_at, last_used_at, revoked_at`,
    [trimmed.slice(0, 120), hashKey(key), keyPrefixOf(key), createdBy || null]
  );

  return { key, record: result.rows[0] };
}

/** Active and revoked keys, newest first. Never returns key material. */
export async function listApiKeys() {
  const result = await query(
    `SELECT id, name, key_prefix, created_by, created_at, last_used_at, revoked_at
     FROM api_keys ORDER BY created_at DESC`,
    []
  );
  return result.rows;
}

/** Soft-revokes a key, keeping the row for audit. */
export async function revokeApiKey(id) {
  const result = await query(
    `UPDATE api_keys SET revoked_at = NOW()
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING id, name, key_prefix, revoked_at`,
    [parseInt(id, 10)]
  );
  return result.rows[0] || null;
}

/**
 * Verifies a presented key.
 *
 * Looks up by hash rather than comparing candidates, so the lookup cost does
 * not depend on how many keys exist and no plaintext is ever compared.
 *
 * @param {string | null | undefined} presented
 * @returns {Promise<object | null>} The key row, or null when invalid/revoked.
 */
export async function verifyApiKey(presented) {
  if (!presented || typeof presented !== 'string') return null;

  const candidate = presented.trim();
  if (!candidate.startsWith(KEY_PREFIX)) return null;

  const result = await query(
    `SELECT id, name, key_prefix, revoked_at FROM api_keys
     WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hashKey(candidate)]
  );

  const row = result.rows[0];
  if (!row) return null;

  // Best-effort usage stamp; a failure here must not reject a valid key.
  query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [row.id]).catch(
    (error) => console.error('[apiKeys] last_used_at update failed:', error.message)
  );

  return row;
}

/**
 * Reads the key from a request: `Authorization: Bearer <key>` or `x-api-key`.
 * @param {Request} request
 */
export function extractApiKey(request) {
  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token.startsWith(KEY_PREFIX)) return token;
  }
  return request.headers.get('x-api-key')?.trim() || null;
}
