import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized } from "@/lib/cronAuth";

// Function to inject content quality guidelines into prompt template
function injectQualityGuidelines(promptTemplate) {
  const qualityGuidelines = `

CRITICAL CONTENT QUALITY RULES (MUST FOLLOW):
- NO REPETITION: Never repeat the same information in multiple sections. Each section must provide NEW, UNIQUE information.
- BE SPECIFIC: Use concrete details, dates, facts, and examples from the context. Avoid vague statements like "likely", "may have", "probably" unless context explicitly supports uncertainty.
- ADD DEPTH: Each section should be substantial (150-300 words minimum). Provide comprehensive information, not surface-level summaries.
- SMOOTH TRANSITIONS: Use connecting phrases between paragraphs and sections to create natural flow.
- CONCRETE EXAMPLES: Include specific details, anecdotes, or case studies from the context when available.
- UNIQUE CONTENT PER SECTION: If information appears in one section, do NOT repeat it in another. Reference it briefly if needed, but don't duplicate.
- AVOID FILLER: Every sentence must add value. Remove generic statements that don't provide specific information.
- SPECIFIC FAQs: Each FAQ should answer a specific, useful question with detailed information (50-100 words per answer).
- SPECIFIC RELATED QUERIES: Each query should be a real search term someone might use, with detailed answers (50-100 words per answer).
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

// Pool of possible section angles. A random subset (in random order) is
// picked per article so no two articles share the same heading skeleton -
// publishing hundreds of pages with an identical H2/FAQ structure is a
// well-documented scaled-content signal that gets pages excluded from
// Google's index ("Crawled - currently not indexed"), regardless of how
// long or well-written each individual page is.
const SECTION_POOL = [
  "Early Life and How Faith Entered the Picture",
  "Family Background and Religious Upbringing",
  "What They've Said Publicly About Their Faith",
  "Religious Practices and How Observant They Are",
  "How Their Faith Shows Up in Their Public Career",
  "Community, Charity, or Advocacy Tied to Their Beliefs",
  "Reactions and Public Discussion of Their Religious Identity",
  "Faith and Identity: What's Confirmed vs. Speculated",
  "Key Moments Where Religion Became Public News",
  "Their Partner's or Family's Religious Background",
  "Cultural Background vs. Personal Belief - the Distinction",
  "How They've Addressed Misconceptions About Their Faith",
  "Religious Holidays or Traditions They're Known to Observe",
  "Comparisons to Others in Their Field Who Share (or Differ in) Faith",
  "Timeline: How Their Public Statements on Faith Have Evolved",
  "What Fans and Media Get Wrong About Their Religion",
];

const OPENING_HOOK_STYLES = [
  "Open by directly answering the core question in the first sentence, then explain the nuance.",
  "Open with the most surprising or least-known fact about their faith, then build context.",
  "Open by naming the specific controversy or public moment that made people search this, then answer it.",
  "Open with a short, direct quote (paraphrased, attributed) from the person about their beliefs, then unpack it.",
  "Open by stating plainly what is confirmed vs. rumored, then explain why the confusion exists.",
];

const FAQ_QUESTION_BANK = [
  "a question phrased the way someone would actually type it into Google (informal, specific)",
  "a question that addresses the single most common misconception about this person's faith",
  "a question comparing this person's faith to a family member's or partner's",
  "a question about a specific public event, quote, or controversy tied to their religion",
  "a question about how their faith is reflected (or not) in their public career",
  "a question directly asking 'is [name] [specific religion]?' in a way that matches real search phrasing",
];

function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

// Injects a randomized structural directive that overrides any fixed
// heading list implied elsewhere in the prompt (including a custom
// per-website template pulled from the database).
function injectStructuralVariation(promptTemplate, celebrityName) {
  const sectionCount = 3 + Math.floor(Math.random() * 3); // 3-5 sections
  const sections = pickRandom(SECTION_POOL, sectionCount);
  const hookStyle = pickRandom(OPENING_HOOK_STYLES, 1)[0];
  const faqAngles = pickRandom(FAQ_QUESTION_BANK, 3);

  const structuralDirective = `

MANDATORY STRUCTURE FOR THIS SPECIFIC ARTICLE (overrides any other heading list, section names, or section order mentioned anywhere else in this prompt):
- Opening paragraph style: ${hookStyle}
- Use exactly these ${sections.length} H2 section headings, in this exact order, reworded naturally to fit ${celebrityName} specifically (do not use these placeholder phrasings verbatim - rewrite each into a natural, specific heading about ${celebrityName}):
${sections.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}
- Do NOT include any additional standard sections beyond these ${sections.length} plus FAQ/Related Queries.
- FAQ section: write exactly 3 questions, each based on one of these angles (reworded naturally, not verbatim):
${faqAngles.map((a, i) => `  ${i + 1}. ${a}`).join("\n")}
- This exact combination of headings and FAQ angles should NOT resemble the structure of previous articles on this site - each article must have a genuinely different shape, not just different names swapped into the same skeleton.
`;

  return promptTemplate + "\n\n" + structuralDirective;
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

    // Get the raw body as text (scraped content)
    // Support both JSON and plain text formats
    let blogText = "";
    const contentType = request.headers.get("content-type") || "";

    try {
      if (contentType.includes("application/json")) {
        // JSON format: { keyword: "...", content: "..." }
        const body = await request.json();
        blogText = body.content || body.scrapedContent || body.text || "";
        // Override keyword if provided in JSON body
        if (body.keyword && body.keyword.trim()) {
          keyword = body.keyword.trim();
        }
      } else {
        // Plain text format: raw text in body
        blogText = await request.text();
      }
    } catch (e) {
      return NextResponse.json(
        {
          error: "Failed to read request body. Please provide scraped content.",
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

    // Get website_id from query params or body to fetch custom prompt template and niche
    const websiteId = searchParams.get("website_id");
    console.log("Write-blog API - Received website_id:", websiteId);
    console.log(
      "Write-blog API - All searchParams:",
      Object.fromEntries(searchParams.entries())
    );
    let customPromptTemplate = null;
    let websiteNiche = null;

    if (websiteId) {
      try {
        const websiteResult = await query(
          "SELECT prompt_template, niche FROM websites WHERE id = $1",
          [parseInt(websiteId)]
        );
        if (websiteResult.rows.length > 0) {
          if (
            websiteResult.rows[0].prompt_template &&
            websiteResult.rows[0].prompt_template.trim()
          ) {
            customPromptTemplate = websiteResult.rows[0].prompt_template.trim();
            console.log(
              `Using custom prompt template for website_id: ${websiteId}`
            );
          } else {
            console.log(
              `No custom prompt template found for website_id: ${websiteId}, using default`
            );
          }
          if (
            websiteResult.rows[0].niche &&
            websiteResult.rows[0].niche.trim()
          ) {
            websiteNiche = websiteResult.rows[0].niche.trim();
            console.log(
              `Using niche for website_id ${websiteId}: ${websiteNiche}`
            );
          }
        }
      } catch (error) {
        console.error("Error fetching custom prompt template:", error);
        // Continue with default template if error
      }
    }

    // Define the default simple SEO-optimized prompt template
    const celebrityName = keyword;
    const nicheContext = websiteNiche
      ? `\n\nIMPORTANT - FAQ and Related Queries Section:
- Include a FAQ (Frequently Asked Questions) section at the end of the article
- Include a Related Queries section at the end of the article
- ALL FAQ questions and Related Queries MUST be relevant to the niche: "${websiteNiche}"
- FAQ questions should be about ${celebrityName} in relation to "${websiteNiche}"
- Related Queries should be search queries people might have about ${celebrityName} related to "${websiteNiche}"
- Do NOT include random or unrelated questions/queries
- Format FAQ using <h2>FAQ</h2> and <h3> for each question, with <p> for answers
- Format Related Queries using <h2>Related Queries</h2> and <ul><li> for each query`
      : "";

    const defaultPromptTemplate = `
Write a comprehensive SEO-optimized blog post about ${celebrityName} using the provided context. Create ACTUAL content, not template instructions.

Context: ${blogText}
Focus keyword: ${celebrityName}${nicheContext}

Instructions:
You are an Expert Blog Writer. Write an SEO-friendly blog post in a natural, human tone using the provided context.

SEO Optimization:
- Use the focus keyword "${celebrityName}" naturally throughout the content
- Include related LSI (Latent Semantic Indexing) keywords and synonyms
- Use proper HTML heading structure (H2, H3) for better SEO
- Write engaging, informative content that provides value to readers
- Use short paragraphs and bullet lists for better readability
- Bold important terms using the HTML <b> tag where natural
- Do NOT use meta statements like "the provided information confirms," "based on the provided information," or similar

Content Requirements:
- Write comprehensive, well-researched content based on the provided context
- Use the context information to create informative and engaging content
- Structure the content with clear headings and subheadings
- Include an introduction, main content sections, and a conclusion
- Write in a natural, human tone that engages readers
- Ensure all information is accurate based on the provided context
- Each section should be substantial (150-300 words minimum) with specific details
- Avoid repeating the same information across multiple sections
- Use concrete examples and specific details from the context
- Create smooth transitions between paragraphs and sections

Output Format:
- Output clean HTML markup
- Use proper HTML tags (p, h2, h3, ul, li, b, etc.)
- Do not include code blocks or markdown
- Ensure all HTML tags are properly closed
    `;

    // Use custom prompt template if available and not empty, otherwise use default simple SEO-optimized prompt
    let promptTemplate;
    if (customPromptTemplate && customPromptTemplate.trim()) {
      // User has custom prompt template - use it and replace placeholders
      promptTemplate = customPromptTemplate
        .replace(/\$\{celebrityName\}/g, celebrityName)
        .replace(/\$\{blogText\}/g, blogText)
        .replace(/\$\{niche\}/g, websiteNiche || "");

      // If niche is available and custom template doesn't have FAQ/Related Queries instructions, append them
      if (
        websiteNiche &&
        !promptTemplate.includes("FAQ") &&
        !promptTemplate.includes("Related Queries")
      ) {
        promptTemplate += `\n\nIMPORTANT - FAQ and Related Queries Section:
- Include a FAQ (Frequently Asked Questions) section at the end of the article
- Include a Related Queries section at the end of the article
- ALL FAQ questions and Related Queries MUST be relevant to the niche: "${websiteNiche}"
- FAQ questions should be about ${celebrityName} in relation to "${websiteNiche}"
- Related Queries should be search queries people might have about ${celebrityName} related to "${websiteNiche}"
- Do NOT include random or unrelated questions/queries
- Format FAQ using <h2>FAQ</h2> and <h3> for each question, with <p> for answers
- Format Related Queries using <h2>Related Queries</h2> and <ul><li> for each query`;
      }

      console.log(
        `Using custom prompt template (length: ${promptTemplate.length})`
      );
    } else {
      // No custom template or empty - use default simple SEO-optimized prompt
      // (defaultPromptTemplate already has ${celebrityName} and ${blogText} interpolated via template literal)
      promptTemplate = defaultPromptTemplate;
      console.log(
        `Using default prompt template (website_id: ${
          websiteId || "none"
        }, niche: ${websiteNiche || "none"})`
      );
    }

    // Inject quality guidelines into the prompt template (works for both custom and default)
    promptTemplate = injectQualityGuidelines(promptTemplate);
    console.log("Quality guidelines injected into prompt template");

    // Force per-article structural variation, overriding any fixed heading
    // list implied by a custom template stored in the database. This is
    // what actually prevents every article from sharing the same H2/FAQ
    // skeleton - the root cause of most of this site's pages never getting
    // indexed by Google.
    promptTemplate = injectStructuralVariation(promptTemplate, celebrityName);
    console.log("Structural variation directive injected into prompt template");

    let blogContent = "";

    // Use Azure OpenAI if available, otherwise use OpenAI
    if (useAzure) {
      // Azure OpenAI - use endpoint directly
      // Remove trailing slash if present and ensure proper format
      const endpoint = azureEndpoint.replace(/\/$/, "");
      const azureUrl = `${endpoint}/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`;

      console.log("Using Azure OpenAI:", {
        endpoint,
        deploymentName: azureDeploymentName,
        apiVersion: azureApiVersion,
        url: azureUrl,
        hasApiKey: !!azureApiKey,
      });

      const response = await fetch(azureUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": azureApiKey,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are an expert content writer. Create REAL, engaging content based on the provided information. Never output template instructions or placeholder text. Write actual informative content that answers the user's questions. Output only clean HTML markup with real content.",
            },
            {
              role: "user",
              content: promptTemplate,
            },
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
            errorData.error?.message ||
            errorData.error?.code ||
            response.statusText
          }`;
          console.error("Azure OpenAI error details:", errorData);
        } catch (e) {
          const errorText = await response.text();
          console.error("Azure OpenAI error response:", errorText);
          errorMessage = `Azure OpenAI API error: ${response.status} ${
            response.statusText
          }. ${errorText.substring(0, 200)}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      blogContent = data.choices[0]?.message?.content || "";
    } else {
      // Standard OpenAI
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content:
                  "You are an expert content writer. Create REAL, engaging content based on the provided information. Never output template instructions or placeholder text. Write actual informative content that answers the user's questions. Output only clean HTML markup with real content.",
              },
              {
                role: "user",
                content: promptTemplate,
              },
            ],
            temperature: 0.7,
            top_p: 0.9,
            presence_penalty: 0.3,
            frequency_penalty: 0.2,
            max_tokens: 4000,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `OpenAI API error: ${errorData.error?.message || response.statusText}`
        );
      }

      const data = await response.json();
      blogContent = data.choices[0]?.message?.content || "";
    }

    if (!blogContent) {
      throw new Error("Failed to generate blog content");
    }

    // Clean up the output (similar to Python function)
    // Remove code block markers
    blogContent = blogContent
      .replace(/```html\n?/g, "")
      .replace(/```html/g, "");
    blogContent = blogContent.replace(/```\n?/g, "").replace(/```/g, "");
    blogContent = blogContent.replace(/\n```/g, "");

    // Remove escaped newlines
    blogContent = blogContent.replace(/\\n/g, "");
    blogContent = blogContent.replace(/\r\n/g, "");
    blogContent = blogContent.replace(/\r/g, "");
    blogContent = blogContent.replace(/\n/g, "");

    // Remove whitespace between tags
    blogContent = blogContent.replace(/>\s+</g, "><");

    // Fix spacing around inline formatting tags (b, strong, i, em, u, span)
    // Add space before opening tag if it's directly adjacent to a word character (not already spaced)
    blogContent = blogContent.replace(
      /([a-zA-Z0-9.,;:!?)])<(?![\/])(b|strong|i|em|u|span)>/g,
      "$1 <$2>"
    );
    // Add space after closing tag if it's directly adjacent to a word character (not already spaced)
    blogContent = blogContent.replace(
      /<\/(b|strong|i|em|u|span)>([a-zA-Z0-9.,;:!?(])/g,
      "</$1> $2"
    );
    // Remove double spaces that might have been created
    blogContent = blogContent.replace(/\s{2,}/g, " ");

    // Clean up spaces around comments
    blogContent = blogContent.replace(/\s*(<!--[^>]*-->)\s*/g, "$1");

    // Add single newlines between blocks
    blogContent = blogContent.replace(
      /(<!-- \/wp:[^>]*? -->)(<!-- wp:[^>]*? -->)/g,
      "$1\n$2"
    );
    blogContent = blogContent.replace(/>\n</g, "><");

    // Final cleanup
    blogContent = blogContent.trim();

    // Ensure it starts with proper content
    if (!blogContent.startsWith("<")) {
      const firstTagIndex = blogContent.indexOf("<");
      if (firstTagIndex > 0) {
        blogContent = blogContent.substring(firstTagIndex);
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
