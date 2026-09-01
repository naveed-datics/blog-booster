/**
 * Strip plugin-injected markup before persisting post HTML.
 * Never merge content.rendered from WordPress (includes ez-toc etc.).
 */

const EZ_TOC_CONTAINER =
  /<div[^>]*id=["']ez-toc-container["'][^>]*>[\s\S]*?<\/div>/gi;
const EZ_TOC_SECTION = /<span[^>]*class=["'][^"']*ez-toc-section[^"']*["'][^>]*>[\s\S]*?<\/span>/gi;
const EZ_TOC_SHORTCODES = /\[(?:ez-toc|toc)\][^\]]*\]/gi;
const EZ_TOC_CLASS_ATTR = /\sclass=["'][^"']*ez-toc[^"']*["']/gi;

export function sanitizePostHtml(html) {
  if (!html || typeof html !== 'string') return html || '';

  let out = html;
  out = out.replace(EZ_TOC_CONTAINER, '');
  out = out.replace(EZ_TOC_SECTION, '');
  out = out.replace(EZ_TOC_SHORTCODES, '');
  out = out.replace(EZ_TOC_CLASS_ATTR, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

/** Reject rendered WP content — callers must use content.raw only. */
export function extractRawContentFromWpPost(post) {
  if (!post?.content) return null;
  if (typeof post.content.raw === 'string') {
    return post.content.raw;
  }
  return null;
}

export function assertNotRenderedContent(content, label = 'content') {
  if (content && typeof content === 'object' && content.rendered && !content.raw) {
    throw new Error(
      `${label} must use content.raw (?context=edit), not content.rendered`
    );
  }
}

export const WHY_IN_NEWS_START = '<!-- PIPELINE:why-in-news:start -->';
export const WHY_IN_NEWS_END = '<!-- PIPELINE:why-in-news:end -->';

export function buildWhyInNewsBlock(htmlSection) {
  return `${WHY_IN_NEWS_START}\n${htmlSection.trim()}\n${WHY_IN_NEWS_END}`;
}

/** Replace or insert the why-in-news marker block (never append duplicates). */
export function replaceWhyInNewsSection(contentHtml, sectionHtml) {
  const block = buildWhyInNewsBlock(sectionHtml);
  const startIdx = contentHtml.indexOf(WHY_IN_NEWS_START);
  const endIdx = contentHtml.indexOf(WHY_IN_NEWS_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const after = endIdx + WHY_IN_NEWS_END.length;
    return contentHtml.slice(0, startIdx) + block + contentHtml.slice(after);
  }

  const firstPara = contentHtml.indexOf('</p>');
  if (firstPara !== -1) {
    const insertAt = firstPara + '</p>'.length;
    return (
      contentHtml.slice(0, insertAt) +
      '\n\n' +
      block +
      '\n\n' +
      contentHtml.slice(insertAt)
    );
  }

  return block + '\n\n' + contentHtml;
}

/** Dedupe Sources list items by href. */
export function dedupeSourcesList(contentHtml) {
  const sourcesMatch = contentHtml.match(
    /(<h2[^>]*>\s*Sources\s*<\/h2>\s*<ul>)([\s\S]*?)(<\/ul>)/i
  );
  if (!sourcesMatch) return contentHtml;

  const [, open, inner, close] = sourcesMatch;
  const seen = new Set();
  const items = [];
  const liRegex = /<li[^>]*>[\s\S]*?<\/li>/gi;
  let m;
  while ((m = liRegex.exec(inner)) !== null) {
    const hrefMatch = m[0].match(/href=["']([^"']+)["']/i);
    const href = hrefMatch ? hrefMatch[1].toLowerCase() : m[0];
    if (seen.has(href)) continue;
    seen.add(href);
    items.push(m[0]);
  }

  const newInner = items.join('\n');
  return contentHtml.replace(
    sourcesMatch[0],
    `${open}${newInner}${close}`
  );
}
