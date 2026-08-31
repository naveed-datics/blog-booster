import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized } from "@/lib/cronAuth";

// Function to inject content quality guidelines into prompt template
function injectQualityGuidelines(promptTemplate) {
  const qualityGuidelines = `

CRITICAL CONTENT QUALITY RULES (MUST FOLLOW):
- NO REPETITION: Never repeat the same information in multiple sections. Each section must provide NEW, UNIQUE information.
- BE SPECIFIC: Use concrete details, dates, facts, and examples from the context. Avoid vague statements like "likely", "may have", "probably" unless context explicitly supports uncertainty.
- SMOOTH TRANSITIONS: Use connecting phrases between paragraphs and sections to create natural flow.
- CONCRETE EXAMPLES: Include specific details from the context when available.
- UNIQUE CONTENT PER SECTION: If information appears in one section, do NOT repeat it in another. Reference it briefly if needed, but don't duplicate.
- AVOID FILLER: Every sentence must add value and advance the religion question. Do not include biography, career, or family details that don't bear on the religion question. Length follows the evidence, not a target word count - a short well-sourced section beats a padded one.
- SPECIFIC FAQs: Each FAQ should answer a specific, useful question with detailed information (50-100 words per answer), sourced the same way as the rest of the article.
- BOLD TAG SPACING: When using <b> or <strong> tags, ALWAYS ensure there is a space before the opening tag and after the closing tag. For example: "of <b>celebrity name religion</b> is" NOT "of<b>celebrity name religion</b>is". Always add spaces around bold tags to ensure proper word separation.
`;

  // Try to inject guidelines after "Instructions:" or "Content Requirements:" sections
  if (
    promptTemplate.includes("Instructions:") ||
    promptTemplate.includes("Content Requirements:")
  ) {
    // Look for pattern: Instructions: ... (Content Requirements:|SEO Optimization:|Write Content)
    const pattern =
      /(Instructions:.*?)(Content Requirements:|SEO Optimization:|Write Content)/s;
    if (pattern.test(promptTemplate)) {
      return promptTemplate.replace(pattern, `$1${qualityGuidelines}$2`);
    }
    // Try after Content Requirements if it exists
    const pattern2 =
      /(Content Requirements:.*?)(SEO Optimization:|Write Content|Output Format:)/s;
    if (pattern2.test(promptTemplate)) {
      return promptTemplate.replace(pattern2, `$1${qualityGuidelines}$2`);
    }
  }

  // If no clear insertion point, prepend to the template
  return qualityGuidelines + "\n\n" + promptTemplate;
}

// Strings that reveal unfilled template variables or generic filler
// pronouns instead of the person's actual name/pronoun - a dead giveaway of
// scaled/automated content to any reader who spots it.
const TEMPLATE_LEFTOVER_PATTERNS = [
  /\[name\]/i,
  /\bthis person\b/i,
  /\bthey're religion\b/i,
  /\btheir religion\b/i,
];

function findTemplateLeftovers(html) {
  return TEMPLATE_LEFTOVER_PATTERNS.filter((pattern) => pattern.test(html));
}

// Builds the answer-first structural directive from the extract-answer
// step's output instead of picking a random heading skeleton. Only the
// sections the evidence actually supports get written - no fixed template,
// no padding, no section admitting "there is no information."
function buildAnswerDirective(celebrityName, answer) {
  const {
    religion,
    denomination,
    confidence,
    supportingQuote,
    sourceUrl,
    sourceTitle,
    additionalCitations = [],
  } = answer;

  const citationLines = additionalCitations
    .map((c, i) => `  ${i + 1}. Claim: "${c.claim}" - Quote: "${c.quote}" - Source: ${c.sourceUrl}`)
    .join("\n");

  return `

MANDATORY STRUCTURE FOR THIS ARTICLE (overrides any other heading list, section names, template, or example structure mentioned anywhere else in this prompt):

- The confirmed answer, established from real sources, is: ${celebrityName} is ${denomination ? `${denomination} ` : ""}${religion} (confidence: ${confidence}).
- Primary source: "${sourceTitle}" - ${sourceUrl}
- Supporting quote/fact from that source: "${supportingQuote}"
${citationLines ? `- Additional sourced claims available to use as inline citations:\n${citationLines}` : ""}

Write ONLY the sections this evidence actually supports. Do not use a fixed template. Use this shape as a guide, adapting or dropping any section with nothing concrete behind it:
1. Answer (2-3 sentences): State the religion plainly in the FIRST SENTENCE of the article, with an inline HTML link to the primary source (<a href="${sourceUrl}">) at the claim. Include the denomination if known. This must be the very first sentence - not background, not a bio lead-in.
2. The evidence: direct quotes/facts from ${celebrityName} or reliable sources, each with an inline <a href="..."> link to the specific source URL it came from. Use ONLY the source URLs given above - never invent, paraphrase-as-fact without a link, or cite anything not explicitly provided.
3. Background - ONLY the parts of their upbringing or family that directly explain the current answer, cited the same way. Skip generic biography (career milestones, unrelated family history) entirely.
4. Where it shows up - concrete, cited examples only (public statements, votes, projects, observed holidays). Skip this section entirely if nothing concrete and sourced exists.
5. Controversy or public discussion - ONLY if a real, sourced controversy exists. Skip entirely otherwise.
6. FAQ - 3 real questions someone would actually search, each answered in 50-100 words using only the sourced facts above, each citing its source inline.
7. Sources - a visible "Sources" H2 section at the very end with a <ul><li> list of every URL actually used as an <a href> link in the article.

Rules that apply to the whole article:
- Never write a "Comparisons with Other Celebrities" or similar section - it is filler, not requested, and must not appear.
- Never write a sentence implying religion is unknown, unconfirmed, or "not publicly discussed" - this article only exists because a public answer was already confirmed above.
- Use "${celebrityName}" and correct pronouns throughout - never "this person," "they're religion," "their religion" as generic filler, or literal "[Name]" placeholders.
- Every factual claim beyond the confirmed answer above must have its own inline <a href> citation to one of the provided source URLs. Do not name a source without linking it (e.g. never "according to a study" with no link).
`;
}

// POST endpoint to write blog post
export async function POST(request) {
  try {
    // Check authentication
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let keyword = searchParams.get("keyword") || "";

    // A JSON body is now required: alongside the scraped content, this
    // route needs the structured, sourced answer produced by the
    // extract-answer step to write an answer-first, cited article instead
    // of asking the model to infer both the answer and its sourcing from a
    // raw text blob.
    let blogText = "";
    let answer = null;
    const contentType = request.headers.get("content-type") || "";

    try {
      if (contentType.includes("application/json")) {
        const body = await request.json();
        blogText = body.content || body.scrapedContent || body.text || "";
        answer = body.answer || null;
        if (body.keyword && body.keyword.trim()) {
          keyword = body.keyword.trim();
        }
      } else {
        return NextResponse.json(
          {
            error:
              "This endpoint requires a JSON body with { content, answer, keyword } - plain text bodies are no longer accepted because a sourced answer object is required.",
          },
          { status: 400 }
        );
      }
    } catch (e) {
      return NextResponse.json(
        {
          error: "Failed to read request body. Please provide JSON with content and answer.",
        },
        { status: 400 }
      );
    }

    if (!keyword.trim()) {
      return NextResponse.json(
        { error: "Keyword parameter is required" },
        { status: 400 }
      );
    }

    if (!blogText || !blogText.trim()) {
      return NextResponse.json(
        { error: "Blog text (scraped content) is required" },
        { status: 422 }
      );
    }

    if (
      !answer ||
      !answer.hasPublicAnswer ||
      !answer.religion ||
      !answer.sourceUrl
    ) {
      // Never write an article whose religion answer isn't confirmed and
      // sourced - a page that says nothing is worse than no page.
      return NextResponse.json(
        {
          error:
            "A confirmed, sourced answer is required (answer.hasPublicAnswer, answer.religion, answer.sourceUrl). Run extract-answer first; do not publish when no public answer was found.",
        },
        { status: 422 }
      );
    }

    // Check for OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;

    // Get Azure OpenAI config (remove quotes if present)
    let azureApiKey = process.env.AZURE_OPENAI_API_KEY;
    let azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    let azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    let azureApiVersion =
      process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

    // Remove quotes if present (common in .env files)
    if (azureApiKey) azureApiKey = azureApiKey.replace(/^["']|["']$/g, "");
    if (azureEndpoint)
      azureEndpoint = azureEndpoint.replace(/^["']|["']$/g, "");
    if (azureDeploymentName)
      azureDeploymentName = azureDeploymentName.replace(/^["']|["']$/g, "");
    if (azureApiVersion)
      azureApiVersion = azureApiVersion.replace(/^["']|["']$/g, "");

    // Use Azure OpenAI if configured, otherwise use standard OpenAI
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

    // Get website_id from query params to fetch the niche (used only for
    // FAQ topical relevance, e.g. "in relation to sports"). The per-website
    // prompt_template DB override that used to control overall structure is
    // no longer honored here - per the 2026-08-10 decision log it was the
    // suspected root cause of the site's identical-template indexing
    // problem, and structure is now driven entirely by the sourced answer
    // below, not by an arbitrary stored template.
    const websiteId = searchParams.get("website_id");
    let websiteNiche = null;

    if (websiteId) {
      try {
        const websiteResult = await query(
          "SELECT niche FROM websites WHERE id = $1",
          [parseInt(websiteId)]
        );
        if (websiteResult.rows.length > 0 && websiteResult.rows[0].niche?.trim()) {
          websiteNiche = websiteResult.rows[0].niche.trim();
        }
      } catch (error) {
        console.error("Error fetching website niche:", error);
      }
    }

    const celebrityName = keyword;
    const nicheContext = websiteNiche
      ? `\n\nWhere natural, prefer FAQ questions and evidence relevant to the niche "${websiteNiche}" - but never at the expense of accuracy or sourcing.`
      : "";

    let promptTemplate = `
Write an article answering "What religion is ${celebrityName}?" using ONLY the provided context and the confirmed answer below. Create ACTUAL content, not template instructions.

Context: ${blogText}${nicheContext}

Write an SEO-friendly article in a natural, human tone. Use proper HTML heading structure (H2, H3), short paragraphs, and bullet lists where useful. Bold important terms with <b> where natural. Do NOT use meta statements like "the provided information confirms" or "based on the provided information." Output clean HTML markup only - no code blocks, no markdown, all tags properly closed.
    `;

    // Inject quality guidelines (works for both custom and default)
    promptTemplate = injectQualityGuidelines(promptTemplate);

    // Injects the answer-first, cited, non-templated structural directive
    // built from the extract-answer step's confirmed output.
    promptTemplate = promptTemplate + buildAnswerDirective(celebrityName, answer);

    const systemPrompt =
      "You are an expert content writer specializing in well-sourced, fact-checked articles. Create REAL, engaging content based strictly on the provided context and confirmed answer. Never output template instructions or placeholder text. Every factual claim beyond the confirmed answer must carry its own inline <a href> citation to one of the provided source URLs - never cite a source by name without linking it, and never invent a source. Output only clean HTML markup with real content.";

    async function callModel(prompt) {
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
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
            top_p: 0.9,
            presence_penalty: 0.3,
            frequency_penalty: 0.2,
            max_tokens: 4000,
          }),
        });

        if (!response.ok) {
          let errorMessage = `Azure OpenAI API error: ${response.status} ${response.statusText}`;
          try {
            const errorData = await response.json();
            errorMessage = `Azure OpenAI API error: ${
              errorData.error?.message || errorData.error?.code || response.statusText
            }`;
          } catch (e) {
            const errorText = await response.text();
            errorMessage = `Azure OpenAI API error: ${response.status} ${
              response.statusText
            }. ${errorText.substring(0, 200)}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || "";
      }

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
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          top_p: 0.9,
          presence_penalty: 0.3,
          frequency_penalty: 0.2,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `OpenAI API error: ${errorData.error?.message || response.statusText}`
        );
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || "";
    }

    function cleanUpOutput(raw) {
      let content = raw
        .replace(/```html\n?/g, "")
        .replace(/```html/g, "");
      content = content.replace(/```\n?/g, "").replace(/```/g, "");
      content = content.replace(/\n```/g, "");
      content = content.replace(/\\n/g, "");
      content = content.replace(/\r\n/g, "");
      content = content.replace(/\r/g, "");
      content = content.replace(/\n/g, "");
      content = content.replace(/>\s+</g, "><");
      content = content.replace(
        /([a-zA-Z0-9.,;:!?)])<(?![\/])(b|strong|i|em|u|span)>/g,
        "$1 <$2>"
      );
      content = content.replace(
        /<\/(b|strong|i|em|u|span)>([a-zA-Z0-9.,;:!?(])/g,
        "</$1> $2"
      );
      content = content.replace(/\s{2,}/g, " ");
      content = content.replace(/\s*(<!--[^>]*-->)\s*/g, "$1");
      content = content.replace(
        /(<!-- \/wp:[^>]*? -->)(<!-- wp:[^>]*? -->)/g,
        "$1\n$2"
      );
      content = content.replace(/>\n</g, "><");
      content = content.trim();

      if (!content.startsWith("<")) {
        const firstTagIndex = content.indexOf("<");
        if (firstTagIndex > 0) {
          content = content.substring(firstTagIndex);
        }
      }
      return content;
    }

    let blogContent = cleanUpOutput(await callModel(promptTemplate));
    if (!blogContent) {
      throw new Error("Failed to generate blog content");
    }

    // Retry once if the model left unfilled template variables or generic
    // filler pronouns instead of the person's actual name - a reader spots
    // this instantly as machine output (Part A4 of the content checklist).
    let leftovers = findTemplateLeftovers(blogContent);
    if (leftovers.length > 0) {
      console.warn(
        `Template leftovers detected for ${celebrityName}, retrying once:`,
        leftovers.map((p) => p.source)
      );
      const retryPrompt =
        promptTemplate +
        `\n\nIMPORTANT: Your previous attempt left unfilled template text or generic filler pronouns (e.g. "their religion", "this person", "[Name]") instead of "${celebrityName}" and correct pronouns. Rewrite using the person's actual name/pronouns throughout - no placeholders.`;
      blogContent = cleanUpOutput(await callModel(retryPrompt));
      leftovers = findTemplateLeftovers(blogContent);
      if (leftovers.length > 0) {
        throw new Error(
          "Generated content still contains unfilled template placeholders after retry - refusing to publish."
        );
      }
    }

    console.log(`Blog post generated for keyword: ${keyword}`);

    return NextResponse.json({
      status: "success",
      blog_post: {
        title: keyword,
        content: blogContent,
      },
    });
  } catch (error) {
    console.error("Error in write-blog API:", error);

    return NextResponse.json(
      {
        error: "Failed to write blog post",
        message: error.message,
        details: error.message,
      },
      { status: 500 }
    );
  }
}
