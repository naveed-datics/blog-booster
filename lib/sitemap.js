import { parseString } from "xml2js";
import { promisify } from "util";

const parseStringAsync = promisify(parseString);

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

/**
 * Fetch and parse sitemap index to find post-sitemap URLs (celebrity search use case).
 */
export async function fetchPostSitemapUrls(sitemapIndexUrl) {
  try {
    const response = await fetch(sitemapIndexUrl, {
      headers: FETCH_HEADERS,
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlText = await response.text();
    const result = await parseStringAsync(xmlText);

    const sitemapUrls = [];
    if (result.sitemapindex?.sitemap) {
      result.sitemapindex.sitemap.forEach((sitemapEntry) => {
        if (sitemapEntry.loc?.[0]) {
          const sitemapUrl = sitemapEntry.loc[0];
          if (sitemapUrl.includes("post-sitemap")) {
            sitemapUrls.push(sitemapUrl);
          }
        }
      });
    }

    return sitemapUrls;
  } catch (error) {
    console.error(`Error fetching sitemap index ${sitemapIndexUrl}:`, error);
    return [];
  }
}

/**
 * Fetch all child sitemap URLs from a sitemap index (any sitemap type).
 */
export async function fetchSitemapIndexChildren(sitemapIndexUrl) {
  try {
    const response = await fetch(sitemapIndexUrl, {
      headers: FETCH_HEADERS,
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlText = await response.text();
    const result = await parseStringAsync(xmlText);

    const sitemapUrls = [];
    if (result.sitemapindex?.sitemap) {
      result.sitemapindex.sitemap.forEach((sitemapEntry) => {
        if (sitemapEntry.loc?.[0]) {
          sitemapUrls.push(sitemapEntry.loc[0]);
        }
      });
    }

    return sitemapUrls;
  } catch (error) {
    console.error(`Error fetching sitemap index ${sitemapIndexUrl}:`, error);
    return [];
  }
}

/**
 * Fetch URLs from a single sitemap XML file.
 */
export async function fetchSitemapUrls(sitemapUrl) {
  try {
    const response = await fetch(sitemapUrl, {
      headers: FETCH_HEADERS,
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlText = await response.text();
    const result = await parseStringAsync(xmlText);

    const urlData = [];
    if (result.urlset?.url) {
      result.urlset.url.forEach((urlEntry) => {
        if (urlEntry.loc?.[0]) {
          urlData.push({
            url: urlEntry.loc[0],
            lastmod: urlEntry.lastmod?.[0] ?? null,
          });
        }
      });
    }

    return urlData;
  } catch (error) {
    console.error(`Error fetching sitemap ${sitemapUrl}:`, error);
    return [];
  }
}

/**
 * Fetch all page URLs from a sitemap index or single sitemap file.
 * Returns deduplicated { url, lastmod } entries.
 */
export async function fetchAllSitemapUrls(sitemapIndexUrl) {
  if (!sitemapIndexUrl?.trim()) {
    return [];
  }

  const response = await fetch(sitemapIndexUrl.trim(), {
    headers: FETCH_HEADERS,
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: HTTP ${response.status}`);
  }

  const xmlText = await response.text();
  const result = await parseStringAsync(xmlText);

  const sitemapFiles = [];

  if (result.sitemapindex?.sitemap) {
    result.sitemapindex.sitemap.forEach((entry) => {
      if (entry.loc?.[0]) {
        sitemapFiles.push(entry.loc[0]);
      }
    });
  } else if (result.urlset?.url) {
    sitemapFiles.push(sitemapIndexUrl.trim());
  }

  const urlMap = new Map();

  for (const sitemapUrl of sitemapFiles) {
    const urlData = await fetchSitemapUrls(sitemapUrl);
    urlData.forEach(({ url, lastmod }) => {
      if (!urlMap.has(url)) {
        urlMap.set(url, lastmod);
      }
    });
  }

  return Array.from(urlMap.entries()).map(([url, lastmod]) => ({
    url,
    lastmod,
  }));
}

/**
 * Fetch URLs from post-sitemaps only (legacy celebrity search behavior).
 */
export async function fetchPostSitemapPageUrls(sitemapIndexUrl) {
  const postSitemapUrls = await fetchPostSitemapUrls(sitemapIndexUrl);
  if (postSitemapUrls.length === 0) {
    return [];
  }

  const allUrlData = [];
  for (const sitemapUrl of postSitemapUrls) {
    const urlData = await fetchSitemapUrls(sitemapUrl);
    allUrlData.push(...urlData);
  }

  return allUrlData;
}
