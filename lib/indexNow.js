/** Optional IndexNow ping when Rank Math lacks Bing coverage. */
import { getSetting } from '@/lib/settings';

const DEFAULT_HOST = 'whatreligionisinfo.com';

export async function isIndexNowConfigured() {
  const [key, host] = await Promise.all([
    getSetting('INDEXNOW_KEY'),
    getSetting('INDEXNOW_HOST'),
  ]);
  return Boolean(key && host);
}

export async function getIndexNowKeyLocation() {
  const [key, host] = await Promise.all([
    getSetting('INDEXNOW_KEY'),
    getSetting('INDEXNOW_HOST'),
  ]);
  if (!key) return null;
  return `https://${host || DEFAULT_HOST}/${key}.txt`;
}

export async function pingIndexNow(urls) {
  const [key, configuredHost] = await Promise.all([
    getSetting('INDEXNOW_KEY'),
    getSetting('INDEXNOW_HOST'),
  ]);
  const host = configuredHost || DEFAULT_HOST;

  if (!key || !Array.isArray(urls) || urls.length === 0) {
    return { skipped: true, reason: 'IndexNow not configured or no URLs' };
  }

  const body = {
    host,
    key,
    keyLocation: await getIndexNowKeyLocation(),
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
