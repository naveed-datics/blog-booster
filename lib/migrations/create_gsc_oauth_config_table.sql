CREATE TABLE IF NOT EXISTS gsc_oauth_config (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_gsc_oauth_config_updated_at ON gsc_oauth_config;
CREATE TRIGGER update_gsc_oauth_config_updated_at
BEFORE UPDATE ON gsc_oauth_config
FOR EACH ROW
EXECUTE FUNCTION update_gsc_tokens_updated_at();
