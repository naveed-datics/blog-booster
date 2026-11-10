-- Outbound-shareable API keys: let other projects call this app's pipeline
-- endpoints without a browser session.
--
-- Only a SHA-256 hash of the key is stored. The plaintext is shown once at
-- creation and is unrecoverable afterwards, so a database leak does not hand
-- over working credentials.
CREATE TABLE IF NOT EXISTS api_keys (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  -- SHA-256 hex of the full key. Unique so the same key cannot be registered twice.
  key_hash    CHAR(64) NOT NULL UNIQUE,
  -- Non-secret display prefix, e.g. "bb_live_a1b2c3d4", for identifying a key in the UI.
  key_prefix  VARCHAR(32) NOT NULL,
  created_by  VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  -- Soft revoke: keeps the audit trail instead of deleting the row.
  revoked_at  TIMESTAMPTZ
);

-- Every authenticated request looks a key up by hash, so this index is the hot path.
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_created_at ON api_keys (created_at DESC);
