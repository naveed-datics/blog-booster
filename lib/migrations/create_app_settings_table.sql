-- Central key/value store for runtime configuration that used to live in
-- .env.local. Managed through the /settings page so keys can be rotated
-- without a redeploy.
--
-- Bootstrap values (DATABASE_URL, AUTH_SECRET/NEXTAUTH_SECRET, NEXTAUTH_URL)
-- are deliberately NOT stored here: this table lives inside the database
-- DATABASE_URL points at, and NextAuth reads its secret at module load
-- before any query can run. Those stay in the environment.
CREATE TABLE IF NOT EXISTS app_settings (
  key         VARCHAR(128) PRIMARY KEY,
  value       TEXT,
  -- Secrets are masked in API responses; non-secret config is returned in
  -- full so the settings UI can show the current value.
  is_secret   BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at
  ON app_settings (updated_at DESC);
