import { query } from '@/lib/db';
import { google } from 'googleapis';
import { getAuthenticatedClient, resolveSiteUrl } from '@/lib/google-search-console';
import {
  getRecoveryMinWeeks,
  getRecoveryStartDate,
  setRecoveryLoosenedCache,
} from '@/lib/pipelineConfig';

async function fetchCohortMetrics(authClient, siteUrl, pageUrls, days) {
  const searchconsole = google.searchconsole({ version: 'v1', auth: authClient });
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const fmt = (d) => d.toISOString().split('T')[0];

  const impressions = [];
  const positions = [];

  for (const pageUrl of pageUrls.slice(0, 100)) {
    try {
      const response = await searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ['page'],
          dimensionFilterGroups: [
            {
              filters: [
                { dimension: 'page', operator: 'equals', expression: pageUrl },
              ],
            },
          ],
          rowLimit: 1,
        },
      });
      const row = response.data.rows?.[0];
      if (row) {
        impressions.push(row.impressions || 0);
        if (row.position != null) positions.push(row.position);
      }
    } catch {
      // skip individual URL failures
    }
  }

  const median = (arr) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  return {
    medianImpressions: median(impressions),
    medianPosition: median(positions),
    sampleSize: impressions.length,
  };
}

/**
 * Weekly GSC cohort check — loosen recovery limits when cohort improves.
 */
export async function evaluateGscRecoverySignal(websiteId, userId) {
  const startDate = getRecoveryStartDate();
  if (!startDate) {
    return { loosened: false, reason: 'RECOVERY_START_DATE not set' };
  }

  const weeksElapsed =
    (Date.now() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000);
  if (weeksElapsed < getRecoveryMinWeeks()) {
    return {
      loosened: false,
      reason: `only ${weeksElapsed.toFixed(1)} weeks elapsed (min ${getRecoveryMinWeeks()})`,
    };
  }

  const posts = await query(
    `SELECT post_url FROM wordpress_posts
     WHERE website_id = $1 AND wp_status = 'publish' AND post_url IS NOT NULL
       AND created_at <= $2
     ORDER BY created_at ASC
     LIMIT 200`,
    [parseInt(websiteId, 10), startDate]
  );

  const urls = posts.rows.map((r) => r.post_url).filter(Boolean);
  if (urls.length === 0) {
    return { loosened: false, reason: 'no cohort URLs' };
  }

  const authClient = await getAuthenticatedClient(userId);
  const siteResult = await query(`SELECT url FROM websites WHERE id = $1`, [
    parseInt(websiteId, 10),
  ]);
  const siteUrl = await resolveSiteUrl(
    authClient,
    siteResult.rows[0]?.url || 'https://whatreligionisinfo.com/'
  );

  const recent = await fetchCohortMetrics(authClient, siteUrl, urls, 28);
  const prior = await fetchCohortMetrics(authClient, siteUrl, urls, 56);

  const impressionLift =
    prior.medianImpressions > 0
      ? (recent.medianImpressions - prior.medianImpressions) / prior.medianImpressions
      : 0;
  const positionImproved = recent.medianPosition < prior.medianPosition;

  const shouldLoosen = impressionLift >= 0.2 && positionImproved;

  if (shouldLoosen) {
    await query(
      `INSERT INTO pipeline_settings (website_id, setting_key, setting_value, updated_at)
       VALUES ($1, 'recovery_loosened_at', $2, NOW())
       ON CONFLICT (website_id, setting_key) DO UPDATE SET
         setting_value = EXCLUDED.setting_value,
         updated_at = NOW()`,
      [
        parseInt(websiteId, 10),
        JSON.stringify({ at: new Date().toISOString(), recent, prior, impressionLift }),
      ]
    );
    setRecoveryLoosenedCache(true);
  }

  return {
    loosened: shouldLoosen,
    recent,
    prior,
    impressionLift,
    positionImproved,
  };
}

export async function loadRecoveryLoosenedFromDb(websiteId) {
  const result = await query(
    `SELECT setting_value FROM pipeline_settings
     WHERE website_id = $1 AND setting_key = 'recovery_loosened_at'`,
    [parseInt(websiteId, 10)]
  );
  const loosened = result.rows.length > 0;
  setRecoveryLoosenedCache(loosened);
  return loosened;
}
