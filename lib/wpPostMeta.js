import { getWpAuthHeaders, getWpBaseUrl } from '@/lib/wpClient';

export async function setPostMeta(postId, metaKey, metaValue) {
  const base = await getWpBaseUrl();
  const res = await fetch(`${base}/posts/${postId}`, {
    method: 'POST',
    headers: await getWpAuthHeaders({ 'Content-Type': 'application/json' }),
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
  const base = await getWpBaseUrl();
  const res = await fetch(
    `${base}/posts/${postId}?context=edit&_fields=meta`,
    { headers: await getWpAuthHeaders(), signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.meta?._last_reviewed || data.meta?.last_reviewed || null;
}
