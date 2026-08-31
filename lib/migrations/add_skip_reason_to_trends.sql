-- Marks a trend as intentionally skipped (topic-gated out, or no sourced
-- public answer found) so it is excluded from the processing queue without
-- being confused with an already-published trend (which uses `url`).
ALTER TABLE trends
ADD COLUMN IF NOT EXISTS skip_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_trends_skip_reason ON trends(skip_reason);
