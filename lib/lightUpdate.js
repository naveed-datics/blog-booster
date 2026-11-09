import {
  buildWhyInNewsBlock,
  dedupeSourcesList,
  replaceWhyInNewsSection,
} from '@/lib/htmlSanitizer';
import { runClaudeText, isClaudeLlmConfigured } from '@/lib/claudeLlm';
import { getSetting } from '@/lib/settings';

export async function generateLightUpdateSection(celebrityName, freshContext) {
  const fallback = `<h2>Why this is in the news</h2><p>${celebrityName} is back in public attention. See the sources below for recent coverage.</p>`;

  if (!(await isClaudeLlmConfigured())) {
    return buildWhyInNewsBlock(fallback);
  }

  const prompt = `Write a short HTML section for an existing religion article about ${celebrityName}.

Recent context:
${freshContext || '(no specific recent news)'}

Output ONLY:
<h2>Why this is in the news</h2>
<p>100-150 words explaining why they are trending now. Mention faith only if the context supports it.</p>

No markdown, no code blocks.`;

  try {
    const html = await runClaudeText({
      instructions: 'Output clean HTML only. No markdown, no code fences, no commentary.',
      text: prompt,
    });

    return buildWhyInNewsBlock(html?.trim() ? html.trim() : fallback);
  } catch (error) {
    console.error('Error generating light update section:', error.message);
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
  const tavilyKey = await getSetting('TAVILY_API_KEY');
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
