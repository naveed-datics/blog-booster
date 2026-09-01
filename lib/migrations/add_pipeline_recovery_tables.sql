-- Pipeline recovery: duplicate tracking, review queue, settings, trend routing.

CREATE TABLE IF NOT EXISTS duplicate_pairs (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  canonical_post_id INTEGER,
  duplicate_post_id INTEGER NOT NULL,
  canonical_slug VARCHAR(255),
  duplicate_slug VARCHAR(255),
  normalized_name VARCHAR(255),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  consolidated_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (website_id, duplicate_post_id)
);

CREATE INDEX IF NOT EXISTS idx_duplicate_pairs_website
  ON duplicate_pairs (website_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_pairs_unconsolidated
  ON duplicate_pairs (website_id) WHERE consolidated_at IS NULL;

CREATE TABLE IF NOT EXISTS pipeline_settings (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  setting_key VARCHAR(128) NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (website_id, setting_key)
);

CREATE TABLE IF NOT EXISTS review_queue (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  trend_id INTEGER REFERENCES trends(id) ON DELETE SET NULL,
  celebrity_name VARCHAR(255) NOT NULL,
  failed_gate VARCHAR(64) NOT NULL,
  gate_detail JSONB DEFAULT '{}',
  spike_tier VARCHAR(16),
  proposed_action VARCHAR(32),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_review_queue_pending
  ON review_queue (website_id, status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS url_ping_log (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  post_url TEXT NOT NULL,
  ping_type VARCHAR(32) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_url_ping_log_dedupe
  ON url_ping_log (post_url, ping_type, created_at DESC);

ALTER TABLE trends
  ADD COLUMN IF NOT EXISTS pipeline_action VARCHAR(32);

ALTER TABLE trends
  ADD COLUMN IF NOT EXISTS gate_evidence JSONB;

ALTER TABLE wordpress_posts
  ADD COLUMN IF NOT EXISTS disambiguation_key VARCHAR(64);

-- Prerequisite columns from person-index migration (safe if already applied).
ALTER TABLE wordpress_posts
  ADD COLUMN IF NOT EXISTS wp_status VARCHAR(32);

ALTER TABLE wordpress_posts
  ADD COLUMN IF NOT EXISTS last_reviewed DATE;

ALTER TABLE wordpress_posts
  ADD COLUMN IF NOT EXISTS content_quality VARCHAR(32);

ALTER TABLE wordpress_posts
  ADD COLUMN IF NOT EXISTS canonical_slug VARCHAR(255);

ALTER TABLE wordpress_posts
  ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(255);

-- Allow multiple WP posts per person until consolidated (unique by post_id instead).
DROP INDEX IF EXISTS idx_wordpress_posts_website_normalized_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wordpress_posts_website_post_id
  ON wordpress_posts (website_id, post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wordpress_posts_normalized_active
  ON wordpress_posts (website_id, normalized_name)
  WHERE wp_status IS DISTINCT FROM 'trash' AND normalized_name IS NOT NULL;
