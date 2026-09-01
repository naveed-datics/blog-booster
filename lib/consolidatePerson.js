import { google } from 'googleapis';
import { query } from '@/lib/db';
import { getAuthenticatedClient, resolveSiteUrl } from '@/lib/google-search-console';
import { getWpAuthHeaders, getWpBaseUrl } from '@/lib/wpClient';
import { queueForReview } from '@/lib/reviewQueue';

const WP_BASE = getWpBaseUrl();

async function fetchPageImpressions(authClient, siteUrl, pageUrl, days = 28) {
  const searchconsole = google.searchconsole({ version: 'v1', auth: authClient });
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const fmt = (d) => d.toISOString().split('T')[0];

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      dimensions: ['page'],
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: 'page',
              operator: 'equals',
              expression: pageUrl,
            },
          ],
        },
      ],
      rowLimit: 1,
    },
  });

  const row = response.data.rows?.[0];
  return {
    impressions: row?.impressions ?? 0,
    clicks: row?.clicks ?? 0,
    position: row?.position ?? null,
  };
}

async function createRankMathRedirect(fromUrl, toUrl) {
  const rankBase = WP_BASE.replace(/\/wp\/v2$/, '');
  try {
    const res = await fetch(`${rankBase}/rankmath/v1/redirection`, {
      method: 'POST',
      headers: getWpAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        sources: [{ pattern: fromUrl, comparison: 'exact' }],
        url_to: toUrl,
        header_code: '301',
        status: 'active',
      }),
    });
    return res.ok;
  } catch (error) {
    console.error('Rank Math redirect error:', error);
    return false;
  }
}

async function trashWpPost(postId) {
  const res = await fetch(`${WP_BASE}/posts/${postId}`, {
    method: 'DELETE',
    headers: getWpAuthHeaders(),
  });
  return res.ok;
}

/**
 * Consolidate duplicate pair: GSC impressions pick canonical, 301, trash duplicate.
 */
export async function consolidateDuplicatePair({
  websiteId,
  userId,
  canonicalPostId,
  duplicatePostId,
  canonicalUrl,
  duplicateUrl,
  celebrityName,
  dryRun = false,
}) {
  if (!userId) {
    return { success: false, reason: 'GSC userId required for impressions' };
  }

  const authClient = await getAuthenticatedClient(userId);
  const siteResult = await query(`SELECT url FROM websites WHERE id = $1`, [
    parseInt(websiteId, 10),
  ]);
  const siteUrl = siteResult.rows[0]?.url || 'https://whatreligionisinfo.com/';
  const resolvedSite = await resolveSiteUrl(authClient, siteUrl);

  const canonMetrics = await fetchPageImpressions(authClient, resolvedSite, canonicalUrl);
  const dupMetrics = await fetchPageImpressions(authClient, resolvedSite, duplicateUrl);

  let canonicalId = canonicalPostId;
  let duplicateId = duplicatePostId;
  let finalCanonicalUrl = canonicalUrl;
  let finalDuplicateUrl = duplicateUrl;

  if (dupMetrics.impressions > canonMetrics.impressions) {
    canonicalId = duplicatePostId;
    duplicateId = canonicalPostId;
    finalCanonicalUrl = duplicateUrl;
    finalDuplicateUrl = canonicalUrl;
  } else if (dupMetrics.impressions === canonMetrics.impressions) {
    await queueForReview({
      websiteId,
      celebrityName,
      failedGate: 'consolidate_tie',
      gateDetail: { canonMetrics, dupMetrics, canonicalUrl, duplicateUrl },
      proposedAction: 'consolidate',
    });
    return {
      success: false,
      reason: 'GSC impressions tie — queued for review',
      canonMetrics,
      dupMetrics,
    };
  }

  if (dryRun) {
    return {
      success: true,
      dry_run: true,
      canonical_post_id: canonicalId,
      duplicate_post_id: duplicateId,
      canonMetrics,
      dupMetrics,
    };
  }

  const redirectOk = await createRankMathRedirect(finalDuplicateUrl, finalCanonicalUrl);
  const trashOk = await trashWpPost(duplicateId);

  await query(
    `UPDATE duplicate_pairs SET consolidated_at = NOW(), canonical_post_id = $1
     WHERE website_id = $2 AND duplicate_post_id = $3`,
    [canonicalId, parseInt(websiteId, 10), duplicateId]
  );

  await query(
    `UPDATE wordpress_posts SET wp_status = 'trash', updated_at = NOW()
     WHERE website_id = $1 AND post_id = $2`,
    [parseInt(websiteId, 10), duplicateId]
  );

  return {
    success: redirectOk && trashOk,
    canonical_post_id: canonicalId,
    duplicate_post_id: duplicateId,
    redirect_created: redirectOk,
    duplicate_trashed: trashOk,
    canonMetrics,
    dupMetrics,
  };
}

export { fetchPageImpressions };
