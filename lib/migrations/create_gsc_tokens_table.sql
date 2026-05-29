CREATE TABLE IF NOT EXISTS gsc_tokens (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    scope TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gsc_inspection_cache (
    id SERIAL PRIMARY KEY,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    result JSONB NOT NULL,
    inspected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(website_id, url)
);

CREATE INDEX IF NOT EXISTS idx_gsc_inspection_cache_website_id ON gsc_inspection_cache (website_id);
CREATE INDEX IF NOT EXISTS idx_gsc_inspection_cache_inspected_at ON gsc_inspection_cache (inspected_at);

CREATE OR REPLACE FUNCTION update_gsc_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_gsc_tokens_updated_at ON gsc_tokens;
CREATE TRIGGER update_gsc_tokens_updated_at
BEFORE UPDATE ON gsc_tokens
FOR EACH ROW
EXECUTE FUNCTION update_gsc_tokens_updated_at();
