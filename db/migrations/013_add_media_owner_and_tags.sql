-- Add owner_user_id to media to bind templates to a specific user
ALTER TABLE media ADD COLUMN owner_user_id INTEGER REFERENCES users(id);

-- Add tags field (comma-separated string) for media
ALTER TABLE media ADD COLUMN tags TEXT;

-- Index for owner lookup
CREATE INDEX IF NOT EXISTS idx_media_owner_user_id ON media(owner_user_id);
