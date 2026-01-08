-- Create wordpress_posts table to store WordPress post information
CREATE TABLE IF NOT EXISTS wordpress_posts (
    id SERIAL PRIMARY KEY,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    celebrity_name VARCHAR(255) NOT NULL,
    post_title TEXT NOT NULL,
    post_id INTEGER NOT NULL,
    post_url TEXT,
    image_url TEXT,
    content TEXT,
    slug VARCHAR(255),
    meta_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(website_id, celebrity_name, post_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_wordpress_posts_website_id ON wordpress_posts(website_id);
CREATE INDEX IF NOT EXISTS idx_wordpress_posts_celebrity_name ON wordpress_posts(celebrity_name);
CREATE INDEX IF NOT EXISTS idx_wordpress_posts_post_id ON wordpress_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_wordpress_posts_website_celebrity ON wordpress_posts(website_id, celebrity_name);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_wordpress_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on update
CREATE OR REPLACE TRIGGER update_wordpress_posts_updated_at
BEFORE UPDATE ON wordpress_posts
FOR EACH ROW
EXECUTE FUNCTION update_wordpress_posts_updated_at();



