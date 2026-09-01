const WP_BASE =
  process.env.WP_BASE_URL || 'https://whatreligionisinfo.com/wp-json/wp/v2';

function getAuthHeader() {
  const header = process.env.WP_AUTH_HEADER;
  if (!header) {
    throw new Error('WP_AUTH_HEADER environment variable is not set.');
  }
  return header;
}

export function getWpBaseUrl() {
  return WP_BASE;
}

export function getWpAuthHeaders(extra = {}) {
  return {
    Authorization: getAuthHeader(),
    Accept: 'application/json',
    ...extra,
  };
}

export async function fetchWpPostById(postId, { context = 'edit' } = {}) {
  const res = await fetch(
    `${WP_BASE}/posts/${postId}?context=${context}`,
    {
      headers: getWpAuthHeaders(),
      signal: AbortSignal.timeout(15000),
    }
  );
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
