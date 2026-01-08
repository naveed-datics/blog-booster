-- Create trends table to store trending data
CREATE TABLE IF NOT EXISTS trends (
    id SERIAL PRIMARY KEY,
    search_query VARCHAR(255) NOT NULL,
    trend_text TEXT NOT NULL,
    celebrity_name VARCHAR(255),
    trend_value VARCHAR(100),
    url TEXT,
    website_result TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on search_query for faster lookups
CREATE INDEX IF NOT EXISTS idx_trends_search_query ON trends(search_query);

-- Create index on celebrity_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_trends_celebrity_name ON trends(celebrity_name);

-- Create index on created_at for date-based queries
CREATE INDEX IF NOT EXISTS idx_trends_created_at ON trends(created_at);

-- Create a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_trends_updated_at BEFORE UPDATE ON trends
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

