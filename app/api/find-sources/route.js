import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/cronAuth';

// Comprehensive Religion LSI Words Dictionary
const RELIGION_LSI_WORDS = {
  // Christianity & denominations
  "christian": ["christian", "christianity", "christ", "jesus", "church", "biblical", "gospel", "protestant", "catholic", "orthodox", "baptist", "methodist", "pentecostal", "evangelical", "salvation", "trinity", "scripture", "bible", "pastor", "priest", "ministry", "denomination"],
  "catholic": ["catholic", "catholicism", "pope", "vatican", "papal", "mass", "rosary", "saints", "mary", "virgin", "diocese", "parish", "cardinal", "bishop", "nun", "monk", "confession", "communion", "eucharist", "cathedral"],
  "protestant": ["protestant", "protestantism", "reformed", "lutheran", "calvinist", "evangelical", "baptist", "methodist", "presbyterian", "anglican", "episcopal", "pentecostal", "charismatic", "born again"],
  "mormon": ["mormon", "lds", "latter-day saints", "joseph smith", "book of mormon", "temple", "missionary", "utah", "brigham young", "salt lake", "tabernacle", "prophet", "priesthood"],
  "jehovah": ["jehovah", "witness", "watchtower", "kingdom hall", "armageddon", "memorial", "governing body", "new world translation", "awake", "theocracy"],
  
  // Islam
  "muslim": ["muslim", "islam", "islamic", "allah", "prophet", "muhammad", "quran", "koran", "mosque", "imam", "hajj", "ramadan", "sharia", "sunni", "shia", "sufi", "prayer", "mecca", "medina", "halal", "jihad", "minaret", "mihrab"],
  "islam": ["muslim", "islam", "islamic", "allah", "prophet", "muhammad", "quran", "koran", "mosque", "imam", "hajj", "ramadan", "sharia", "sunni", "shia", "sufi", "prayer", "mecca", "medina", "halal", "ummah"],
  
  // Judaism
  "jewish": ["jewish", "judaism", "jew", "hebrew", "israel", "torah", "synagogue", "rabbi", "kosher", "sabbath", "shabbat", "passover", "yom kippur", "bar mitzvah", "bat mitzvah", "orthodox", "conservative", "reform", "hasidic", "zionist", "talmud", "kabbalah"],
  "judaism": ["jewish", "judaism", "jew", "hebrew", "israel", "torah", "synagogue", "rabbi", "kosher", "sabbath", "shabbat", "passover", "yom kippur", "talmud", "kabbalah", "menorah", "seder"],
  
  // Hinduism
  "hindu": ["hindu", "hinduism", "vedic", "krishna", "vishnu", "shiva", "brahma", "karma", "dharma", "reincarnation", "yoga", "meditation", "guru", "ashram", "temple", "mandir", "puja", "diwali", "holi", "ganges", "sacred", "moksha", "samsara"],
  "hinduism": ["hindu", "hinduism", "vedic", "krishna", "vishnu", "shiva", "brahma", "karma", "dharma", "reincarnation", "yoga", "meditation", "guru", "vedas", "upanishads", "bhagavad gita"],
  
  // Buddhism
  "buddhist": ["buddhist", "buddhism", "buddha", "zen", "meditation", "dharma", "karma", "nirvana", "enlightenment", "monastery", "monk", "temple", "mindfulness", "compassion", "suffering", "rebirth", "lotus", "tibetan", "dalai lama", "sangha", "samsara"],
  "buddhism": ["buddhist", "buddhism", "buddha", "zen", "meditation", "dharma", "karma", "nirvana", "enlightenment", "monastery", "monk", "temple", "mindfulness", "four noble truths", "eightfold path"],
  
  // Sikhism
  "sikh": ["sikh", "sikhism", "guru", "gurdwara", "punjabi", "turban", "khalsa", "granth", "waheguru", "amrit", "kirtan", "langar", "five ks", "guru nanak"],
  
  // Other religions/beliefs
  "scientology": ["scientology", "scientologist", "dianetics", "hubbard", "thetan", "audit", "clear", "ot", "sea org", "xenu", "engram", "reactive mind", "e-meter", "suppressive person"],
  "atheist": ["atheist", "atheism", "secular", "non-religious", "agnostic", "humanist", "rationalist", "skeptic", "freethinker", "materialist", "naturalist"],
  "agnostic": ["agnostic", "agnosticism", "skeptical", "uncertain", "questioning", "doubt", "unknown", "undecided", "fence-sitter"],
  "spiritual": ["spiritual", "spirituality", "metaphysical", "mystical", "transcendent", "divine", "sacred", "soul", "consciousness", "universe", "new age", "holistic"],
  "bahai": ["bahai", "baha'i", "bahaullah", "unity", "universal", "abdul-baha", "shrine", "nineteen day fast", "devotions"],
  "pagan": ["pagan", "paganism", "wiccan", "witch", "druid", "celtic", "norse", "ritual", "coven", "sabbat", "solstice", "equinox", "earth-based"],
  "unitarian": ["unitarian", "universalist", "liberal", "inclusive", "non-creedal", "humanistic", "welcoming", "progressive"]
};

// Known low-authority "celebrity religion" content-farm domains, identified
// by hand while researching the same niche this site competes in. Sourcing
// from these produces a rewrite-of-a-rewrite: weak E-E-A-T, and near-
// impossible to outrank the site you copied, since you're one step removed
// from whatever it copied too.
const BLOCKED_DOMAINS = [
  'worldsporthub.com',
  'superstarsculture.com',
  'wealthypeeps.com',
  'biobeliefs.com',
  'faithicons.net',
  'celebritybeliefs.com',
  'wikiage.org',
  'b.wikiage.org',
  'wikibious.com',
  'isjewish.com',
  'thecityceleb.com',
  'instrumentalfx.co',
  'leaderbiography.com',
  'biostory.com.ng',
  'thesaga.com.ng',
  'religionstars.com',
  'crickexpkr.com',
  'folioz.ca',
  'essiebookblog.com.ng',
  'iconpolls.com',
  'bioglance.in',
  'g.mlga.ek.gov.ng',
];

// Reputable, high-authority domains worth preferring when they show up -
// real journalism and primary sources beat other content-farm rewrites.
const PREFERRED_DOMAINS = [
  'wikipedia.org', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'theguardian.com',
  'espn.com', 'apnews.com', 'reuters.com', 'people.com', 'cnn.com',
  'forbes.com', 'variety.com', 'hollywoodreporter.com', 'rollingstone.com',
  'billboard.com', 'si.com', 'skysports.com', 'goal.com', 'cricbuzz.com',
  'espncricinfo.com', 'aljazeera.com', 'nbcnews.com', 'washingtonpost.com',
  'usatoday.com', 'latimes.com', 'time.com', 'vanityfair.com', 'gq.com',
  'independent.co.uk', 'telegraph.co.uk', 'newsweek.com', 'huffpost.com',
  'vulture.com', 'eonline.com', 'imdb.com', 'britannica.com',
];

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isBlockedDomain(domain) {
  if (BLOCKED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return true;
  }
  // Any domain with "religion" literally in it is almost certainly a direct
  // competitor in this exact content-farm genre, not a primary source -
  // legitimate news/encyclopedic sources essentially never do this.
  if (domain.includes('religion')) {
    return true;
  }
  return false;
}

function isPreferredDomain(domain) {
  return PREFERRED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

// Extract religion context from query
function extractReligionContext(query) {
  const queryLower = query.toLowerCase();
  const detectedReligions = [];
  const relevantLsiWords = new Set();
  
  // Find religions mentioned in query
  for (const [religionKey, lsiWords] of Object.entries(RELIGION_LSI_WORDS)) {
    if (queryLower.includes(religionKey)) {
      detectedReligions.push(religionKey);
      lsiWords.forEach(word => relevantLsiWords.add(word));
    } else {
      // Check if any LSI words are in the query
      for (let i = 0; i < Math.min(5, lsiWords.length); i++) {
        if (queryLower.includes(lsiWords[i])) {
          detectedReligions.push(religionKey);
          lsiWords.forEach(word => relevantLsiWords.add(word));
          break;
        }
      }
    }
  }
  
  return { detectedReligions, lsiWords: Array.from(relevantLsiWords) };
}

// Check if text contains search terms or religion LSI words
function checkLsiMatch(text, searchTerms, lsiWords) {
  const textLower = text.toLowerCase();
  
  // Check exact search terms
  const exactMatches = searchTerms.filter(term => textLower.includes(term)).length;
  
  // Check LSI word matches
  const lsiMatches = lsiWords.filter(lsiWord => textLower.includes(lsiWord)).length;
  
  // Return True if we have good matches
  // Either all search terms OR significant LSI matches
  if (exactMatches >= searchTerms.length) { // All search terms found
    return { match: true, exact: exactMatches, lsi: lsiMatches };
  } else if (exactMatches >= 1 && lsiMatches >= 2) { // Some search terms + LSI words
    return { match: true, exact: exactMatches, lsi: lsiMatches };
  } else if (lsiMatches >= 3) { // Strong LSI word presence
    return { match: true, exact: exactMatches, lsi: lsiMatches };
  }
  
  return { match: false, exact: exactMatches, lsi: lsiMatches };
}

// GET endpoint for finding sources
export async function GET(request) {
  try {
    // Check authentication
    if (!(await isAuthorized(request))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    if (!query.trim()) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.SERPAPI_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'SERPAPI_KEY not found in environment variables' },
        { status: 500 }
      );
    }

    // Build parameters for SerpAPI
    const params = new URLSearchParams({
      engine: 'google',
      q: query,
      api_key: apiKey,
      num: '20' // Increased for better matching with LSI
    });

    // Make request to SerpAPI
    const baseUrl = 'https://serpapi.com/search.json';
    const response = await fetch(`${baseUrl}?${params.toString()}`);

    if (!response.ok) {
      let errorDetails = '';
      let errorMessage = '';
      try {
        const errorData = await response.json();
        errorDetails = errorData.error || errorData.message || JSON.stringify(errorData);
        errorMessage = errorData.error || errorData.message || errorDetails;
      } catch (e) {
        errorDetails = await response.text();
        errorMessage = errorDetails;
      }
      
      console.error('SerpAPI error response:', {
        status: response.status,
        statusText: response.statusText,
        details: errorDetails
      });

      return NextResponse.json(
        { 
          error: 'SerpAPI Error', 
          message: errorMessage || `API returned ${response.status} ${response.statusText}`,
          details: errorDetails
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check for error in response
    if (data.error) {
      return NextResponse.json(
        { 
          error: 'API Error', 
          message: data.error,
          details: data.error
        },
        { status: 400 }
      );
    }

    const organicResults = data.organic_results || [];

    if (!organicResults || organicResults.length === 0) {
      return NextResponse.json(
        { error: 'No search results found', keyword: query },
        { status: 404 }
      );
    }

    // Extract religion context from query
    const { detectedReligions, lsiWords } = extractReligionContext(query);

    // Track used URLs to ensure uniqueness
    const usedUrls = new Set();

    // Initialize result URLs
    let wikiUrl = '';

    const queryLower = query.toLowerCase();
    const searchTerms = queryLower.split(' ').filter(term => term.length > 2);

    // Store all candidates with their scores
    const allCandidates = [];

    for (const result of organicResults) {
      const title = result.title || '';
      const snippet = result.snippet || '';
      const link = result.link || '';
      const displayedLink = result.displayed_link || '';

      const titleLower = title.toLowerCase();
      const snippetLower = snippet.toLowerCase();
      const displayedLinkLower = displayedLink.toLowerCase();

      // Check if this is Wikipedia
      const isWikipedia = displayedLinkLower.includes('wikipedia') || link.toLowerCase().includes('wikipedia.org');

      const domain = getDomain(link);

      // Skip known content-farm domains and anything else in this exact
      // "X religion" genre entirely - never use them as a source, no
      // matter how well they match keywords.
      if (!isWikipedia && domain && isBlockedDomain(domain)) {
        continue;
      }

      // Calculate title match score
      const titleMatch = checkLsiMatch(title, searchTerms, lsiWords);
      const titleScore = titleMatch.match ? titleMatch.exact * 3 + titleMatch.lsi : 0;

      // Calculate description match score
      const descMatch = checkLsiMatch(snippet, searchTerms, lsiWords);
      const descScore = descMatch.match ? descMatch.exact * 3 + descMatch.lsi : 0;

      // Prefer known reputable outlets over unknown/low-authority ones when
      // relevance is otherwise comparable.
      const authorityBoost = isPreferredDomain(domain) ? 5 : 0;

      // Add to candidates list
      allCandidates.push({
        url: link,
        title: title,
        snippet: snippet,
        domain: domain,
        isWikipedia: isWikipedia,
        isPreferred: isPreferredDomain(domain),
        titleScore: titleScore,
        descScore: descScore,
        totalScore: titleScore + descScore + authorityBoost
      });
    }

    // Sort candidates by total score (highest first)
    allCandidates.sort((a, b) => b.totalScore - a.totalScore);

    const MAX_SOURCES = 6; // Wikipedia + up to 5 more

    // Pick Wikipedia first if present (still a useful baseline source).
    const wikiCandidate = allCandidates.find((c) => c.isWikipedia);
    if (wikiCandidate) {
      wikiUrl = wikiCandidate.url;
      usedUrls.add(wikiCandidate.url);
    }

    // Then fill remaining slots with the highest-scoring non-Wikipedia
    // candidates, preferring one URL per domain so sources are genuinely
    // diverse (multiple pages from the same site don't add independent
    // corroboration - they're the same voice twice).
    const seenDomains = new Set(wikiCandidate ? ['wikipedia.org'] : []);
    const selectedUrls = [];

    for (const candidate of allCandidates) {
      if (selectedUrls.length >= MAX_SOURCES - (wikiUrl ? 1 : 0)) break;
      if (usedUrls.has(candidate.url) || candidate.isWikipedia) continue;
      if (candidate.domain && seenDomains.has(candidate.domain)) continue;
      if (candidate.totalScore <= 0) continue;

      selectedUrls.push(candidate.url);
      usedUrls.add(candidate.url);
      if (candidate.domain) seenDomains.add(candidate.domain);
    }

    // If domain-diversity filtering left us with too few sources (small
    // result set), relax the one-per-domain rule as a fallback rather than
    // publishing on just 1-2 sources.
    if (selectedUrls.length < 2) {
      for (const candidate of allCandidates) {
        if (selectedUrls.length >= MAX_SOURCES - (wikiUrl ? 1 : 0)) break;
        if (usedUrls.has(candidate.url) || candidate.isWikipedia) continue;
        selectedUrls.push(candidate.url);
        usedUrls.add(candidate.url);
      }
    }

    const allSources = [wikiUrl, ...selectedUrls].filter(Boolean);
    const preferredCount = allCandidates.filter(
      (c) => allSources.includes(c.url) && c.isPreferred
    ).length;

    console.log(`Find sources result for "${query}": ${allSources.length} sources (${preferredCount} from preferred/reputable domains)`, allSources);

    return NextResponse.json({
      keyword: query,
      wikipedia: wikiUrl,
      sources: allSources,
      // Kept for backward compatibility with any older consumers.
      religionURL: selectedUrls[0] || '',
      religion: selectedUrls[1] || ''
    });
  } catch (error) {
    console.error('Error in find-sources API:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to find sources', 
        message: error.message,
        details: error.message 
      },
      { status: 500 }
    );
  }
}
