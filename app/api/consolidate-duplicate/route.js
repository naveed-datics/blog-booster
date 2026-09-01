import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/cronAuth';
import { consolidateDuplicatePair } from '@/lib/consolidatePerson';
import { query } from '@/lib/db';

/**
 * POST consolidate duplicate pair (E2E: Hegseth 3229 vs 13179).
 * Body: { website_id, user_id, canonical_post_id, duplicate_post_id, dry_run? }
 */
export async function POST(request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const websiteId = body.website_id ?? body.websiteId;
  const userId = body.user_id ?? body.userId;
  const dryRun = body.dry_run === true;

  let canonicalPostId = body.canonical_post_id;
  let duplicatePostId = body.duplicate_post_id;
  let celebrityName = body.celebrity_name || 'Unknown';

  if (body.pair_id) {
    const pair = await query(
      `SELECT * FROM duplicate_pairs WHERE id = $1 AND website_id = $2`,
      [body.pair_id, parseInt(websiteId, 10)]
    );
    if (pair.rows[0]) {
      canonicalPostId = pair.rows[0].canonical_post_id;
      duplicatePostId = pair.rows[0].duplicate_post_id;
      celebrityName = pair.rows[0].normalized_name || celebrityName;
    }
  }

  const posts = await query(
    `SELECT post_id, post_url, celebrity_name FROM wordpress_posts
     WHERE website_id = $1 AND post_id = ANY($2::int[])`,
    [parseInt(websiteId, 10), [canonicalPostId, duplicatePostId].filter(Boolean)]
  );

  const urlById = Object.fromEntries(posts.rows.map((r) => [r.post_id, r.post_url]));
  const nameRow = posts.rows.find((r) => r.celebrity_name);
  if (nameRow) celebrityName = nameRow.celebrity_name;

  const result = await consolidateDuplicatePair({
    websiteId,
    userId,
    canonicalPostId,
    duplicatePostId,
    canonicalUrl: urlById[canonicalPostId],
    duplicateUrl: urlById[duplicatePostId],
    celebrityName,
    dryRun,
  });

  return NextResponse.json(result);
}
