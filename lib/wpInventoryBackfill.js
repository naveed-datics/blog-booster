import { query } from './db.js';
import { getWpAuthHeaders, getWpBaseUrl } from './wpClient.js';
import {
  celebrityNameFromSlug,
  normalizeCelebrityName,
  stripSlugSuffix,
  slugsAreCloseMatch,
} from './personName.js';
import { upsertPersonPageByPostId } from './personIndex.js';

const PERSON_SLUG_PATTERN =
  /(?:^|-)(religion|faith)$|^what-religion-is-|^what-religion-was-|^what-faith-is-/i;

function isPersonSlug(slug) {
  if (!slug) return false;
  const s = slug.toLowerCase();
  if (PERSON_SLUG_PATTERN.test(s)) return true;
  if (s.endsWith('-religion') || s.endsWith('-faith')) return true;
  if (s.startsWith('what-religion-is-') || s.startsWith('what-religion-was-')) return true;
  return false;
}

async function fetchAllWpPosts() {
  const base = getWpBaseUrl();
  const headers = getWpAuthHeaders();
  const all = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url =
      `${base}/posts?per_page=${perPage}&page=${page}` +
      `&status=publish,draft,trash&context=edit&_fields=id,slug,link,title,status,content,modified`;

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(60000),
    });

    if (res.status === 400) break;
    if (!res.ok) {
      throw new Error(`WP inventory fetch failed: ${res.status} ${await res.text()}`);
    }

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
    if (page > 200) break;
  }

  return all;
}

function celebrityFromPost(post) {
  const slug = post.slug || '';
  const fromSlug = celebrityNameFromSlug(slug);
  if (fromSlug) return fromSlug;

  const title = post.title?.rendered || post.title || '';
  if (title && typeof title === 'string') {
    return title.replace(/<[^>]+>/g, '').trim();
  }
  return fromSlug;
}

function groupDuplicateCandidates(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = row.normalized_name;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const pairs = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const slugA = stripSlugSuffix((a.slug || '').toLowerCase());
        const slugB = stripSlugSuffix((b.slug || '').toLowerCase());
        if (
          slugA === slugB ||
          slugsAreCloseMatch(slugA, slugB) ||
          a.normalized_name === b.normalized_name
        ) {
          pairs.push([a, b]);
        }
      }
    }
  }
  return pairs;
}

function scoreSlugCanonical(slug) {
  if (!slug) return 0;
  const s = slug.toLowerCase();
  if (s.startsWith('what-religion-is-')) return 100;
  if (s.startsWith('what-religion-was-')) return 90;
  if (s.endsWith('-religion') && !/-religion-\d+$/.test(s)) return 50;
  if (s.endsWith('-faith')) return 40;
  return 10;
}

function pickCanonicalFromPair(a, b) {
  const scoreA = scoreSlugCanonical(a.slug) + (a.wp_status === 'publish' ? 5 : 0);
  const scoreB = scoreSlugCanonical(b.slug) + (b.wp_status === 'publish' ? 5 : 0);
  if (scoreA !== scoreB) return scoreA > scoreB ? a : b;
  const idA = a.post_id ?? Number.MAX_SAFE_INTEGER;
  const idB = b.post_id ?? Number.MAX_SAFE_INTEGER;
  return idA <= idB ? a : b;
}

async function recordDuplicatePair(websiteId, canonical, duplicate) {
  if (!duplicate.post_id) return;

  await query(
    `INSERT INTO duplicate_pairs
      (website_id, canonical_post_id, duplicate_post_id, canonical_slug, duplicate_slug, normalized_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (website_id, duplicate_post_id) DO UPDATE SET
       canonical_post_id = EXCLUDED.canonical_post_id,
       canonical_slug = EXCLUDED.canonical_slug,
       duplicate_slug = EXCLUDED.duplicate_slug,
       normalized_name = EXCLUDED.normalized_name`,
    [
      websiteId,
      canonical.post_id,
      duplicate.post_id,
      canonical.slug,
      duplicate.slug,
      canonical.normalized_name,
    ]
  );
}

/**
 * One-shot full WordPress inventory into wordpress_posts + duplicate_pairs.
 */
export async function backfillWpInventory(websiteId, { dryRun = false } = {}) {
  const wid = parseInt(websiteId, 10);
  if (!wid) throw new Error('websiteId is required');

  const posts = await fetchAllWpPosts();
  const personPosts = posts.filter((p) => isPersonSlug(p.slug));

  const indexed = [];
  let upserted = 0;
  let skipped = 0;

  for (const post of personPosts) {
    const celebrityName = celebrityFromPost(post);
    if (!celebrityName) {
      skipped += 1;
      continue;
    }

    const rawContent =
      typeof post.content?.raw === 'string' ? post.content.raw : null;

    const row = {
      websiteId: wid,
      celebrityName,
      postId: post.id,
      postTitle:
        typeof post.title?.rendered === 'string'
          ? post.title.rendered.replace(/<[^>]+>/g, '')
          : celebrityName,
      postUrl: post.link || null,
      slug: post.slug,
      content: rawContent,
      wpStatus: post.status || 'publish',
      contentQuality: 'unknown',
      canonicalSlug: stripSlugSuffix(post.slug || ''),
      normalized_name: normalizeCelebrityName(celebrityName),
    };

    indexed.push(row);

    if (!dryRun) {
      await upsertPersonPageByPostId({
        websiteId: wid,
        celebrityName: row.celebrityName,
        postId: row.postId,
        postTitle: row.postTitle,
        postUrl: row.postUrl,
        slug: row.slug,
        content: row.content,
        wpStatus: row.wpStatus,
        contentQuality: row.contentQuality,
        canonicalSlug: row.canonicalSlug,
      });
      upserted += 1;
    }
  }

  const pairs = groupDuplicateCandidates(indexed);
  let duplicatePairsRecorded = 0;

  if (!dryRun) {
    for (const [a, b] of pairs) {
      const canonical = pickCanonicalFromPair(a, b);
      const duplicate = canonical.post_id === a.post_id ? b : a;
      await recordDuplicatePair(wid, canonical, duplicate);
      duplicatePairsRecorded += 1;
    }
  }

  return {
    dry_run: dryRun,
    wp_posts_fetched: posts.length,
    person_posts_matched: personPosts.length,
    upserted,
    skipped,
    duplicate_pairs_detected: pairs.length,
    duplicate_pairs_recorded: duplicatePairsRecorded,
  };
}
