-- Add sitemap column to websites table
ALTER TABLE websites ADD COLUMN IF NOT EXISTS sitemap TEXT;

