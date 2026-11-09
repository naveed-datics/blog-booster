import { getSetting } from './settings.js';

// WordPress REST base. Falls back to the site this project was built for so
// an unset setting degrades to the previous behaviour rather than breaking.
const DEFAULT_WP_BASE = 'https://whatreligionisinfo.com/wp-json/wp/v2';

/**
 * Resolved WordPress REST base URL, without a trailing slash.
 * @returns {Promise<string>}
 */
export async function getWpBaseUrl() {
  const configured = await getSetting('WP_BASE_URL');
  return (configured || DEFAULT_WP_BASE).replace(/\/+$/, '');
}

/**
 * The full Authorization header value for WordPress.
 * Throws rather than falling back to a hardcoded credential.
 * @returns {Promise<string>}
 */
export async function getWpAuthHeader() {
  const header = await getSetting('WP_AUTH_HEADER');
  if (!header) {
    throw new Error(
      'WordPress auth header is not configured. Add WP_AUTH_HEADER on the Settings page (/settings).'
    );
  }
  return header;
}

/** @returns {Promise<Record<string,string>>} */
export async function getWpAuthHeaders(extra = {}) {
  return {
    Authorization: await getWpAuthHeader(),
    Accept: 'application/json',
    ...extra,
  };
}

export async function fetchWpPostById(postId, { context = 'edit' } = {}) {
  const base = await getWpBaseUrl();
  const res = await fetch(`${base}/posts/${postId}?context=${context}`, {
    headers: await getWpAuthHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchWpPostRawContent(postId) {
  const post = await fetchWpPostById(postId, { context: 'edit' });
  if (!post) return null;
  const raw = post.content?.raw;
  if (typeof raw === 'string') return raw;
  return null;
}
