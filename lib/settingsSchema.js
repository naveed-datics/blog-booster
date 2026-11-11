/**
 * Registry of every runtime setting the app reads, grouped for the
 * /settings UI. This is the single source of truth: the settings page, its
 * API route and the seed script are all driven from this list.
 *
 * Bootstrap values are intentionally absent - see BOOTSTRAP_ENV_KEYS below.
 */

/**
 * Values that must stay in the environment and are NOT settable from the UI.
 * app_settings lives inside the database DATABASE_URL points at, and NextAuth
 * reads its secret at module load before any query can run.
 */
export const BOOTSTRAP_ENV_KEYS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'AUTH_URL',
  'NEXTAUTH_URL',
];

/** @typedef {{ key: string, label: string, secret?: boolean, required?: boolean, placeholder?: string, help?: string, type?: 'text'|'textarea'|'boolean'|'number' }} SettingField */

/**
 * Each group renders as one panel behind a sidebar entry on /settings.
 * `icon` names a lucide-react export; `navLabel` is the short sidebar text.
 */

/** @type {ReadonlyArray<{ id: string, title: string, description: string, fields: ReadonlyArray<SettingField> }>} */
export const SETTINGS_GROUPS = [
  {
    id: 'llm',
    icon: 'Sparkles',
    navLabel: 'Claude LLM',
    title: 'Claude LLM',
    description:
      'Primary content-generation model. Jobs are submitted asynchronously and polled until they finish.',
    fields: [
      {
        key: 'CLAUDE_LLM_API_KEY',
        label: 'API key',
        secret: true,
        required: true,
        placeholder: 'ck_live_...',
        help: 'Sent as "Authorization: Bearer <key>".',
      },
      {
        key: 'CLAUDE_LLM_BASE_URL',
        label: 'Base URL',
        placeholder: 'https://claude-llm.vercel.app',
        help: 'Origin only - /api/v1/run and /api/v1/jobs/:id are appended.',
      },
      {
        key: 'CLAUDE_LLM_WEBHOOK_SECRET',
        label: 'Webhook secret',
        secret: true,
        placeholder: 'whsec_...',
        help: 'Stored for future webhook delivery; polling does not use it.',
      },
      {
        key: 'CLAUDE_LLM_TIMEOUT_MS',
        label: 'Job timeout (ms)',
        type: 'number',
        placeholder: '120000',
        help: 'How long to poll a job before giving up. Default 120000.',
      },
    ],
  },
  {
    id: 'humanize',
    icon: 'Wand2',
    navLabel: 'Humanize',
    title: 'Humanize',
    description: 'Separate OpenAI-compatible endpoint used by the humanize step.',
    fields: [
      { key: 'HUMANIZE_OPENAI_API_KEY', label: 'API key', secret: true },
      {
        key: 'HUMANIZE_OPENAI_BASE_URL',
        label: 'Base URL',
        placeholder: 'https://models.github.ai/inference',
      },
    ],
  },
  {
    id: 'search',
    icon: 'Search',
    navLabel: 'Search & trends',
    title: 'Search & trends',
    description: 'Trend discovery, source finding and image search.',
    fields: [
      { key: 'SERPAPI_KEY', label: 'SerpApi key', secret: true, help: '~1 call/day.' },
      { key: 'TAVILY_API_KEY', label: 'Tavily key', secret: true, help: '2 calls per article.' },
      { key: 'GEMINI_API_KEY', label: 'Gemini key', secret: true },
      { key: 'GOOGLE_API_KEY', label: 'Google API key', secret: true, help: 'Fallback when Gemini key is unset.' },
    ],
  },
  {
    id: 'wordpress',
    icon: 'Globe',
    navLabel: 'WordPress',
    title: 'WordPress publishing',
    description: 'Target site for generated articles.',
    fields: [
      { key: 'WP_BASE_URL', label: 'Site URL', placeholder: 'https://example.com' },
      {
        key: 'WP_AUTH_HEADER',
        label: 'Auth header',
        secret: true,
        placeholder: 'Basic base64(user:app_password)',
        help: 'Full header value including the "Basic " prefix.',
      },
    ],
  },
  {
    id: 'gsc',
    icon: 'LineChart',
    navLabel: 'Search Console',
    title: 'Google Search Console',
    description: 'OAuth client for Search Console performance data.',
    fields: [
      { key: 'GOOGLE_CLIENT_ID', label: 'Client ID' },
      { key: 'GOOGLE_CLIENT_SECRET', label: 'Client secret', secret: true },
      {
        key: 'GOOGLE_OAUTH_REDIRECT_URI',
        label: 'Redirect URI',
        placeholder: 'https://example.com/api/search-console/callback',
      },
    ],
  },
  {
    id: 'cron',
    icon: 'Clock',
    navLabel: 'Cron & pipeline',
    title: 'Cron & pipeline',
    description: 'Daily article pipeline scheduling and limits.',
    fields: [
      {
        key: 'CRON_SECRET',
        label: 'Cron secret',
        secret: true,
        help: 'Shared with Vercel Cron; forwarded as x-cron-secret.',
      },
      { key: 'CRON_ENABLED', label: 'Enable dev cron', type: 'boolean' },
      { key: 'NEXT_PUBLIC_BASE_URL', label: 'Public base URL', placeholder: 'https://example.com' },
      { key: 'RECOVERY_MODE', label: 'Recovery mode', type: 'boolean' },
      { key: 'RECOVERY_START_DATE', label: 'Recovery start date', placeholder: 'YYYY-MM-DD' },
      { key: 'RECOVERY_MIN_WEEKS', label: 'Recovery min weeks', type: 'number' },
      { key: 'RECOVERY_DAILY_LIMIT', label: 'Recovery daily limit', type: 'number' },
      { key: 'RECOVERY_REFRESH_LIMIT', label: 'Recovery refresh limit', type: 'number' },
      { key: 'NORMAL_DAILY_LIMIT', label: 'Normal daily limit', type: 'number' },
      { key: 'NORMAL_REFRESH_LIMIT', label: 'Normal refresh limit', type: 'number' },
      {
        key: 'BULK_REMEDIATION_BYPASS_QUOTA',
        label: 'Bulk remediation bypasses quota',
        type: 'boolean',
      },
    ],
  },
  {
    id: 'indexnow',
    icon: 'Radio',
    navLabel: 'IndexNow',
    title: 'IndexNow',
    description: 'Optional ping-on-publish for Bing and friends.',
    fields: [
      { key: 'INDEXNOW_KEY', label: 'IndexNow key', secret: true },
      { key: 'INDEXNOW_HOST', label: 'Host', placeholder: 'example.com' },
    ],
  },
];

/** Every settable key, flattened. */
export const SETTING_KEYS = SETTINGS_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

const FIELD_BY_KEY = new Map(
  SETTINGS_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f]))
);

/** @param {string} key */
export function getSettingField(key) {
  return FIELD_BY_KEY.get(key) || null;
}

/** @param {string} key */
export function isSecretKey(key) {
  return Boolean(FIELD_BY_KEY.get(key)?.secret);
}

/** @param {string} key */
export function isSettableKey(key) {
  return FIELD_BY_KEY.has(key);
}
