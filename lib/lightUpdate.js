import {
  buildWhyInNewsBlock,
  dedupeSourcesList,
  replaceWhyInNewsSection,
} from '@/lib/htmlSanitizer';

export async function generateLightUpdateSection(celebrityName, freshContext) {
  let azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  let azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  let azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  let azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';

  if (azureApiKey) azureApiKey = azureApiKey.replace(/^["']|["']$/g, '');
  if (azureEndpoint) azureEndpoint = azureEndpoint.replace(/^["']|["']$/g, '');
  if (azureDeploymentName) azureDeploymentName = azureDeploymentName.replace(/^["']|["']$/g, '');
  if (azureApiVersion) azureApiVersion = azureApiVersion.replace(/^["']|["']$/g, '');

  const today = new Date().toISOString().slice(0, 10);
  const fallback = `<h2>Why this is in the news</h2><p>${celebrityName} is back in public attention. See the sources below for recent coverage.</p>`;

  if (!azureApiKey || !azureEndpoint || !azureDeploymentName) {
    return buildWhyInNewsBlock(fallback);
  }

  const prompt = `Write a short HTML section for an existing religion article about ${celebrityName}.

Recent context:
${freshContext || '(no specific recent news)'}

Output ONLY:
<h2>Why this is in the news</h2>
<p>100-150 words explaining why they are trending now. Mention faith only if the context supports it.</p>

No markdown, no code blocks.`;

  const endpoint = azureEndpoint.replace(/\/$/, '');
  const azureUrl = `${endpoint}/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`;

  try {
    const response = await fetch(azureUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': azureApiKey },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'Output clean HTML only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 400,
      }),
    });

    if (!response.ok) return buildWhyInNewsBlock(fallback);

    const data = await response.json();
    const html = data.choices?.[0]?.message?.content?.trim() || fallback;
    return buildWhyInNewsBlock(html.replace(/```html?\n?/gi, '').replace(/```/g, '').trim());
  } catch {
    return buildWhyInNewsBlock(fallback);
  }
}

export function applyLightUpdate(existingHtml, whyInNewsBlockHtml, newSourceItemsHtml = '') {
  let content = replaceWhyInNewsSection(existingHtml, whyInNewsBlockHtml);

  if (newSourceItemsHtml) {
    const sourcesMatch = content.match(/(<h2[^>]*>\s*Sources\s*<\/h2>\s*<ul>)([\s\S]*?)(<\/ul>)/i);
    if (sourcesMatch) {
      content = content.replace(
        sourcesMatch[0],
        `${sourcesMatch[1]}${sourcesMatch[2].trim()}\n${newSourceItemsHtml}${sourcesMatch[3]}`
      );
    }
  }

  return dedupeSourcesList(content);
}

export async function fetchFreshNewsContext(celebrityName) {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) return '';

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyKey,
      query: `${celebrityName} news`,
      search_depth: 'basic',
      max_results: 4,
      days: 7,
    }),
  });

  if (!res.ok) return '';
  const data = await res.json();
  return (data.results || [])
    .map((r) => `- ${r.title}: ${r.content}`.slice(0, 400))
    .join('\n');
}
