import { countReputableFaithNews } from '@/lib/reputableSources';

const SERPAPI_KEY = () => process.env.SERPAPI_KEY;
const TAVILY_KEY = () => process.env.TAVILY_API_KEY;

/** Person name appears in rising queries (24h) — any related query, not only "[name] religion". */
export async function checkPersonTrending24h(celebrityName, { alreadyInRisingBatch = false } = {}) {
  // Trend-search already pulled this name from SerpAPI rising queries in this
  // cron cycle. Re-querying the same endpoint is flaky (list churn / rate
  // limits) and was blocking every create-new for days.
  if (alreadyInRisingBatch) {
    return {
      passed: true,
      skipped: false,
      reason: 'discovered from rising trends batch',
    };
  }

  const apiKey = SERPAPI_KEY();
  if (!apiKey) {
    return { passed: true, skipped: true, reason: 'SERPAPI_KEY not configured' };
  }

  const normalized = celebrityName.toLowerCase();
  const nameParts = normalized.split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) {
    return { passed: false, reason: 'empty name' };
  }

  try {
    // Prefer name-specific related queries (more reliable than scanning
    // global "religion" rising list a second time).
    const nameParams = new URLSearchParams({
      engine: 'google_trends',
      q: celebrityName,
      data_type: 'RELATED_QUERIES',
      api_key: apiKey,
      date: 'now 1-d',
    });

    const nameRes = await fetch(`https://serpapi.com/search.json?${nameParams}`);
    if (nameRes.ok) {
      const nameData = await nameRes.json();
      const rising = nameData?.related_queries?.rising || [];
      const top = nameData?.related_queries?.top || [];
      if (rising.length > 0 || top.length > 0) {
        return {
          passed: true,
          matched_queries: rising.slice(0, 3).map((r) => r.query || r.title),
          reason: 'person has related rising/top queries in 24h',
        };
      }
    }

    const params = new URLSearchParams({
      engine: 'google_trends',
      q: 'religion',
      data_type: 'RELATED_QUERIES',
      api_key: apiKey,
      date: 'now 1-d',
    });

    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) {
      return { passed: false, reason: `SerpAPI error ${res.status}` };
    }

    const data = await res.json();
    const rising = data?.related_queries?.rising || [];
    const queries = rising.map((r) => (r.query || r.title || '').toLowerCase());

    const matched = queries.filter((q) =>
      nameParts.every((part) => q.includes(part))
    );

    return {
      passed: matched.length > 0,
      matched_queries: matched.slice(0, 5),
      reason: matched.length > 0 ? 'person trending in 24h rising queries' : 'not in 24h rising queries',
    };
  } catch (error) {
    return { passed: false, reason: error.message };
  }
}

/** ≥2 faith news articles in 72h from reputable allowlist. */
export async function checkFaithNews72h(celebrityName) {
  const apiKey = TAVILY_KEY();
  if (!apiKey) {
    return { passed: true, skipped: true, reason: 'TAVILY_API_KEY not configured' };
  }

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${celebrityName} faith religion`,
        search_depth: 'basic',
        max_results: 10,
        days: 3,
      }),
    });

    if (!res.ok) {
      return { passed: false, reason: `Tavily error ${res.status}` };
    }

    const data = await res.json();
    const count = countReputableFaithNews(data.results || []);

    return {
      passed: count >= 2,
      faith_news_count: count,
      reason: count >= 2 ? '≥2 reputable faith news in 72h' : `only ${count} reputable faith news in 72h`,
    };
  } catch (error) {
    return { passed: false, reason: error.message };
  }
}

export function classifySpikeTier(context = {}) {
  const text = `${context.headline || ''} ${context.summary || ''}`.toLowerCase();
  if (/\b(died|death|passed away|funeral|obituar)\b/.test(text)) return 'A';
  if (/\b(convert|conversion|baptiz|embraced islam|became (a )?(muslim|christian|jew|catholic))\b/.test(text)) {
    return 'A';
  }
  if (/\b(controvers|scandal|backlash|outrage)\b/.test(text) && /\b(faith|religion|church|mosque)\b/.test(text)) {
    return 'A';
  }
  return 'B';
}

export function isLikelyPersonName(name) {
  if (!name || typeof name !== 'string') return false;
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return false;
  const lower = name.toLowerCase();
  const blocklist = ['christianity', 'islam', 'hinduism', 'judaism', 'roman empire'];
  if (blocklist.some((b) => lower.includes(b))) return false;
  return true;
}

/**
 * Run create-new gates. Returns { passed, failures, evidence }.
 */
export async function runPipelineGates(celebrityName, options = {}) {
  const failures = [];
  const evidence = {};

  if (!isLikelyPersonName(celebrityName)) {
    failures.push({ gate: 'is_person', detail: 'not a named individual' });
  }

  if (options.gateEvidence?.trending24h) {
    evidence.trending24h = options.gateEvidence.trending24h;
    if (!evidence.trending24h.passed) {
      failures.push({ gate: 'timeliness', detail: evidence.trending24h.reason });
    }
  } else {
    evidence.trending24h = await checkPersonTrending24h(celebrityName, {
      alreadyInRisingBatch: options.alreadyInRisingBatch === true,
    });
    if (!evidence.trending24h.passed && !evidence.trending24h.skipped) {
      failures.push({ gate: 'timeliness', detail: evidence.trending24h.reason });
    }
  }

  if (options.gateEvidence?.faithNews72h) {
    evidence.faithNews72h = options.gateEvidence.faithNews72h;
    if (!evidence.faithNews72h.passed) {
      failures.push({ gate: 'faith_news', detail: evidence.faithNews72h.reason });
    }
  } else {
    evidence.faithNews72h = await checkFaithNews72h(celebrityName);
    if (!evidence.faithNews72h.passed && !evidence.faithNews72h.skipped) {
      failures.push({ gate: 'faith_news', detail: evidence.faithNews72h.reason });
    }
  }

  if (options.hasPublicAnswer === false) {
    failures.push({ gate: 'answer_knowable', detail: 'no sourced public answer' });
  }

  const spikeTier = classifySpikeTier(options.spikeContext || {});
  evidence.spikeTier = spikeTier;

  if (isRecoveryTierBOnly(spikeTier, options)) {
    failures.push({
      gate: 'recovery_spike_tier',
      detail: 'ambiguous spike — tier B requires review during recovery',
    });
  }

  return {
    passed: failures.length === 0,
    failures,
    evidence,
    spikeTier,
  };
}

function isRecoveryTierBOnly(tier, options) {
  if (options.recoveryMode === false) return false;
  if (process.env.RECOVERY_MODE !== 'true') return false;
  return tier === 'B' && !options.allowTierB;
}
