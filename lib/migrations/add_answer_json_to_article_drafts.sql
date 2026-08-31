-- Persists the extract-answer step's structured, sourced answer alongside
-- the saved draft, so a later publish retry (which reuses draft_html
-- without re-running write-blog) still has the data wp-create-post needs
-- for the natural title/meta, citations already baked into draft_html, and
-- JSON-LD schema.
ALTER TABLE article_drafts
ADD COLUMN IF NOT EXISTS answer_json JSONB;
