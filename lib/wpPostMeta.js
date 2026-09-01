import { getWpAuthHeaders, getWpBaseUrl } from '@/lib/wpClient';

const WP_BASE = getWpBaseUrl();

export async function setPostMeta(postId, metaKey, metaValue) {
  const res = await fetch(`${WP_BASE}/posts/${postId}`, {
    method: 'POST',
    headers: getWpAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      meta: {
        [metaKey]: metaValue,
      },
    }),
  });

  if (!res.ok) {
    console.error(`setPostMeta ${metaKey} failed for post ${postId}: ${res.status}`);
    return false;
  }
  return true;
}

export async function setLastReviewedMeta(postId, date = new Date()) {
  const iso = (date instanceof Date ? date : new Date(date)).toISOString().slice(0, 10);
  return setPostMeta(postId, '_last_reviewed', iso);
}

export async function getLastReviewedFromMeta(postId) {
  const res = await fetch(
    `${WP_BASE}/posts/${postId}?context=edit&_fields=meta`,
    { headers: getWpAuthHeaders(), signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.meta?._last_reviewed || data.meta?.last_reviewed || null;
}
