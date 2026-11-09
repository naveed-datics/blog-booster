import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cronAuth";
import { runClaudeJson, isClaudeLlmConfigured } from "@/lib/claudeLlm";

// Extracts a structured, sourced answer to "what religion is X" from the
// content already fetched by find-sources/fetch-content, BEFORE write-blog
// runs. This is the gate that stops the pipeline from ever publishing a
// page whose honest answer is "not publicly known" (a page that says
// nothing is worse than no page) and gives write-blog a specific claim +
// citation to open the article with, instead of asking it to infer both
// the answer and its sourcing from a raw text blob at generation time.


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

    if (!(await isClaudeLlmConfigured())) {
      return NextResponse.json(
        {
          error:
            "Claude LLM is not configured. Add the API key on the Settings page (/settings).",
        },
        { status: 503 }
      );
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(celebrityName, combinedContent, sourceDetails);

    const parsed = await runClaudeJson({
      instructions: systemPrompt,
      text: userPrompt,
    });

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        { error: "Failed to parse answer-extraction response" },
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
