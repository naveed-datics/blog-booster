CREATE TABLE IF NOT EXISTS cron_run_logs (
    id SERIAL PRIMARY KEY,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    new_articles_count INTEGER DEFAULT 0,
    refreshed_articles_count INTEGER DEFAULT 0,
    trends_found_count INTEGER DEFAULT 0,
    summary JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cron_run_logs_website_id ON cron_run_logs(website_id);
CREATE INDEX IF NOT EXISTS idx_cron_run_logs_started_at ON cron_run_logs(started_at DESC);
