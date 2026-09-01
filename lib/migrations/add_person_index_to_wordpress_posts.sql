-- Person page index columns for app-side lookup (no WP REST dependency).
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

-- Sitemap/trend imports may not have a WP post id yet.
ALTER TABLE wordpress_posts
ALTER COLUMN post_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wordpress_posts_normalized_name
ON wordpress_posts (website_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_wordpress_posts_slug
ON wordpress_posts (website_id, slug);

CREATE INDEX IF NOT EXISTS idx_wordpress_posts_canonical_slug
ON wordpress_posts (website_id, canonical_slug);

CREATE INDEX IF NOT EXISTS idx_wordpress_posts_wp_status
ON wordpress_posts (website_id, wp_status);

-- One active person page per website (excludes trashed rows).
CREATE UNIQUE INDEX IF NOT EXISTS idx_wordpress_posts_website_normalized_active
ON wordpress_posts (website_id, normalized_name)
WHERE wp_status IS DISTINCT FROM 'trash' AND normalized_name IS NOT NULL;
