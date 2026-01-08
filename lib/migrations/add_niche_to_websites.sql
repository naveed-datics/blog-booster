-- Add niche column to websites table
ALTER TABLE websites ADD COLUMN IF NOT EXISTS niche VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_websites_niche ON websites (niche);

