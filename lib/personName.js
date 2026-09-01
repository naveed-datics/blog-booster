import {
  slugifyName,
  stripSlugSuffix,
  slugsAreCloseMatch,
} from './duplicateCheck.js';

export { slugifyName, stripSlugSuffix, slugsAreCloseMatch };

const SUFFIX_TITLES = /\b(jr\.?|sr\.?|ii|iii|iv)\.?$/i;
const LEADING_THE = /^the\s+/i;

/** Normalized celebrity name for DB lookups (accent-stripped, lowercase, trimmed). */
export function normalizeCelebrityName(name) {
  if (!name || typeof name !== 'string') return '';
  let s = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, "'")
    .toLowerCase()
    .trim()
    .replace(LEADING_THE, '')
    .replace(SUFFIX_TITLES, '')
    .trim()
    .replace(/\s+/g, ' ');
  return s;
}

/** Candidate URL slugs for a person (no WP API needed). */
export function buildSlugCandidates(celebrityName) {
  const base = slugifyName(celebrityName);
  if (!base) return [];

  const candidates = [
    `${base}-religion`,
    `${base}-faith`,
    `${base}-religion-2`,
    `what-religion-is-${base}`,
    `what-religion-was-${base}`,
    `what-faith-is-${base}`,
    base,
  ];

  return [...new Set(candidates)];
}

/** Extract slug path segment from a full post URL. */
export function slugFromPostUrl(postUrl) {
  if (!postUrl || typeof postUrl !== 'string') return null;
  try {
    const pathname = new URL(postUrl.trim()).pathname.replace(/^\/+|\/+$/g, '');
    if (!pathname) return null;
    return pathname.split('/').filter(Boolean).pop() || null;
  } catch {
    const cleaned = postUrl.trim().replace(/^https?:\/\/[^/]+\/?/i, '').replace(/\/$/, '');
    if (!cleaned) return null;
    return cleaned.split('/').filter(Boolean).pop() || null;
  }
}

/** Best-effort celebrity display name from a post slug. */
export function celebrityNameFromSlug(slug) {
  if (!slug) return null;
  let s = stripSlugSuffix(slug.toLowerCase());

  if (s.startsWith('what-religion-is-')) {
    s = s.slice('what-religion-is-'.length);
  } else if (s.startsWith('what-religion-was-')) {
    s = s.slice('what-religion-was-'.length);
  } else if (s.startsWith('what-faith-is-')) {
    s = s.slice('what-faith-is-'.length);
  } else if (s.endsWith('-religion')) {
    s = s.slice(0, -'-religion'.length);
  } else if (s.endsWith('-faith')) {
    s = s.slice(0, -'-faith'.length);
  }

  if (!s) return null;
  return s
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Parse "Last reviewed: Month D, YYYY" from stored HTML. */
export function parseLastReviewedFromContent(contentHtml) {
  if (!contentHtml || typeof contentHtml !== 'string') return null;
  const match = contentHtml.match(
    /Last reviewed:\s*([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i
  );
  if (!match) return null;

  const monthNames = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12',
  };
  const month = monthNames[match[1].toLowerCase()];
  if (!month) return null;
  const day = match[2].padStart(2, '0');
  return `${match[3]}-${month}-${day}`;
}
