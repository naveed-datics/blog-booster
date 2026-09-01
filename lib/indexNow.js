/** Optional IndexNow ping when Rank Math lacks Bing coverage. */

export function isIndexNowConfigured() {
  return Boolean(process.env.INDEXNOW_KEY && process.env.INDEXNOW_HOST);
}

export function getIndexNowKeyLocation() {
  const host = process.env.INDEXNOW_HOST || 'whatreligionisinfo.com';
  const key = process.env.INDEXNOW_KEY;
  if (!key) return null;
  return `https://${host}/${key}.txt`;
}

export async function pingIndexNow(urls) {
  const key = process.env.INDEXNOW_KEY;
  const host = process.env.INDEXNOW_HOST || 'whatreligionisinfo.com';
  if (!key || !Array.isArray(urls) || urls.length === 0) {
    return { skipped: true, reason: 'IndexNow not configured or no URLs' };
  }

  const body = {
    host,
    key,
    keyLocation: getIndexNowKeyLocation(),
    urlList: urls.slice(0, 100),
  };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { success: res.ok, status: res.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
