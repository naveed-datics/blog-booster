-- Stores the extracted, sourced religion answer for a published post so
-- internal linking can target topically related people (same faith)
-- instead of a fully random sample of recent posts.
ALTER TABLE wordpress_posts
ADD COLUMN IF NOT EXISTS religion VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_wordpress_posts_religion ON wordpress_posts(website_id, religion);
