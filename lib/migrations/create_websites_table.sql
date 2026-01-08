CREATE TABLE IF NOT EXISTS websites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    website_url VARCHAR(500) NOT NULL,
    api_key VARCHAR(255),
    website_name VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, website_url)
);

CREATE INDEX IF NOT EXISTS idx_websites_user_id ON websites (user_id);
CREATE INDEX IF NOT EXISTS idx_websites_user_id_active ON websites (user_id, is_active);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_websites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on update
CREATE OR REPLACE TRIGGER update_websites_updated_at
BEFORE UPDATE ON websites
FOR EACH ROW
EXECUTE FUNCTION update_websites_updated_at();

