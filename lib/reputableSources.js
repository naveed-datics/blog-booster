/** Allowlist for faith-news gate (72h Tavily results). */

const REPUTABLE_DOMAINS = new Set([
  'apnews.com',
  'www.apnews.com',
  'reuters.com',
  'www.reuters.com',
  'bbc.com',
  'www.bbc.com',
  'bbc.co.uk',
  'www.bbc.co.uk',
  'npr.org',
  'www.npr.org',
  'religionnews.com',
  'www.religionnews.com',
  'jta.org',
  'www.jta.org',
  'premierchristianity.com',
  'www.premierchristianity.com',
  'catholicnewsagency.com',
  'www.catholicnewsagency.com',
  'nytimes.com',
  'www.nytimes.com',
  'washingtonpost.com',
  'www.washingtonpost.com',
  'theguardian.com',
  'www.theguardian.com',
  'cnn.com',
  'www.cnn.com',
  'pbs.org',
  'www.pbs.org',
  'axios.com',
  'www.axios.com',
  'politico.com',
  'www.politico.com',
  'theatlantic.com',
  'www.theatlantic.com',
  'time.com',
  'www.time.com',
  'wsj.com',
  'www.wsj.com',
  'christianitytoday.com',
  'www.christianitytoday.com',
  'churchleaders.com',
  'www.churchleaders.com',
]);

const FAITH_KEYWORDS =
  /\b(faith|religion|christian|muslim|islam|jewish|judaism|catholic|protestant|hindu|buddhist|sikh|atheist|agnostic|church|mosque|synagogue|temple|conversion|converted|baptized|baptised|evangelical|spiritual)\b/i;

export function domainFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isReputableDomain(url) {
  const domain = normalizeDomain(url);
  if (!domain) return false;
  return (
    REPUTABLE_DOMAINS.has(domain) ||
    REPUTABLE_DOMAINS.has(`www.${domain}`)
  );
}

export function mentionsFaith(text) {
  return FAITH_KEYWORDS.test(text || '');
}

export function countReputableFaithNews(results) {
  if (!Array.isArray(results)) return 0;
  let count = 0;
  for (const r of results) {
    const url = r.url || r.link || '';
    const snippet = `${r.title || ''} ${r.content || r.snippet || ''}`;
    if (isReputableDomain(url) && mentionsFaith(snippet)) {
      count += 1;
    }
  }
  return count;
}

export { REPUTABLE_DOMAINS };
