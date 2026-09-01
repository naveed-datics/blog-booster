import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCelebrityName,
  buildSlugCandidates,
  slugFromPostUrl,
  celebrityNameFromSlug,
  parseLastReviewedFromContent,
} from './personName.js';

describe('normalizeCelebrityName', () => {
  it('lowercases and strips accents', () => {
    assert.equal(normalizeCelebrityName('Kylian Mbappé'), 'kylian mbappe');
    assert.equal(normalizeCelebrityName('  Anne Hathaway '), 'anne hathaway');
  });
});

describe('buildSlugCandidates', () => {
  it('returns religion and faith slug variants', () => {
    const candidates = buildSlugCandidates('Anne Hathaway');
    assert.ok(candidates.includes('anne-hathaway-religion'));
    assert.ok(candidates.includes('what-religion-is-anne-hathaway'));
  });
});

describe('slugFromPostUrl', () => {
  it('extracts slug from full URL', () => {
    assert.equal(
      slugFromPostUrl('https://whatreligionisinfo.com/anne-hathaway-religion/'),
      'anne-hathaway-religion'
    );
  });
});

describe('celebrityNameFromSlug', () => {
  it('reverses religion slug to display name', () => {
    assert.equal(celebrityNameFromSlug('anne-hathaway-religion'), 'Anne Hathaway');
    assert.equal(
      celebrityNameFromSlug('what-religion-is-anne-hathaway'),
      'Anne Hathaway'
    );
    assert.equal(celebrityNameFromSlug('anne-hathaway-religion-2'), 'Anne Hathaway');
  });
});

describe('parseLastReviewedFromContent', () => {
  it('parses last reviewed footer from HTML', () => {
    const html = '<p><em>Last reviewed: September 1, 2026</em></p>';
    assert.equal(parseLastReviewedFromContent(html), '2026-09-01');
  });
});
