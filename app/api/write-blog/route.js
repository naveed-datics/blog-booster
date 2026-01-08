import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// POST endpoint to write blog post
export async function POST(request) {
  try {
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

    // Get website_id from query params or body to fetch custom prompt template
    const websiteId = searchParams.get("website_id");
    console.log("Write-blog API - Received website_id:", websiteId);
    console.log(
      "Write-blog API - All searchParams:",
      Object.fromEntries(searchParams.entries())
    );
    let customPromptTemplate = null;

    if (websiteId) {
      try {
        const websiteResult = await query(
          "SELECT prompt_template FROM websites WHERE id = $1",
          [parseInt(websiteId)]
        );
        if (
          websiteResult.rows.length > 0 &&
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
      } catch (error) {
        console.error("Error fetching custom prompt template:", error);
        // Continue with default template if error
      }
    }

    // Define the default simple SEO-optimized prompt template
    const celebrityName = keyword;
    const defaultPromptTemplate = `
Write a comprehensive SEO-optimized blog post about ${celebrityName} using the provided context. Create ACTUAL content, not template instructions.

Context: ${blogText}
Focus keyword: ${celebrityName}

Instructions:
You are an Expert Blog Writer. Write an SEO-friendly blog post in a natural, human tone using the provided context.

IMPORTANT - Title Requirements:
- Do NOT include quotes ("" or '') around the title or any headings
- Write titles and headings without quotation marks
- Use plain text for all titles and headings

SEO Optimization:
- Use the focus keyword "${celebrityName}" naturally throughout the content
- Include related LSI (Latent Semantic Indexing) keywords and synonyms
- Use proper HTML heading structure (H2, H3) for better SEO
- Write engaging, informative content that provides value to readers
- Bold important terms using the HTML <b> tag where natural
- Do NOT use meta statements like "the provided information confirms," "based on the provided information," or similar

Content Requirements:
- Write detailed paragraphs with 4-5 sentences each. Each paragraph should be comprehensive and provide substantial information. Avoid short, choppy paragraphs.
- Write comprehensive, well-researched content based on the provided context
- Use the context information to create informative and engaging content
- Structure the content with clear headings and subheadings
- Include an introduction, main content sections, and a conclusion
- Write in a natural, human tone that engages readers
- Ensure all information is accurate based on the provided context

FAQ Section Requirements:
- Include a FAQ section with 5-7 questions specifically about ${celebrityName}'s religion, beliefs, religious background, and faith practices
- Do NOT include general questions about religion
- All FAQs must be directly related to ${celebrityName}
- Format FAQs using proper HTML structure (h2 for "Frequently Asked Questions" heading, then questions as h3 and answers as paragraphs)

Related Queries Section Requirements:
- Include a "Related Queries" section with 8-10 search queries that are specifically related to ${celebrityName}'s religion, religious beliefs, faith background, and similar celebrity religion topics
- Do NOT include general religious queries
- All queries must be niche-specific to celebrity religion topics
- Format as a list using HTML ul/li tags

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
        .replace(/\$\{blogText\}/g, blogText);
      console.log(
        `Using custom prompt template (length: ${promptTemplate.length})`
      );
    } else {
      // No custom template or empty - use default simple SEO-optimized prompt
      // (defaultPromptTemplate already has ${celebrityName} and ${blogText} interpolated via template literal)
      promptTemplate = defaultPromptTemplate;
      console.log(
        `Using default prompt template (website_id: ${websiteId || "none"})`
      );
    }

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

    // Remove quotes from title if present
    let cleanTitle = keyword.trim();
    cleanTitle = cleanTitle.replace(/^["']+|["']+$/g, "");

    return NextResponse.json({
      status: "success",
      blog_post: {
        title: cleanTitle,
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
