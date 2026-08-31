// Shared SEO/content-finishing logic for WordPress post creation. Extracted
// out of app/api/wp-create-post/route.js because that logic used to be
// duplicated 1:1 across its GET and POST handlers - the content checklist
// requires editing this logic anyway, so this is a small, justified DRY
// extraction rather than fixing the same bug twice.

const SITE_URL = "https://whatreligionisinfo.com/";

// Title/meta phrasing this site's content checklist explicitly bans -
// generic template language that reads as machine-generated and does not
// state the actual answer.
const BANNED_TITLE_PHRASES = [
  /\bexploring\b/i,
  /\bdiscover\b/i,
  /\d+\s+fascinating facts/i,
  /\binsights and impact\b/i,
];

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

// Generates a natural, answer-stating SEO title and meta description. Uses
// the confirmed `answer` (from extract-answer) instead of hardcoding the
// literal focus keyword into the title/description, which is what produced
// keyword-stuffed, ungrammatical copy site-wide before this change.
export async function generateSEOContent(celebrityName, answer, postContent) {
  const religionPhrase = answer?.denomination
    ? `${answer.denomination} ${answer.religion || ""}`.trim()
    : answer?.religion || "religion";

  let seoTitle = `What Religion Is ${celebrityName}? ${
    answer?.religion ? `${answer.religion} Faith Explained` : "Explained"
  }`;
  let metaDescription = `${celebrityName} is ${religionPhrase}. Here's what they've said publicly and how it's documented, with sources.`;

  try {
    const { azureApiKey, azureEndpoint, azureDeploymentName, azureApiVersion } =
      getAzureConfig();
    const useAzure = azureApiKey && azureEndpoint && azureDeploymentName;

    if (useAzure) {
      const endpoint = azureEndpoint.replace(/\/$/, "");
      const azureUrl = `${endpoint}/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`;

      try {
        const titleResponse = await fetch(azureUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": azureApiKey },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `Write one natural, human-sounding SEO title for an article that answers "What religion is ${celebrityName}?". The confirmed answer is: ${celebrityName} is ${religionPhrase}.
Rules:
- State the actual answer in the title, phrased the way a person would write it, e.g. "What Religion Is Usha Vance? Her Hindu Faith, Explained"
- 50-70 characters
- Do NOT use the words "Exploring", "Discover", "Insights", or any "N Fascinating Facts" style phrasing
- No quotes around the title, no year-stuffing, no clickbait
- Title case
Return only the title text, no quotes, no commentary.`,
              },
              { role: "user", content: postContent.substring(0, 500) },
            ],
            temperature: 0.3,
            max_tokens: 100,
          }),
        });

        if (titleResponse.ok) {
          const titleData = await titleResponse.json();
          const candidate = titleData.choices?.[0]?.message?.content;
          if (candidate && candidate.trim()) {
            seoTitle = candidate.trim().replace(/^["']|["']$/g, "").trim();
          }
        }
      } catch (error) {
        console.error("Error generating SEO title:", error);
      }

      try {
        const descResponse = await fetch(azureUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": azureApiKey },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `Write one plain, human-sounding meta description (150-160 characters) for an article confirming that ${celebrityName} is ${religionPhrase}. Write it the way a person would summarize the article, not keyword-stuffed. Do not repeat the phrase "${celebrityName} religion" verbatim, and do not start with "Discover".`,
              },
              { role: "user", content: postContent.substring(0, 500) },
            ],
            temperature: 0.3,
            max_tokens: 200,
          }),
        });

        if (descResponse.ok) {
          const descData = await descResponse.json();
          const candidate = descData.choices?.[0]?.message?.content;
          if (candidate && candidate.trim()) {
            metaDescription = candidate.trim().replace(/^["']|["']$/g, "").trim();
          }
        }
      } catch (error) {
        console.error("Error generating meta description:", error);
      }
    }
  } catch (error) {
    console.error("Error in SEO generation:", error);
  }

  return { seoTitle, metaDescription };
}

export function titleHasBannedPhrase(title) {
  return BANNED_TITLE_PHRASES.some((pattern) => pattern.test(title || ""));
}

// Builds FAQPage + Article + Person JSON-LD from the finished article HTML
// and the confirmed answer. Emitted directly in post content (as a
// <script type="application/ld+json"> block) rather than relying on Rank
// Math's own schema settings, since the REST meta field precedent
// (setRankMathMeta) showed WP-side "it should just work" assumptions here
// can silently not persist.
export function buildJsonLd({ celebrityName, answer, contentHtml, postUrl, seoTitle, publishedDate }) {
  const faqMatches = [
    ...contentHtml.matchAll(/<h3[^>]*>(.*?)<\/h3>\s*<p[^>]*>(.*?)<\/p>/gis),
  ];
  const faqEntities = faqMatches.map(([, question, answerHtml]) => ({
    "@type": "Question",
    name: stripTags(question),
    acceptedAnswer: {
      "@type": "Answer",
      text: stripTags(answerHtml),
    },
  }));

  const graph = [
    {
      "@type": "Article",
      headline: seoTitle,
      datePublished: publishedDate,
      dateModified: publishedDate,
      author: { "@type": "Person", name: "Naveed" },
      mainEntityOfPage: postUrl || undefined,
      about: { "@type": "Person", name: celebrityName },
    },
    {
      "@type": "Person",
      name: celebrityName,
      ...(answer?.religion ? { religion: answer.religion } : {}),
    },
  ];

  if (faqEntities.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqEntities,
    });
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": graph,
  };

  return `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

function stripTags(html) {
  return (html || "").replace(/<[^>]+>/g, "").trim();
}

// Honest author bio (the previous version claimed "sources cited
// throughout" regardless of whether the article actually had any
// citations - now true because write-blog enforces inline citations, but
// this also describes the actual process instead of a vague claim).
export function buildAuthorBioHtml() {
  return (
    "<h2>About the Author</h2>" +
    "<p>Naveed is a Software and AI engineer based in Pakistan and the founder of " +
    `<a href="${SITE_URL}">whatreligionisinfo.com</a>. ` +
    "Every article states its answer with linked, on-the-record sources - the person's own statements, their organization, or reputable news coverage - listed in full under Sources at the end of the article. Spotted an error? Get in touch and it will be corrected.</p>"
  );
}

export function buildInternalPromoHtml() {
  return (
    "<p>If you are interested in learning more about religion, please visit " +
    `<a href="${SITE_URL}">whatreligionisinfo.com</a>.</p>`
  );
}

export function buildLastReviewedHtml(date) {
  const formatted = (date || new Date()).toISOString().slice(0, 10);
  return `<p><em>Last reviewed: ${formatted}</em></p>`;
}

export function appendPostFooter(contentHtml, publishedDate) {
  if (contentHtml.includes("About the Author")) {
    return contentHtml;
  }
  return (
    buildLastReviewedHtml(publishedDate) +
    contentHtml +
    buildInternalPromoHtml() +
    buildAuthorBioHtml()
  );
}

// Programmatically-verifiable subset of the pre-publish checklist (Part B).
// Anything failing here means the article should be saved as a draft
// rather than published live - "would this page be better than the site's
// median page? If no, don't publish."
export function runPrePublishChecklist(contentHtml, { seoTitle } = {}) {
  const failures = [];

  const inlineLinkCount = (contentHtml.match(/<a\s+href=/gi) || []).length;
  if (inlineLinkCount < 2) {
    failures.push(`Fewer than 2 inline citation links found (${inlineLinkCount})`);
  }

  if (titleHasBannedPhrase(seoTitle)) {
    failures.push(`Title contains a banned generic phrase: "${seoTitle}"`);
  }

  if (!/<h2[^>]*>\s*Sources\s*<\/h2>/i.test(contentHtml)) {
    failures.push('Missing a visible "Sources" section');
  }

  if (!/Last reviewed:/i.test(contentHtml)) {
    failures.push('Missing "Last reviewed" date');
  }

  if (/\bthis person\b/i.test(contentHtml) || /\[name\]/i.test(contentHtml)) {
    failures.push("Contains unfilled template placeholders");
  }

  return { passed: failures.length === 0, failures };
}
