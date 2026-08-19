// Shared duplicate-detection logic, used by trend-search (checks new
// trending names before queuing them) and the one-time backfill route
// (re-validates old queue entries that predate this check existing).
// Extracted to a shared module so both call sites can never drift apart -
// a fix applied to one must apply to both, since a queue entry that
// predates trend-search's check is functionally identical to one that
// slipped through a bug in it.

// Normalizes a name the same way WordPress derives slugs from titles:
// lowercase, strip accents, strip punctuation, spaces -> hyphens. This lets
// us compare "Kylian Mbappé" against a slug like "kylian-mbappe-religion"
// (or the truncated "kylian-mbapp-religion") without needing exact string
// equality.
export function slugifyName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Strips a numeric WordPress duplicate-slug suffix, e.g. "-2", "-3", so
// "anne-hathaway-religion-2" compares equal to "anne-hathaway-religion".
export function stripSlugSuffix(slug) {
  return slug.replace(/-\d+$/, '');
}

// Levenshtein edit distance - needed because the accent-truncation bug
// drops a character in the MIDDLE of a slug (e.g. "kylian-mbappe-religion"
// -> "kylian-mbapp-religion", missing the 'e' before "-religion" follows),
// not just at the end. A simple startsWith/prefix check misses this
// entirely since the strings diverge mid-string, not just by length.
export function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function slugsAreCloseMatch(a, b) {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 5) return false; // too short to compare safely

  // Allow more edits for longer slugs (typos/accent drops scale with name
  // length), but keep the threshold tight enough that genuinely different
  // names (which differ by many characters) don't false-positive.
  const maxDistance = minLen < 12 ? 1 : minLen < 20 ? 2 : 3;
  return levenshteinDistance(a, b) <= maxDistance;
}

// Checks whether this celebrity already has a published article on the
// site. Returns the existing post's URL if found, otherwise null.
// Fails open (returns null) on any error, so a broken duplicate check
// blocks neither trend collection nor the backfill from making progress
// on other names.
export async function searchCelebrityUrl(celebrity) {
  try {
    const wpBase = process.env.WP_BASE_URL || 'https://whatreligionisinfo.com/wp-json/wp/v2';
    const targetSlug = `${slugifyName(celebrity)}-religion`;

    const response = await fetch(
      `${wpBase}/posts?search=${encodeURIComponent(celebrity)}&per_page=10&_fields=id,slug,link,title,status`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      console.error(`WordPress search failed for "${celebrity}": ${response.status}`);
      return null;
    }

    const posts = await response.json();
    if (!Array.isArray(posts)) return null;

    for (const post of posts) {
      const candidateSlug = stripSlugSuffix((post.slug || '').toLowerCase());
      if (slugsAreCloseMatch(targetSlug, candidateSlug)) {
        console.log(`🔁 Duplicate check: "${celebrity}" already covered by ${post.link} (slug: ${post.slug})`);
        return post.link;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error searching for ${celebrity}:`, error);
    return null;
  }
}
