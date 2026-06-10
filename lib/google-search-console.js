import { google } from "googleapis";
import { query } from "@/lib/db";
import crypto from "crypto";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const NO_INDEX_STATES = new Set([
  "BLOCKED_BY_META_TAG",
  "BLOCKED_BY_HTTP_HEADER",
]);

function getRedirectUri() {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/search-console/callback`
  );
}

export function getOAuthRedirectUri() {
  return getRedirectUri();
}

export async function getOAuthCredentials(userId) {
  const result = await query(
    "SELECT client_id, client_secret FROM gsc_oauth_config WHERE user_id = $1",
    [userId]
  );

  if (result.rows.length > 0) {
    return {
      clientId: result.rows[0].client_id,
      clientSecret: result.rows[0].client_secret,
      source: "user",
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (clientId && clientSecret) {
    return { clientId, clientSecret, source: "env" };
  }

  return null;
}

export async function hasOAuthConfig(userId) {
  const credentials = await getOAuthCredentials(userId);
  return credentials !== null;
}

export async function saveOAuthConfig(userId, clientId, clientSecret) {
  await query(
    `INSERT INTO gsc_oauth_config (user_id, client_id, client_secret)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       client_secret = EXCLUDED.client_secret,
       updated_at = NOW()`,
    [userId, clientId.trim(), clientSecret.trim()]
  );
}

export async function getOAuthConfigForDisplay(userId) {
  const credentials = await getOAuthCredentials(userId);
  if (!credentials) {
    return {
      configured: false,
      clientId: "",
      source: null,
      redirectUri: getRedirectUri(),
    };
  }

  const masked =
    credentials.clientId.length > 8
      ? `${credentials.clientId.slice(0, 8)}…${credentials.clientId.slice(-4)}`
      : "••••••••";

  return {
    configured: true,
    clientId: masked,
    source: credentials.source,
    redirectUri: getRedirectUri(),
  };
}

export async function getOAuthClientForUser(userId) {
  const credentials = await getOAuthCredentials(userId);

  if (!credentials) {
    throw new Error(
      "Google OAuth not configured. Add your Google Client ID and Client Secret in Manage Websites → Google API Setup."
    );
  }

  return new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    getRedirectUri()
  );
}

function signState(payload) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for OAuth state signing");
  }

  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
}

function verifyState(state) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || !state) {
    return null;
  }

  const [data, signature] = state.split(".");
  if (!data || !signature) {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");

  if (signature !== expected) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function getAuthUrl(userId, websiteId, returnTo = "search-console") {
  const oauth2Client = await getOAuthClientForUser(userId);
  const state = signState({
    userId: String(userId),
    websiteId: String(websiteId),
    returnTo,
    ts: Date.now(),
  });

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GSC_SCOPE],
    state,
  });
}

export function parseOAuthState(state) {
  const payload = verifyState(state);
  if (!payload?.userId) {
    return null;
  }
  return payload;
}

export async function saveTokens(userId, tokens) {
  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : null;

  await query(
    `INSERT INTO gsc_tokens (user_id, access_token, refresh_token, expires_at, scope)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, gsc_tokens.refresh_token),
       expires_at = EXCLUDED.expires_at,
       scope = EXCLUDED.scope,
       updated_at = NOW()`,
    [
      userId,
      tokens.access_token,
      tokens.refresh_token ?? null,
      expiresAt,
      tokens.scope ?? GSC_SCOPE,
    ]
  );
}

export async function hasGscConnection(userId) {
  const result = await query(
    "SELECT user_id FROM gsc_tokens WHERE user_id = $1",
    [userId]
  );
  return result.rows.length > 0;
}

export async function getWebsiteGscStatus(userId, websiteUrl) {
  const oauthConfigured = await hasOAuthConfig(userId);
  if (!oauthConfigured) {
    return {
      connected: false,
      propertyMatched: false,
      siteUrl: null,
      oauthConfigured: false,
      message: "Add Google Client ID and Client Secret in Google API Setup first",
    };
  }

  const connected = await hasGscConnection(userId);
  if (!connected) {
    return {
      connected: false,
      propertyMatched: false,
      siteUrl: null,
      oauthConfigured: true,
      message: "Google Search Console not connected",
    };
  }

  try {
    const authClient = await getAuthenticatedClient(userId);
    if (!authClient) {
      return {
        connected: false,
        propertyMatched: false,
        siteUrl: null,
        message: "Google Search Console not connected",
      };
    }

    const siteUrl = await resolveSiteUrl(authClient, websiteUrl);
    return {
      connected: true,
      propertyMatched: true,
      siteUrl,
      oauthConfigured: true,
      message: "Connected to Search Console",
    };
  } catch (error) {
    return {
      connected: true,
      propertyMatched: false,
      siteUrl: null,
      oauthConfigured: true,
      message: error.message,
    };
  }
}

function getCallbackRedirectUrl(payload, queryParams = "") {
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000";
  const websiteId = payload.websiteId ?? "";
  const returnTo = payload.returnTo || "search-console";
  const suffix = queryParams ? `?${queryParams}` : "";

  if (returnTo === "add-website") {
    return `${baseUrl}/add-website?edit=${websiteId}${suffix ? `&${queryParams}` : ""}`;
  }

  return `${baseUrl}/ai-dashboard/${websiteId}/search-console${suffix ? `?${queryParams}` : ""}`;
}

export function getOAuthCallbackRedirect(payload, params = {}) {
  const query = new URLSearchParams(params).toString();
  return getCallbackRedirectUrl(payload, query);
}

export async function getAuthenticatedClient(userId) {
  const result = await query(
    "SELECT access_token, refresh_token, expires_at FROM gsc_tokens WHERE user_id = $1",
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const oauth2Client = await getOAuthClientForUser(userId);

  oauth2Client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await saveTokens(userId, {
        ...tokens,
        refresh_token: tokens.refresh_token ?? row.refresh_token,
      });
    }
  });

  return oauth2Client;
}

export async function exchangeCodeForTokens(userId, code) {
  const oauth2Client = await getOAuthClientForUser(userId);
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

function normalizeWebsiteUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    return {
      origin: `${parsed.protocol}//${parsed.hostname}`,
      originWithSlash: `${parsed.protocol}//${parsed.hostname}/`,
      domain: host,
      scDomain: `sc-domain:${host}`,
    };
  } catch {
    return null;
  }
}

export async function resolveSiteUrl(authClient, websiteUrl) {
  const searchconsole = google.searchconsole({ version: "v1", auth: authClient });
  const response = await searchconsole.sites.list();
  const sites = response.data.siteEntry ?? [];

  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) {
    throw new Error("Invalid website URL");
  }

  for (const site of sites) {
    const siteUrl = site.siteUrl;
    if (!siteUrl) continue;

    if (
      siteUrl === normalized.originWithSlash ||
      siteUrl === normalized.origin ||
      siteUrl === normalized.scDomain ||
      siteUrl.replace(/\/$/, "") === normalized.origin
    ) {
      return siteUrl;
    }
  }

  throw new Error(
    `No matching Search Console property found for ${websiteUrl}. Available: ${sites.map((s) => s.siteUrl).join(", ") || "none"}`
  );
}

export async function fetchSearchAnalyticsPages(authClient, siteUrl, days = 90) {
  const searchconsole = google.searchconsole({ version: "v1", auth: authClient });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const formatDate = (date) => date.toISOString().split("T")[0];

  const pages = new Set();
  let startRow = 0;
  const rowLimit = 25000;

  while (true) {
    const response = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ["page"],
        rowLimit,
        startRow,
        dataState: "all",
      },
    });

    const rows = response.data.rows ?? [];
    rows.forEach((row) => {
      if (row.keys?.[0]) {
        pages.add(row.keys[0]);
      }
    });

    if (rows.length < rowLimit) {
      break;
    }

    startRow += rowLimit;
  }

  return Array.from(pages);
}

export async function inspectUrl(authClient, siteUrl, inspectionUrl) {
  const searchconsole = google.searchconsole({ version: "v1", auth: authClient });

  const response = await searchconsole.urlInspection.index.inspect({
    requestBody: {
      inspectionUrl,
      siteUrl,
      languageCode: "en-US",
    },
  });

  return response.data.inspectionResult ?? null;
}

export function classifyInspection(inspectionResult) {
  if (!inspectionResult) {
    return {
      isNoIndex: false,
      isIssue: true,
      issueType: "Inspection failed",
      indexingState: null,
      coverageState: null,
      verdict: null,
      lastCrawlTime: null,
      inspectLink: null,
    };
  }

  const indexStatus = inspectionResult.indexStatusResult ?? {};
  const mobile = inspectionResult.mobileUsabilityResult ?? {};
  const richResults = inspectionResult.richResultsResult ?? {};

  const indexingState = indexStatus.indexingState ?? null;
  const coverageState = indexStatus.coverageState ?? null;
  const verdict = indexStatus.verdict ?? null;
  const pageFetchState = indexStatus.pageFetchState ?? null;
  const lastCrawlTime = indexStatus.lastCrawlTime ?? null;
  const inspectLink = inspectionResult.inspectionResultLink ?? null;

  const isNoIndex = NO_INDEX_STATES.has(indexingState);

  let isIssue = false;
  let issueType = null;

  if (isNoIndex) {
    isIssue = false;
  } else if (verdict === "FAIL") {
    isIssue = true;
    issueType = "Index verdict failed";
  } else if (pageFetchState && pageFetchState !== "SUCCESSFUL") {
    isIssue = true;
    issueType = `Page fetch: ${pageFetchState}`;
  } else if (mobile.verdict === "FAIL") {
    isIssue = true;
    issueType = "Mobile usability failed";
  } else if (richResults.verdict === "FAIL") {
    isIssue = true;
    issueType = "Rich results failed";
  } else if (
    coverageState &&
    /not indexed|error|excluded|blocked|duplicate|redirect/i.test(coverageState)
  ) {
    isIssue = true;
    issueType = coverageState;
  }

  return {
    isNoIndex,
    isIssue,
    issueType,
    indexingState,
    coverageState,
    verdict,
    lastCrawlTime,
    inspectLink,
  };
}

export async function getCachedInspection(websiteId, url) {
  const result = await query(
    `SELECT result, inspected_at FROM gsc_inspection_cache
     WHERE website_id = $1 AND url = $2`,
    [websiteId, url]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const age = Date.now() - new Date(row.inspected_at).getTime();

  return {
    result: row.result,
    inspectedAt: row.inspected_at,
    isFresh: age < CACHE_TTL_MS,
  };
}

export async function setCachedInspection(websiteId, url, inspectionResult) {
  await query(
    `INSERT INTO gsc_inspection_cache (website_id, url, result, inspected_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (website_id, url) DO UPDATE SET
       result = EXCLUDED.result,
       inspected_at = NOW()`,
    [websiteId, url, JSON.stringify(inspectionResult)]
  );
}

const URL_LIST_CACHE_KEY = "__url_list__";
const URL_LIST_CACHE_TTL_MS = 60 * 60 * 1000;

export async function getCachedUrlList(websiteId) {
  const cached = await getCachedInspection(websiteId, URL_LIST_CACHE_KEY);
  if (!cached) {
    return null;
  }

  const age = Date.now() - new Date(cached.inspectedAt).getTime();
  if (age >= URL_LIST_CACHE_TTL_MS) {
    return null;
  }

  const { siteUrl, urls } = cached.result ?? {};
  if (!siteUrl || !Array.isArray(urls)) {
    return null;
  }

  return { siteUrl, urls };
}

export async function setCachedUrlList(websiteId, siteUrl, urls) {
  await setCachedInspection(websiteId, URL_LIST_CACHE_KEY, { siteUrl, urls });
}

export async function clearInspectionCache(websiteId) {
  await query("DELETE FROM gsc_inspection_cache WHERE website_id = $1", [
    websiteId,
  ]);
}

export async function inspectUrlsWithConcurrency(
  authClient,
  websiteId,
  siteUrl,
  urls,
  { concurrency = 3, refresh = false } = {}
) {
  const noIndexPages = [];
  const issues = [];

  const inspectOne = async (url) => {
    let inspectionResult = null;

    if (!refresh) {
      const cached = await getCachedInspection(websiteId, url);
      if (cached?.isFresh) {
        inspectionResult = cached.result;
      }
    }

    if (!inspectionResult) {
      try {
        inspectionResult = await inspectUrl(authClient, siteUrl, url);
        await setCachedInspection(websiteId, url, inspectionResult);
      } catch (inspectError) {
        console.error(`Inspection failed for ${url}:`, inspectError);
        inspectionResult = null;
      }
    }

    const record = buildInspectionRecord(url, inspectionResult);

    if (record.isNoIndex) {
      noIndexPages.push(record);
    } else if (record.isIssue) {
      issues.push(record);
    }
  };

  let index = 0;
  const workerCount = Math.min(concurrency, urls.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (index < urls.length) {
      const currentIndex = index;
      index += 1;
      await inspectOne(urls[currentIndex]);
    }
  });

  await Promise.all(workers);

  return { noIndexPages, issues };
}

export function buildInspectionRecord(url, inspectionResult) {
  const classified = classifyInspection(inspectionResult);

  return {
    url,
    ...classified,
  };
}

export { CACHE_TTL_MS };
