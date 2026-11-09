/**
 * One-time migration helper: copies the runtime config that used to live in
 * .env.local into the app_settings table, so the /settings page becomes the
 * source of truth.
 *
 * Existing rows are left alone unless --overwrite is passed, so re-running
 * this never clobbers a value edited in the UI.
 *
 * Usage:
 *   node scripts/import-env-to-settings.mjs [--overwrite] [--dry-run]
 */
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const OVERWRITE = process.argv.includes('--overwrite');
const DRY_RUN = process.argv.includes('--dry-run');

// Keys read straight from the environment under the same name.
const DIRECT_KEYS = [
  'HUMANIZE_OPENAI_API_KEY',
  'HUMANIZE_OPENAI_BASE_URL',
  'SERPAPI_KEY',
  'TAVILY_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'WP_BASE_URL',
  'WP_AUTH_HEADER',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'CRON_SECRET',
  'CRON_ENABLED',
  'NEXT_PUBLIC_BASE_URL',
  'RECOVERY_MODE',
  'RECOVERY_START_DATE',
  'RECOVERY_MIN_WEEKS',
  'RECOVERY_DAILY_LIMIT',
  'RECOVERY_REFRESH_LIMIT',
  'NORMAL_DAILY_LIMIT',
  'NORMAL_REFRESH_LIMIT',
  'BULK_REMEDIATION_BYPASS_QUOTA',
  'INDEXNOW_KEY',
  'INDEXNOW_HOST',
  'CLAUDE_LLM_API_KEY',
  'CLAUDE_LLM_BASE_URL',
  'CLAUDE_LLM_WEBHOOK_SECRET',
  'CLAUDE_LLM_TIMEOUT_MS',
];

const SECRET_KEYS = new Set([
  'HUMANIZE_OPENAI_API_KEY',
  'SERPAPI_KEY',
  'TAVILY_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'WP_AUTH_HEADER',
  'GOOGLE_CLIENT_SECRET',
  'CRON_SECRET',
  'INDEXNOW_KEY',
  'CLAUDE_LLM_API_KEY',
  'CLAUDE_LLM_WEBHOOK_SECRET',
]);

function stripQuotes(value) {
  return String(value).replace(/^["']|["']$/g, '').trim();
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const existing = await client.query('SELECT key FROM app_settings');
    const have = new Set(existing.rows.map((r) => r.key));

    const imported = [];
    const skipped = [];
    const missing = [];

    for (const key of DIRECT_KEYS) {
      const raw = process.env[key];
      const value = raw ? stripQuotes(raw) : '';

      if (!value) {
        missing.push(key);
        continue;
      }

      if (have.has(key) && !OVERWRITE) {
        skipped.push(key);
        continue;
      }

      if (!DRY_RUN) {
        await client.query(
          `INSERT INTO app_settings (key, value, is_secret, updated_at, updated_by)
           VALUES ($1, $2, $3, NOW(), 'import-env-script')
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value,
                 is_secret = EXCLUDED.is_secret,
                 updated_at = NOW(),
                 updated_by = EXCLUDED.updated_by`,
          [key, value, SECRET_KEYS.has(key)]
        );
      }
      imported.push(key);
    }

    console.log(`\n${DRY_RUN ? '[dry run] ' : ''}Imported ${imported.length} setting(s):`);
    imported.forEach((k) => console.log(`  + ${k}`));

    if (skipped.length) {
      console.log(`\nAlready in the database (use --overwrite to replace):`);
      skipped.forEach((k) => console.log(`  = ${k}`));
    }

    if (missing.length) {
      console.log(`\nNot set in the environment - add on /settings if needed:`);
      missing.forEach((k) => console.log(`  - ${k}`));
    }

    console.log('\nNote: AZURE_OPENAI_* and OPENAI_API_KEY are intentionally not imported.');
    console.log('Done.\n');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('❌ Import failed:', error.message);
  process.exit(1);
});
