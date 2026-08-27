-- Drafts saved after article generation so WordPress publish can retry
-- without re-running image search, sources, write-blog, or humanize.
CREATE TABLE IF NOT EXISTS article_drafts (
    id SERIAL PRIMARY KEY,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    trend_id INTEGER REFERENCES trends(id) ON DELETE SET NULL,
    celebrity_name TEXT NOT NULL,
    draft_html TEXT NOT NULL,
    draft_title TEXT,
    image_url TEXT,
    pipeline_status VARCHAR(32) NOT NULL DEFAULT 'draft_ready',
    last_error TEXT,
    retry_after TIMESTAMP WITH TIME ZONE,
    publish_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, celebrity_name)
);

CREATE INDEX IF NOT EXISTS idx_article_drafts_status_retry
    ON article_drafts (pipeline_status, retry_after);

CREATE INDEX IF NOT EXISTS idx_article_drafts_website
    ON article_drafts (website_id);
