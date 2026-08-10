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
    let titleMatchUrl = '';
    let descriptionMatchUrl = '';

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

      // Calculate title match score
      const titleMatch = checkLsiMatch(title, searchTerms, lsiWords);
      const titleScore = titleMatch.match ? titleMatch.exact * 3 + titleMatch.lsi : 0;

      // Calculate description match score
      const descMatch = checkLsiMatch(snippet, searchTerms, lsiWords);
      const descScore = descMatch.match ? descMatch.exact * 3 + descMatch.lsi : 0;

      // Add to candidates list
      allCandidates.push({
        url: link,
        title: title,
        snippet: snippet,
        isWikipedia: isWikipedia,
        titleScore: titleScore,
        descScore: descScore,
        totalScore: titleScore + descScore
      });
    }

    // Sort candidates by total score (highest first)
    allCandidates.sort((a, b) => b.totalScore - a.totalScore);

    // First pass: Find Wikipedia URL (prioritize Wikipedia)
    for (const candidate of allCandidates) {
      if (candidate.isWikipedia && !usedUrls.has(candidate.url)) {
        wikiUrl = candidate.url;
        usedUrls.add(candidate.url);
        break;
      }
    }

    // Second pass: Find best title match (excluding Wikipedia and used URLs)
    for (const candidate of allCandidates) {
      // Skip if already used, is Wikipedia, or has no title score
      if (usedUrls.has(candidate.url) || candidate.isWikipedia || candidate.titleScore === 0) {
        continue;
      }
      
      titleMatchUrl = candidate.url;
      usedUrls.add(candidate.url);
      break;
    }

    // Third pass: Find best description match (excluding Wikipedia, title match, and used URLs)
    for (const candidate of allCandidates) {
      // Skip if already used, is Wikipedia, or has no description score
      if (usedUrls.has(candidate.url) || candidate.isWikipedia || candidate.descScore === 0) {
        continue;
      }
      
      descriptionMatchUrl = candidate.url;
      usedUrls.add(candidate.url);
      break;
    }

    // Fallback: if still missing URLs, use basic matching from remaining candidates
    // (excluding Wikipedia and already used URLs)
    if (!titleMatchUrl || !descriptionMatchUrl) {
      for (const candidate of allCandidates) {
        if (usedUrls.has(candidate.url) || candidate.isWikipedia) {
          continue;
        }

        const titleLower = candidate.title.toLowerCase();
        const snippetLower = candidate.snippet.toLowerCase();

        // Basic fallback for title (must be unique)
        if (!titleMatchUrl && searchTerms.some(term => titleLower.includes(term))) {
          titleMatchUrl = candidate.url;
          usedUrls.add(candidate.url);
          continue;
        }

        // Basic fallback for description (must be unique and different from title)
        if (!descriptionMatchUrl && 
            candidate.url !== titleMatchUrl && 
            searchTerms.some(term => snippetLower.includes(term))) {
          descriptionMatchUrl = candidate.url;
          usedUrls.add(candidate.url);
          continue;
        }

        if (titleMatchUrl && descriptionMatchUrl) {
          break;
        }
      }
    }

    // Final fallback: use any remaining unique URLs if still empty
    // Ensure all three are unique
    if (!wikiUrl || !titleMatchUrl || !descriptionMatchUrl) {
      for (const candidate of allCandidates) {
        if (usedUrls.has(candidate.url)) {
          continue;
        }

        // Assign to first empty slot, ensuring uniqueness
        if (!wikiUrl && candidate.isWikipedia) {
          wikiUrl = candidate.url;
          usedUrls.add(candidate.url);
        } else if (!titleMatchUrl && !candidate.isWikipedia && candidate.url !== wikiUrl) {
          titleMatchUrl = candidate.url;
          usedUrls.add(candidate.url);
        } else if (!descriptionMatchUrl && 
                   !candidate.isWikipedia && 
                   candidate.url !== wikiUrl && 
                   candidate.url !== titleMatchUrl) {
          descriptionMatchUrl = candidate.url;
          usedUrls.add(candidate.url);
        }

        // Stop if all three are filled
        if (wikiUrl && titleMatchUrl && descriptionMatchUrl) {
          break;
        }
      }
    }

    // Final validation: Ensure all URLs are unique
    const allUrls = [wikiUrl, titleMatchUrl, descriptionMatchUrl].filter(Boolean);
    const uniqueUrls = [...new Set(allUrls)];
    
    // If we have duplicates, reassign to ensure uniqueness
    if (allUrls.length !== uniqueUrls.length) {
      // Reset and reassign with strict uniqueness
      wikiUrl = '';
      titleMatchUrl = '';
      descriptionMatchUrl = '';
      usedUrls.clear();
      
      // Reassign with strict uniqueness checks
      for (const candidate of allCandidates) {
        if (usedUrls.has(candidate.url)) {
          continue;
        }

        if (!wikiUrl && candidate.isWikipedia) {
          wikiUrl = candidate.url;
          usedUrls.add(candidate.url);
        } else if (!titleMatchUrl && 
                   !candidate.isWikipedia && 
                   candidate.url !== wikiUrl) {
          titleMatchUrl = candidate.url;
          usedUrls.add(candidate.url);
        } else if (!descriptionMatchUrl && 
                   !candidate.isWikipedia && 
                   candidate.url !== wikiUrl && 
                   candidate.url !== titleMatchUrl) {
          descriptionMatchUrl = candidate.url;
          usedUrls.add(candidate.url);
        }

        if (wikiUrl && titleMatchUrl && descriptionMatchUrl) {
          break;
        }
      }
    }

    console.log(`Find sources result for "${query}":`, {
      wikipedia: wikiUrl,
      religionURL: titleMatchUrl,
      religion: descriptionMatchUrl
    });

    return NextResponse.json({
      keyword: query,
      wikipedia: wikiUrl,
      religionURL: titleMatchUrl,
      religion: descriptionMatchUrl
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
