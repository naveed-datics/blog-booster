import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizePostHtml,
  replaceWhyInNewsSection,
  dedupeSourcesList,
  WHY_IN_NEWS_START,
  WHY_IN_NEWS_END,
} from './htmlSanitizer.js';

test('sanitizePostHtml removes ez-toc container', () => {
  const html =
    '<p>Intro</p><div id="ez-toc-container"><nav>TOC</nav></div><p>Body</p>';
  const out = sanitizePostHtml(html);
  assert.ok(!out.includes('ez-toc-container'));
  assert.ok(out.includes('Intro'));
  assert.ok(out.includes('Body'));
});

test('replaceWhyInNewsSection replaces existing block', () => {
  const original = `<p>Lead</p>${WHY_IN_NEWS_START}<h2>Old</h2>${WHY_IN_NEWS_END}<p>Rest</p>`;
  const updated = replaceWhyInNewsSection(original, '<h2>Why this is in the news</h2><p>New</p>');
  assert.equal((updated.match(/Why this is in the news/g) || []).length, 1);
  assert.ok(!updated.includes('Old'));
});

test('dedupeSourcesList removes duplicate hrefs', () => {
  const html = `<h2>Sources</h2><ul>
<li><a href="https://a.com">A</a></li>
<li><a href="https://a.com">A dup</a></li>
<li><a href="https://b.com">B</a></li>
</ul>`;
  const out = dedupeSourcesList(html);
  assert.equal((out.match(/https:\/\/a\.com/g) || []).length, 1);
  assert.ok(out.includes('https://b.com'));
});
