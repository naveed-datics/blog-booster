import { query } from './db.js';
import {
  normalizeCelebrityName,
  buildSlugCandidates,
  slugFromPostUrl,
  stripSlugSuffix,
  slugsAreCloseMatch,
} from './personName.js';
import { loadIndexedSlugs } from './personIndex.js';

function rowToLookupResult(row, match) {
  if (!row) return null;
  return {
    match,
    postId: row.post_id ?? null,
    slug: row.slug || row.canonical_slug || slugFromPostUrl(row.post_url),
    url: row.post_url ?? null,
    status: row.wp_status ?? 'publish',
    contentQuality: row.content_quality ?? 'unknown',
    lastReviewed: row.last_reviewed ?? null,
    celebrityName: row.celebrity_name,
    normalizedName: row.normalized_name,
    source: 'wordpress_posts',
  };
}

function slugCanonicalScore(row) {
  const slug = (row.slug || row.canonical_slug || '').toLowerCase();
  if (slug.startsWith('what-religion-is-')) return 100;
  if (slug.startsWith('what-religion-was-')) return 90;
  if (slug.endsWith('-religion') && !/-religion-\d+$/.test(slug)) return 50;
  if (slug.endsWith('-faith')) return 40;
  return 10;
}

function pickCanonicalDuplicate(rows) {
  if (rows.length <= 1) return null;

  const sorted = [...rows].sort((a, b) => {
    const scoreDiff = slugCanonicalScore(b) - slugCanonicalScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const pubA = a.wp_status === 'publish' ? 1 : 0;
    const pubB = b.wp_status === 'publish' ? 1 : 0;
    if (pubB !== pubA) return pubB - pubA;
    const aId = a.post_id ?? Number.MAX_SAFE_INTEGER;
    const bId = b.post_id ?? Number.MAX_SAFE_INTEGER;
    return aId - bId;
  });

  const canonical = sorted[0];
  const duplicate = sorted[1];
  return {
    match: 'duplicate_slugs',
    postId: canonical.post_id ?? null,
    slug: canonical.slug || canonical.canonical_slug,
    url: canonical.post_url ?? null,
    status: canonical.wp_status ?? 'publish',
    contentQuality: canonical.content_quality ?? 'unknown',
    lastReviewed: canonical.last_reviewed ?? null,
    celebrityName: canonical.celebrity_name,
    normalizedName: canonical.normalized_name,
    canonical,
    duplicate,
    source: 'wordpress_posts',
  };
}

async function lookupByNormalizedName(websiteId, normalizedName) {
  const result = await query(
    `SELECT * FROM wordpress_posts
     WHERE website_id = $1 AND normalized_name = $2
       AND (wp_status IS NULL OR wp_status <> 'trash')
     ORDER BY
       CASE WHEN post_id IS NOT NULL THEN 0 ELSE 1 END,
       updated_at DESC`,
    [parseInt(websiteId, 10), normalizedName]
  );
  return result.rows;
}

async function lookupBySlugCandidates(websiteId, celebrityName) {
  const candidates = buildSlugCandidates(celebrityName);
  if (candidates.length === 0) return [];

  const result = await query(
    `SELECT * FROM wordpress_posts
     WHERE website_id = $1
       AND (wp_status IS NULL OR wp_status <> 'trash')
       AND (
         lower(slug) = ANY($2::text[])
         OR lower(canonical_slug) = ANY($2::text[])
       )
     ORDER BY post_id ASC NULLS LAST`,
    [parseInt(websiteId, 10), candidates.map((s) => s.toLowerCase())]
  );
  return result.rows;
}

async function lookupFuzzyBySlug(websiteId, celebrityName) {
  const targetSlugs = buildSlugCandidates(celebrityName).map((s) =>
    stripSlugSuffix(s.toLowerCase())
  );
  if (targetSlugs.length === 0) return [];

  const indexed = await loadIndexedSlugs(websiteId);
  const matches = [];

  for (const row of indexed) {
    const rowSlug = stripSlugSuffix(
      (row.slug || row.canonical_slug || slugFromPostUrl(row.post_url) || '').toLowerCase()
    );
    if (!rowSlug) continue;

    for (const target of targetSlugs) {
      if (slugsAreCloseMatch(target, rowSlug)) {
        matches.push(row);
        break;
      }
    }
  }

  return matches;
}

async function lookupArticleDraft(websiteId, normalizedName) {
  const result = await query(
    `SELECT celebrity_name, draft_title, pipeline_status, updated_at
     FROM article_drafts
     WHERE website_id = $1
       AND lower(trim(celebrity_name)) = $2
     LIMIT 1`,
    [parseInt(websiteId, 10), normalizedName]
  );
  if (result.rows.length === 0) return null;

  const draft = result.rows[0];
  if (draft.pipeline_status === 'published') return null;

  return {
    match: 'draft',
    postId: null,
    slug: buildSlugCandidates(draft.celebrity_name)[0] ?? null,
    url: null,
    status: 'draft',
    contentQuality: 'unknown',
    lastReviewed: null,
    celebrityName: draft.celebrity_name,
    normalizedName,
    source: 'article_drafts',
  };
}

async function lookupTrendUrl(websiteId, normalizedName) {
  const result = await query(
    `SELECT celebrity_name, url, updated_at
     FROM trends
     WHERE website_id = $1
       AND lower(trim(celebrity_name)) = $2
       AND url IS NOT NULL AND trim(url) <> ''
     ORDER BY updated_at DESC
     LIMIT 1`,
    [parseInt(websiteId, 10), normalizedName]
  );
  if (result.rows.length === 0) return null;

  const trend = result.rows[0];
  return {
    match: 'published',
    postId: null,
    slug: slugFromPostUrl(trend.url),
    url: trend.url,
    status: 'publish',
    contentQuality: 'unknown',
    lastReviewed: trend.updated_at
      ? new Date(trend.updated_at).toISOString().slice(0, 10)
      : null,
    celebrityName: trend.celebrity_name,
    normalizedName,
    source: 'trends',
  };
}

function matchTypeFromStatus(wpStatus) {
  if (wpStatus === 'draft') return 'draft';
  if (wpStatus === 'trash') return 'none';
  return 'published';
}

/**
 * App-side person page lookup. Never calls WordPress REST API.
 */
export async function lookupPerson(websiteId, celebrityName) {
  const name = celebrityName?.trim();
  if (!websiteId || !name) {
    return {
      match: 'none',
      postId: null,
      slug: null,
      url: null,
      status: null,
      contentQuality: 'unknown',
      lastReviewed: null,
    };
  }

  const normalizedName = normalizeCelebrityName(name);

  const byName = await lookupByNormalizedName(websiteId, normalizedName);
  if (byName.length > 1) {
    const dup = pickCanonicalDuplicate(byName);
    if (dup) return dup;
  }
  if (byName.length === 1) {
    return rowToLookupResult(byName[0], matchTypeFromStatus(byName[0].wp_status));
  }

  const bySlug = await lookupBySlugCandidates(websiteId, name);
  if (bySlug.length > 1) {
    const dup = pickCanonicalDuplicate(bySlug);
    if (dup) return dup;
  }
  if (bySlug.length === 1) {
    return rowToLookupResult(bySlug[0], matchTypeFromStatus(bySlug[0].wp_status));
  }

  const fuzzy = await lookupFuzzyBySlug(websiteId, name);
  if (fuzzy.length > 1) {
    const dup = pickCanonicalDuplicate(fuzzy);
    if (dup) return dup;
  }
  if (fuzzy.length === 1) {
    return rowToLookupResult(fuzzy[0], matchTypeFromStatus(fuzzy[0].wp_status));
  }

  const draft = await lookupArticleDraft(websiteId, normalizedName);
  if (draft) return draft;

  const trend = await lookupTrendUrl(websiteId, normalizedName);
  if (trend) return trend;

  return {
    match: 'none',
    postId: null,
    slug: buildSlugCandidates(name)[0] ?? null,
    url: null,
    status: null,
    contentQuality: 'unknown',
    lastReviewed: null,
    celebrityName: name,
    normalizedName,
    source: null,
  };
}
