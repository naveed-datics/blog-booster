import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized } from "@/lib/cronAuth";

// Refreshes existing articles that are BOTH currently trending again AND
// stale (published/last-modified well before this new trending wave). This
// captures search interest that would otherwise be wasted: without this,
// a trending name that already has coverage gets silently skipped by the
// duplicate-detection fix and the traffic opportunity is lost. Reindexing
// itself is NOT handled here - the site's existing Rank Math Instant
// Indexing module already auto-submits updated URLs to Google, so a
// separate reindex call would be redundant.
//
// Same STALE_DAYS threshold the dashboard's manual "Update" tab already
// uses (trend.created_at - post.modified >= 7 days), applied here to
// trends whose url column already points at an existing post (set by
// trend-search's duplicate check).

const WP_BASE = process.env.WP_BASE_URL || "https://whatreligionisinfo.com/wp-json/wp/v2";
if (!process.env.WP_AUTH_HEADER) {
  throw new Error(
    "WP_AUTH_HEADER environment variable is not set. Refusing to fall back to a hardcoded credential."
  );
}
const WP_AUTH_HEADER = process.env.WP_AUTH_HEADER;

const STALE_DAYS = 7;
const TRENDING_WINDOW_DAYS = 14; // how recently the trend must have surfaced to count as "currently trending"
const DEFAULT_LIMIT = 5;

function slugFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    return path.replace(/^\/|\/$/g, "");
  } catch {
    return null;
  }
}

async function fetchExistingPost(slug) {
  const res = await fetch(
    `${WP_BASE}/posts?slug=${encodeURIComponent(slug)}&_fields=id,slug,title,content,modified_gmt,link`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) return null;
  const posts = await res.json();
  return Array.isArray(posts) && posts.length > 0 ? posts[0] : null;
}

async function fetchFreshContext(celebrityName, tavilyKey) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: tavilyKey,
      query: `${celebrityName} news`,
      search_depth: "basic",
      max_results: 4,
      days: 30, // recent news only
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`Tavily fresh-context search failed: ${res.status} ${errText.substring(0, 200)}`);
    err.isQuotaError = res.status === 429 || res.status === 432;
    throw err;
  }
  const data = await res.json();
  return (data.results || [])
    .map((r) => `- ${r.title}: ${r.content}`.slice(0, 400))
    .join("\n");
}

async function generateUpdateSection(celebrityName, existingContent, freshContext) {
  let azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  let azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  let azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  let azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

  if (azureApiKey) azureApiKey = azureApiKey.replace(/^["']|["']$/g, "");
  if (azureEndpoint) azureEndpoint = azureEndpoint.replace(/^["']|["']$/g, "");
  if (azureDeploymentName) azureDeploymentName = azureDeploymentName.replace(/^["']|["']$/g, "");
  if (azureApiVersion) azureApiVersion = azureApiVersion.replace(/^["']|["']$/g, "");

  if (!azureApiKey || !azureEndpoint || !azureDeploymentName) {
    throw new Error("Azure OpenAI not configured");
  }

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `You are updating an existing article about ${celebrityName} with fresh, dated information. This is NOT a rewrite - the rest of the article stays as-is.

Recent news/context about ${celebrityName} (may or may not be directly faith/religion related):
${freshContext || "(no specific recent news found)"}

Existing article's current content (for context only, do not repeat it):
${existingContent.replace(/<[^>]+>/g, " ").slice(0, 1500)}

Task: Write ONE new HTML section to insert near the top of the article, titled with an H2 like "Update (${today}): [specific, relevant subheading]". It should:
- Reference why ${celebrityName} is back in the news / trending right now, using the context above
- Only mention faith/religion if the fresh context actually relates to it - otherwise just give the current update and note their faith remains as described below
- Be 100-200 words, factual, no speculation beyond what the context supports
- If the fresh context has nothing genuinely new or specific, write a brief section noting they're back in public attention with a short factual reason, without fabricating claims

Output ONLY the new HTML section (one <h2> and one or more <p> tags). No commentary, no markdown, no code blocks.`;

  const endpoint = azureEndpoint.replace(/\/$/, "");
  const azureUrl = `${endpoint}/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`;

  const response = await fetch(azureUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": azureApiKey },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: "You write concise, factual news-update sections for existing articles. Output only clean HTML, never fabricate claims not supported by the given context.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure OpenAI error: ${response.status} ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function insertUpdateSection(existingContent, updateSectionHtml) {
  // Insert right after the first paragraph so it's visible near the top,
  // without disturbing the rest of the article's existing structure.
  const firstParaEnd = existingContent.indexOf("</p>");
  if (firstParaEnd === -1) {
    return updateSectionHtml + "\n\n" + existingContent;
  }
  const insertAt = firstParaEnd + "</p>".length;
  return (
    existingContent.slice(0, insertAt) +
    "\n\n" + updateSectionHtml + "\n\n" +
    existingContent.slice(insertAt)
  );
}

export async function GET(request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const websiteId = parseInt(searchParams.get("website_id")) || null;
  const limit = parseInt(searchParams.get("limit")) || DEFAULT_LIMIT;
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (!websiteId) {
    return NextResponse.json({ error: "website_id is required" }, { status: 400 });
  }
  if (!tavilyKey) {
    return NextResponse.json({ error: "TAVILY_API_KEY not configured" }, { status: 500 });
  }

  // Trends that already matched an existing post (url IS NOT NULL) and
  // surfaced recently enough to count as "currently trending".
  const candidatesResult = await query(
    `SELECT id, celebrity_name, url, created_at
     FROM trends
     WHERE website_id = $1
       AND url IS NOT NULL AND url != ''
       AND created_at >= NOW() - INTERVAL '${TRENDING_WINDOW_DAYS} days'
     ORDER BY created_at DESC
     LIMIT 50`,
    [websiteId]
  );

  const results = [];
  let updated = 0;
  let tavilyAttempts = 0; // counts every Tavily call made, not just successful updates -
  // a candidate that fails AFTER the Tavily call (Azure error, WP conflict,
  // etc.) still spent quota, so this is what actually bounds spend per run.
  let quotaExhausted = false;

  for (const trend of candidatesResult.rows) {
    if (updated >= limit || tavilyAttempts >= limit || quotaExhausted) break;

    const slug = slugFromUrl(trend.url);
    if (!slug) continue;

    try {
      const post = await fetchExistingPost(slug);
      if (!post) {
        results.push({ celebrity_name: trend.celebrity_name, skipped: "post not found" });
        continue;
      }

      const ageMs = new Date(trend.created_at).getTime() - new Date(post.modified_gmt + "Z").getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      if (ageDays < STALE_DAYS) {
        results.push({ celebrity_name: trend.celebrity_name, skipped: `not stale enough (${ageDays.toFixed(1)}d)` });
        continue;
      }

      tavilyAttempts++; // count the spend before the call, not after success
      const freshContext = await fetchFreshContext(trend.celebrity_name, tavilyKey);
      const updateSectionHtml = await generateUpdateSection(
        trend.celebrity_name,
        post.content.rendered,
        freshContext
      );
      const newContent = insertUpdateSection(post.content.rendered, updateSectionHtml);

      const updateRes = await fetch(`${WP_BASE}/posts/${post.id}`, {
        method: "POST",
        headers: { Authorization: WP_AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        results.push({ celebrity_name: trend.celebrity_name, success: false, error: errText.substring(0, 200) });
        continue;
      }

      updated++;
      results.push({ celebrity_name: trend.celebrity_name, success: true, url: post.link });
      console.log(`✅ Refreshed stale+trending article: ${trend.celebrity_name} (${post.link})`);
    } catch (error) {
      if (error.isQuotaError) {
        quotaExhausted = true;
      }
      console.error(`Error refreshing ${trend.celebrity_name}:`, error);
      results.push({ celebrity_name: trend.celebrity_name, success: false, error: error.message });
    }
  }

  return NextResponse.json({
    success: true,
    candidates_checked: candidatesResult.rows.length,
    updated,
    tavily_calls_spent: tavilyAttempts,
    stopped_early_for_quota: quotaExhausted,
    results,
  });
}
