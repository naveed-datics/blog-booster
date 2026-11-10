import { auth } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { verifyApiKey, extractApiKey } from '@/lib/apiKeys';

/**
 * The shared cron secret.
 *
 * Checked against both sources on purpose. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` using the value configured as a
 * Vercel *environment variable*, which it reads before any of our code
 * runs - so the env copy has to keep working for inbound cron auth. The DB
 * copy is what the /settings page manages and what the internal
 * `x-cron-secret` chain uses.
 *
 * @returns {Promise<string[]>} Non-empty secrets to accept.
 */
export async function getCronSecrets() {
  const fromEnv = (process.env.CRON_SECRET || '').trim();

  let fromDb = '';
  try {
    fromDb = await getSetting('CRON_SECRET');
  } catch (error) {
    // A settings read failure must not lock out an otherwise valid cron
    // call that matches the env secret.
    console.error('[cronAuth] Could not read CRON_SECRET from settings:', error.message);
  }

  return [...new Set([fromEnv, fromDb].filter(Boolean))];
}

/** True when `value` matches any accepted cron secret. */
export async function matchesCronSecret(value) {
  if (!value) return false;
  const secrets = await getCronSecrets();
  return secrets.includes(value);
}

/**
 * True when the request carries Vercel Cron's
 * `Authorization: Bearer <cron secret>` header.
 */
export async function isCronBearerAuthorized(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  return matchesCronSecret(authHeader.slice('Bearer '.length).trim());
}

// Authorizes a request for automated (cron) pipeline calls as well as
// normal logged-in browser sessions.
//
// Cron calls carry an `x-cron-secret` header matching CRON_SECRET. This lets
// the daily article pipeline call these routes server-to-server without a
// NextAuth session cookie, while leaving normal dashboard usage unchanged.
export async function isAuthorized(request) {
  if (await matchesCronSecret(request.headers.get('x-cron-secret'))) {
    return true;
  }

  const session = await auth();
  return Boolean(session && session.user);
}

/**
 * Authorizes a pipeline endpoint that third-party projects may call.
 *
 * Accepts everything isAuthorized does, plus a shareable API key issued on
 * the Settings page. Deliberately NOT used by routes that expose stored
 * secrets or destroy data (/api/settings, /api/websites, /api/wp-delete-post)
 * - a key handed to another project must not be able to read this app's
 * credentials or delete published posts.
 *
 * @param {Request} request
 * @returns {Promise<boolean>}
 */
export async function isPipelineAuthorized(request) {
  if (await isAuthorized(request)) return true;

  const presented = extractApiKey(request);
  if (!presented) return false;

  return Boolean(await verifyApiKey(presented));
}
