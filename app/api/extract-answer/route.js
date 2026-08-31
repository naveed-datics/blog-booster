import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cronAuth";

// Extracts a structured, sourced answer to "what religion is X" from the
// content already fetched by find-sources/fetch-content, BEFORE write-blog
// runs. This is the gate that stops the pipeline from ever publishing a
// page whose honest answer is "not publicly known" (a page that says
// nothing is worse than no page) and gives write-blog a specific claim +
// citation to open the article with, instead of asking it to infer both
// the answer and its sourcing from a raw text blob at generation time.

function getAzureConfig() {
  let azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  let azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  let azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  let azureApiVersion =
    process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

  if (azureApiKey) azureApiKey = azureApiKey.replace(/^["']|["']$/g, "");
  if (azureEndpoint) azureEndpoint = azureEndpoint.replace(/^["']|["']$/g, "");
  if (azureDeploymentName)
    azureDeploymentName = azureDeploymentName.replace(/^["']|["']$/g, "");
  if (azureApiVersion) azureApiVersion = azureApiVersion.replace(/^["']|["']$/g, "");

  return { azureApiKey, azureEndpoint, azureDeploymentName, azureApiVersion };
}

function buildSystemPrompt() {
  return `You are a fact-extraction assistant. You are given scraped web content about a specific person and a list of the source URLs it came from. Your ONLY job is to determine, strictly from the provided content, whether that person's religion/faith is a matter of public record.

Rules:
- Use ONLY information present in the provided content. Never use outside knowledge, never guess, never infer from a name, nationality, or ethnicity.
- Every citation you output MUST correspond to one of the provided source URLs and must be a claim actually supported by the content from that URL.
- If the content does not clearly and directly state the person's religion (their own statements, family confirmation, or reliable reporting on record), set hasPublicAnswer to false. Do NOT guess based on cultural background, name, or country.
- confidence "high" = the person or a reliable source has stated this directly. "medium" = strongly implied by multiple consistent sources but not a direct quote. Never use "low" - if it's that weak, set hasPublicAnswer to false instead.

Output ONLY valid JSON matching exactly this shape, no markdown fences, no commentary:
{
  "hasPublicAnswer": boolean,
  "religion": string or null,
  "denomination": string or null,
  "confidence": "high" | "medium" | null,
  "supportingQuote": string or null,
  "sourceUrl": string or null,
  "sourceTitle": string or null,
  "additionalCitations": [{ "claim": string, "quote": string, "sourceUrl": string }]
}`;
}

function buildUserPrompt(celebrityName, combinedContent, sourceDetails) {
  const sourceList = (sourceDetails || [])
    .map((s, i) => `${i + 1}. ${s.title || "(untitled)"} - ${s.url}`)
    .join("\n");

  return `Person: ${celebrityName}

Available source URLs (cite ONLY from this list):
${sourceList || "(none provided)"}

Scraped content from those sources:
${combinedContent}

Determine whether ${celebrityName}'s religion is a matter of public record based strictly on the content above, and return the JSON described in your instructions.`;
}

function parseModelJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  text = text.replace(/^```json\n?/i, "").replace(/^```\n?/, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Drops any citation whose sourceUrl isn't one of the URLs we actually
// fetched - the model is instructed not to invent sources, but this is
// cheap to verify and an invented citation is exactly the kind of
// unsourced claim this whole step exists to prevent.
function sanitizeAgainstKnownSources(extracted, sourceDetails) {
  const knownUrls = new Set((sourceDetails || []).map((s) => s.url));
  const result = { ...extracted };

  if (result.sourceUrl && !knownUrls.has(result.sourceUrl)) {
    result.sourceUrl = null;
  }
  if (Array.isArray(result.additionalCitations)) {
    result.additionalCitations = result.additionalCitations.filter(
      (c) => c && c.sourceUrl && knownUrls.has(c.sourceUrl)
    );
  } else {
    result.additionalCitations = [];
  }

  // If the primary citation got dropped for being unverifiable, we no
  // longer have a sourced answer - treat it the same as not finding one.
  if (!result.sourceUrl) {
    result.hasPublicAnswer = false;
    result.confidence = null;
  }

  return result;
}

export async function POST(request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { celebrityName, combinedContent, sourceDetails } = body;

    if (!celebrityName || !celebrityName.trim()) {
      return NextResponse.json(
        { error: "celebrityName is required" },
        { status: 400 }
      );
    }
    if (!combinedContent || !combinedContent.trim()) {
      return NextResponse.json(
        { error: "combinedContent is required" },
        { status: 422 }
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const { azureApiKey, azureEndpoint, azureDeploymentName, azureApiVersion } =
      getAzureConfig();
    const useAzure = azureApiKey && azureEndpoint && azureDeploymentName;

    if (!useAzure && !openaiApiKey) {
      return NextResponse.json(
        {
          error:
            "OpenAI API key or Azure OpenAI configuration not found in environment variables",
        },
        { status: 500 }
      );
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(celebrityName, combinedContent, sourceDetails);

    let rawContent = "";

    if (useAzure) {
      const endpoint = azureEndpoint.replace(/\/$/, "");
      const azureUrl = `${endpoint}/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`;

      const response = await fetch(azureUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": azureApiKey,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
          max_tokens: 1200,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure OpenAI API error: ${response.status}. ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      rawContent = data.choices[0]?.message?.content || "";
    } else {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
          max_tokens: 1200,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `OpenAI API error: ${errorData.error?.message || response.statusText}`
        );
      }

      const data = await response.json();
      rawContent = data.choices[0]?.message?.content || "";
    }

    const parsed = parseModelJson(rawContent);
    if (!parsed) {
      return NextResponse.json(
        { error: "Failed to parse answer-extraction response", raw: rawContent },
        { status: 502 }
      );
    }

    const sanitized = sanitizeAgainstKnownSources(parsed, sourceDetails);

    return NextResponse.json({
      celebrityName,
      hasPublicAnswer: Boolean(sanitized.hasPublicAnswer && sanitized.confidence),
      religion: sanitized.religion || null,
      denomination: sanitized.denomination || null,
      confidence: sanitized.confidence || null,
      supportingQuote: sanitized.supportingQuote || null,
      sourceUrl: sanitized.sourceUrl || null,
      sourceTitle: sanitized.sourceTitle || null,
      additionalCitations: sanitized.additionalCitations || [],
    });
  } catch (error) {
    console.error("Error in extract-answer API:", error);
    return NextResponse.json(
      { error: "Failed to extract answer", message: error.message },
      { status: 500 }
    );
  }
}
