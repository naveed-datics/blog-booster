import { query } from './db.js';
import { fetchPostSitemapPageUrls } from './sitemap.js';
import {
  normalizeCelebrityName,
  slugFromPostUrl,
  celebrityNameFromSlug,
  parseLastReviewedFromContent,
  stripSlugSuffix,
} from './personName.js';

const PERSON_URL_PATTERN =
  /(?:^|\/)([a-z0-9-]+-(?:religion|faith)|what-religion-is-[a-z0-9-]+|what-faith-is-[a-z0-9-]+)(?:\/|$)/i;

/**
 * Upsert by WordPress post_id (inventory backfill — allows multiple rows per person).
 */
export async function upsertPersonPageByPostId({
  websiteId,
  celebrityName,
  postId,
  postTitle = null,
  postUrl = null,
  slug = null,
  content = null,
  imageUrl = null,
  metaDescription = null,
  religion = null,
  wpStatus = 'publish',
  contentQuality = 'unknown',
  lastReviewed = null,
  canonicalSlug = null,
  disambiguationKey = null,
}) {
  const wid = parseInt(websiteId, 10);
  const name = celebrityName?.trim();
  if (!wid || !name || !postId) return null;

  const normalizedName = normalizeCelebrityName(name);
  const resolvedSlug = slug || slugFromPostUrl(postUrl);
  const resolvedCanonical = canonicalSlug || stripSlugSuffix(resolvedSlug || '');
  const resolvedTitle = postTitle || name;

  const existing = await query(
    `SELECT id FROM wordpress_posts WHERE website_id = $1 AND post_id = $2 LIMIT 1`,
    [wid, postId]
  );

  if (existing.rows.length > 0) {
    const result = await query(
      `UPDATE wordpress_posts SET
         celebrity_name = $1,
         post_title = COALESCE($2, post_title),
         post_url = COALESCE($3, post_url),
         image_url = COALESCE($4, image_url),
         content = COALESCE($5, content),
         slug = COALESCE($6, slug),
         meta_description = COALESCE($7, meta_description),
         religion = COALESCE($8, religion),
         wp_status = COALESCE($9, wp_status),
         content_quality = COALESCE($10, content_quality),
         last_reviewed = COALESCE($11, last_reviewed),
         canonical_slug = COALESCE($12, canonical_slug),
         normalized_name = $13,
         disambiguation_key = COALESCE($14, disambiguation_key),
         updated_at = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        name,
        resolvedTitle,
        postUrl,
        imageUrl,
        content,
        resolvedSlug,
        metaDescription,
        religion,
        wpStatus,
        contentQuality,
        lastReviewed,
        resolvedCanonical || null,
        normalizedName,
        disambiguationKey,
        existing.rows[0].id,
      ]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO wordpress_posts (
       website_id, celebrity_name, post_title, post_id, post_url, image_url,
       content, slug, meta_description, religion, wp_status, content_quality,
       last_reviewed, canonical_slug, normalized_name, disambiguation_key
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      wid,
      name,
      resolvedTitle,
      postId,
      postUrl,
      imageUrl,
      content,
      resolvedSlug,
      metaDescription,
      religion,
      wpStatus,
      contentQuality,
      lastReviewed,
      resolvedCanonical || null,
      normalizedName,
      disambiguationKey,
    ]
  );
  return result.rows[0];
}

/**
 * Upsert one person page row using app data only (no WordPress REST).
 */
export async function upsertPersonPage({
  websiteId,
  celebrityName,
  postId = null,
  postTitle = null,
  postUrl = null,
  slug = null,
  content = null,
  imageUrl = null,
  metaDescription = null,
  religion = null,
  wpStatus = 'publish',
  contentQuality = 'unknown',
  lastReviewed = null,
  canonicalSlug = null,
}) {
  const wid = parseInt(websiteId, 10);
  const name = celebrityName?.trim();
  if (!wid || !name) return null;

  const normalizedName = normalizeCelebrityName(name);
  const resolvedSlug = slug || slugFromPostUrl(postUrl);
  const resolvedCanonical = canonicalSlug || stripSlugSuffix(resolvedSlug || '');
  const resolvedTitle = postTitle || name;
  const resolvedLastReviewed =
    lastReviewed || parseLastReviewedFromContent(content) || null;

  const existing = await query(
    `SELECT id, post_id FROM wordpress_posts
     WHERE website_id = $1 AND normalized_name = $2
       AND (wp_status IS NULL OR wp_status <> 'trash')
     ORDER BY
       CASE WHEN post_id IS NOT NULL THEN 0 ELSE 1 END,
       updated_at DESC
     LIMIT 1`,
    [wid, normalizedName]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const result = await query(
      `UPDATE wordpress_posts SET
         celebrity_name = $1,
         post_title = COALESCE($2, post_title),
         post_id = COALESCE($3, post_id),
         post_url = COALESCE($4, post_url),
         image_url = COALESCE($5, image_url),
         content = COALESCE($6, content),
         slug = COALESCE($7, slug),
         meta_description = COALESCE($8, meta_description),
         religion = COALESCE($9, religion),
         wp_status = COALESCE($10, wp_status),
         content_quality = COALESCE($11, content_quality),
         last_reviewed = COALESCE($12, last_reviewed),
         canonical_slug = COALESCE($13, canonical_slug),
         normalized_name = $14,
         updated_at = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        name,
        resolvedTitle,
        postId,
        postUrl,
        imageUrl,
        content,
        resolvedSlug,
        metaDescription,
        religion,
        wpStatus,
        contentQuality,
        resolvedLastReviewed,
        resolvedCanonical || null,
        normalizedName,
        row.id,
      ]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO wordpress_posts (
       website_id, celebrity_name, post_title, post_id, post_url, image_url,
       content, slug, meta_description, religion, wp_status, content_quality,
       last_reviewed, canonical_slug, normalized_name
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      wid,
      name,
      resolvedTitle,
      postId,
      postUrl,
      imageUrl,
      content,
      resolvedSlug,
      metaDescription,
      religion,
      wpStatus,
      contentQuality,
      resolvedLastReviewed,
      resolvedCanonical || null,
      normalizedName,
    ]
  );
  return result.rows[0];
}

/** Enrich existing wordpress_posts rows with index columns. */
async function backfillFromWordpressPosts(websiteId) {
  const rows = await query(
    `SELECT * FROM wordpress_posts WHERE website_id = $1`,
    [websiteId]
  );

  let updated = 0;
  for (const row of rows.rows) {
    const normalizedName = normalizeCelebrityName(row.celebrity_name);
    const canonicalSlug =
      row.canonical_slug ||
      stripSlugSuffix(row.slug || slugFromPostUrl(row.post_url) || '');
    const lastReviewed =
      row.last_reviewed || parseLastReviewedFromContent(row.content);

    await query(
      `UPDATE wordpress_posts SET
         normalized_name = $1,
         wp_status = COALESCE(wp_status, 'publish'),
         content_quality = COALESCE(content_quality, 'unknown'),
         canonical_slug = COALESCE(canonical_slug, $2),
         last_reviewed = COALESCE(last_reviewed, $3),
         updated_at = NOW()
       WHERE id = $4`,
      [normalizedName, canonicalSlug || null, lastReviewed, row.id]
    );
    updated += 1;
  }
  return updated;
}

/** Import celebrity + URL pairs from trends table. */
async function backfillFromTrends(websiteId) {
  const rows = await query(
    `SELECT DISTINCT ON (normalized_name)
            celebrity_name, url, updated_at
     FROM (
       SELECT celebrity_name, url, updated_at,
              lower(trim(celebrity_name)) AS normalized_name
       FROM trends
       WHERE website_id = $1
         AND celebrity_name IS NOT NULL
         AND trim(celebrity_name) <> ''
         AND url IS NOT NULL
         AND trim(url) <> ''
     ) t
     ORDER BY normalized_name, updated_at DESC`,
    [websiteId]
  );

  let imported = 0;
  for (const row of rows.rows) {
    await upsertPersonPage({
      websiteId,
      celebrityName: row.celebrity_name,
      postUrl: row.url,
      wpStatus: 'publish',
      contentQuality: 'unknown',
    });
    imported += 1;
  }
  return imported;
}

/** Register unpublished article_drafts as draft person pages. */
async function backfillFromArticleDrafts(websiteId) {
  const rows = await query(
    `SELECT celebrity_name, draft_title, draft_html, image_url, answer_json, pipeline_status
     FROM article_drafts
     WHERE website_id = $1`,
    [websiteId]
  );

  let imported = 0;
  for (const row of rows.rows) {
    const wpStatus =
      row.pipeline_status === 'published' ? 'publish' : 'draft';
    const religion = row.answer_json?.religion || null;

    await upsertPersonPage({
      websiteId,
      celebrityName: row.celebrity_name,
      postTitle: row.draft_title || row.celebrity_name,
      content: row.draft_html,
      imageUrl: row.image_url,
      religion,
      wpStatus,
      contentQuality: 'unknown',
    });
    imported += 1;
  }
  return imported;
}

/** Discover published URLs from the public sitemap (not WP REST). */
async function backfillFromSitemap(websiteId, sitemapIndexUrl) {
  if (!sitemapIndexUrl?.trim()) return { scanned: 0, imported: 0 };

  const urlData = await fetchPostSitemapPageUrls(sitemapIndexUrl.trim());
  let imported = 0;

  for (const { url, lastmod } of urlData) {
    if (!PERSON_URL_PATTERN.test(url)) continue;

    const slug = slugFromPostUrl(url);
    if (!slug) continue;

    const celebrityName = celebrityNameFromSlug(slug);
    if (!celebrityName) continue;

    const lastReviewed = lastmod ? lastmod.slice(0, 10) : null;

    await upsertPersonPage({
      websiteId,
      celebrityName,
      postUrl: url,
      slug,
      wpStatus: 'publish',
      contentQuality: 'unknown',
      lastReviewed,
      canonicalSlug: stripSlugSuffix(slug),
    });
    imported += 1;
  }

  return { scanned: urlData.length, imported };
}

/**
 * Full app-side backfill: wordpress_posts → trends → article_drafts → sitemap.
 * Does not call WordPress REST API.
 */
export async function backfillPersonIndex(websiteId, { includeSitemap = true } = {}) {
  const wid = parseInt(websiteId, 10);
  if (!wid) {
    throw new Error('websiteId is required');
  }

  const enriched = await backfillFromWordpressPosts(wid);
  const fromTrends = await backfillFromTrends(wid);
  const fromDrafts = await backfillFromArticleDrafts(wid);

  let sitemap = { scanned: 0, imported: 0 };
  if (includeSitemap) {
    const website = await query('SELECT sitemap FROM websites WHERE id = $1', [wid]);
    const sitemapUrl = website.rows[0]?.sitemap;
    if (sitemapUrl) {
      sitemap = await backfillFromSitemap(wid, sitemapUrl);
    }
  }

  const total = await query(
    `SELECT COUNT(*)::int AS count FROM wordpress_posts
     WHERE website_id = $1 AND normalized_name IS NOT NULL
       AND (wp_status IS NULL OR wp_status <> 'trash')`,
    [wid]
  );

  return {
    enriched_existing: enriched,
    imported_from_trends: fromTrends,
    imported_from_drafts: fromDrafts,
    sitemap_scanned: sitemap.scanned,
    sitemap_imported: sitemap.imported,
    total_indexed: total.rows[0]?.count ?? 0,
  };
}

/** Load all active slug rows for fuzzy matching within a website. */
export async function loadIndexedSlugs(websiteId) {
  const result = await query(
    `SELECT id, celebrity_name, normalized_name, slug, canonical_slug, post_url,
            post_id, wp_status, content_quality, last_reviewed
     FROM wordpress_posts
     WHERE website_id = $1
       AND (wp_status IS NULL OR wp_status <> 'trash')
       AND (slug IS NOT NULL OR canonical_slug IS NOT NULL OR post_url IS NOT NULL)`,
    [parseInt(websiteId, 10)]
  );
  return result.rows;
}
