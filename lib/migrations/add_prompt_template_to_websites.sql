-- Add prompt_template column to websites table
ALTER TABLE websites ADD COLUMN IF NOT EXISTS prompt_template TEXT;

