-- Add website_id column to trends table to associate trends with websites
ALTER TABLE trends 
ADD COLUMN IF NOT EXISTS website_id INTEGER REFERENCES websites(id) ON DELETE SET NULL;

-- Create index on website_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_trends_website_id ON trends(website_id);

-- Create index on website_id and created_at for date-based queries per website
CREATE INDEX IF NOT EXISTS idx_trends_website_id_created_at ON trends(website_id, created_at);







