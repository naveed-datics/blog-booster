/**
 * Public catalog of the pipeline endpoints a shared API key may call.
 *
 * Drives the Settings page documentation, so what is shown is one
 * definition rather than prose that can drift from the routes.
 *
 * Keep in sync with the routes that use isPipelineAuthorized().
 */

/** @typedef {{ name: string, required?: boolean, type?: string, description: string }} ApiParam */

export const API_CATALOG = [
  {
    id: 'trend-search',
    method: 'GET',
    path: '/api/trend-search',
    title: 'Discover trending people',
    description:
      'Pulls rising search queries, extracts person names, screens them for topical fit, and saves new trends.',
    query: [
      { name: 'q', required: false, description: 'Seed query. Defaults to "religion".' },
      { name: 'website_id', required: false, description: 'Website to attach saved trends to.' },
    ],
    example: { celebrities: ['Jane Doe'], saved: 1, skipped: 0, gated: 2 },
    notes: 'Costs one SerpAPI call plus two LLM calls. Intended for ~1 run/day.',
  },
  {
    id: 'trends',
    method: 'GET',
    path: '/api/trends',
    title: 'List stored trends',
    description: 'Reads previously discovered trends from the database.',
    query: [
      { name: 'website_id', required: false, description: 'Filter by website.' },
      { name: 'search_query', required: false, description: 'Filter by the seed query used.' },
      { name: 'date', required: false, description: 'Filter by date (YYYY-MM-DD).' },
      { name: 'limit', required: false, type: 'number', description: 'Max rows (default 100).' },
      { name: 'offset', required: false, type: 'number', description: 'Pagination offset.' },
    ],
    example: {
      trends: [
        {
          id: 1625,
          search_query: 'religion',
          trend_text: '17. jane doe +100%',
          celebrity_name: 'Jane Doe',
          trend_value: '+100%',
          url: 'https://example.com/jane-doe-religion/',
          created_at: '2026-11-09T00:24:56.202Z',
          trend_date: '2026-11-08T19:00:00.000Z',
        },
      ],
      total: 1062,
      limit: 1,
      offset: 0,
    },
  },
  {
    id: 'find-sources',
    method: 'GET',
    path: '/api/find-sources',
    title: 'Find source URLs',
    description: 'Searches the web for sources about a person and returns candidate URLs.',
    query: [{ name: 'q', required: true, description: 'Person name to research.' }],
    example: {
      keyword: 'Jane Doe',
      wikipedia: 'https://en.wikipedia.org/wiki/Jane_Doe',
      sources: ['https://en.wikipedia.org/wiki/Jane_Doe', 'https://example.com/profile'],
      sourceDetails: [
        {
          url: 'https://en.wikipedia.org/wiki/Jane_Doe',
          title: 'Jane Doe',
          snippet: 'Extracted snippet...',
          domain: 'en.wikipedia.org',
        },
      ],
      religionURL: 'https://example.com/faith-article',
      religion: 'https://example.org/profile',
    },
    notes: 'Pass `sourceDetails` straight through to /api/extract-answer.',
  },
  {
    id: 'fetch-content',
    method: 'POST',
    path: '/api/fetch-content',
    title: 'Scrape source pages',
    description: 'Fetches and extracts readable text from the given URLs.',
    body: {
      urls: ['https://example.com/article', 'https://example.org/profile'],
    },
    bodyParams: [
      { name: 'urls', required: true, type: 'string[]', description: 'URLs to fetch and extract.' },
    ],
    example: {
      totalUrls: 1,
      successCount: 1,
      failureCount: 0,
      results: [
        { url: 'https://example.com/article', success: true, content: 'Extracted text...' },
      ],
    },
  },
  {
    id: 'extract-answer',
    method: 'POST',
    path: '/api/extract-answer',
    title: 'Extract a sourced answer',
    description:
      'Determines, strictly from the supplied content, whether the person\'s religion is a matter of public record. Citations are verified against the supplied source URLs.',
    body: {
      celebrityName: 'Jane Doe',
      combinedContent: 'Scraped text from the sources...',
      sourceDetails: [{ url: 'https://example.com/article', title: 'Example article' }],
    },
    bodyParams: [
      { name: 'celebrityName', required: true, description: 'Person to extract an answer for.' },
      { name: 'combinedContent', required: true, description: 'Scraped text from the sources.' },
      { name: 'sourceDetails', required: false, type: 'array', description: 'The {url, title} list the content came from. Citations outside this list are dropped.' },
    ],
    example: {
      celebrityName: 'Jane Doe',
      hasPublicAnswer: true,
      religion: 'Christianity',
      denomination: null,
      confidence: 'high',
      supportingQuote: 'She has described herself as a practising Christian.',
      sourceUrl: 'https://example.com/article',
      additionalCitations: [],
    },
    notes: 'hasPublicAnswer=false means no sourced answer was found - do not publish.',
  },
  {
    id: 'write-blog',
    method: 'POST',
    path: '/api/write-blog',
    title: 'Generate article HTML',
    description: 'Writes the article from the confirmed answer and scraped context.',
    query: [
      { name: 'keyword', required: true, description: 'Person name the article is about.' },
      { name: 'website_id', required: false, description: 'Used for niche-aware FAQ topics.' },
    ],
    body: {
      blogText: 'Scraped context...',
      answer: { hasPublicAnswer: true, religion: 'Christianity', sourceUrl: 'https://example.com/article' },
    },
    bodyParams: [
      { name: 'blogText', required: true, description: 'Scraped context for the article.' },
      { name: 'answer', required: true, type: 'object', description: 'Confirmed answer from extract-answer. Requires hasPublicAnswer, religion and sourceUrl.' },
    ],
    example: { content: '<h2>What Religion Is Jane Doe?</h2><p>...</p>' },
    notes: 'Returns 422 unless `answer` carries a sourced public answer.',
  },
  {
    id: 'humanize',
    method: 'POST',
    path: '/api/humanize',
    title: 'Humanize article HTML',
    description: 'Rewrites generated HTML to read less like machine output.',
    body: { html: '<h2>Heading</h2><p>Paragraph...</p>' },
    bodyParams: [{ name: 'html', required: true, description: 'Article HTML to rewrite.' }],
    example: { html: '<h2>Heading</h2><p>Rewritten paragraph...</p>' },
  },
  {
    id: 'image-search',
    method: 'GET',
    path: '/api/image-search',
    title: 'Find a featured image',
    description: 'Searches for images matching a query.',
    query: [
      { name: 'q', required: true, description: 'Image search query.' },
      { name: 'limit', required: false, type: 'number', description: 'Max images to return.' },
    ],
    example: {
      keyword: 'Jane Doe',
      url: 'https://example.com/photo.jpg',
      images: [
        {
          position: 1,
          title: 'Untitled',
          thumbnail_url: 'https://example.com/photo.jpg',
          full_size_url: 'https://example.com/photo.jpg',
          source: 'Tavily',
          source_url: 'https://example.com/photo.jpg',
        },
      ],
    },
    notes: '`url` is the first image, provided as a convenience.',
  },
];

/** The full pipeline, in the order a consumer would call it. */
export const PIPELINE_ORDER = [
  'trend-search',
  'find-sources',
  'fetch-content',
  'extract-answer',
  'write-blog',
  'humanize',
  'image-search',
];
