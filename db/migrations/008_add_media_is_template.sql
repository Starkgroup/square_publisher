-- Add is_template flag to media table for template images
-- Template images are used as base for AI image generation

ALTER TABLE media ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0;

-- Allow template images to have NULL post_id (they are not tied to a specific post)
-- SQLite doesn't support ALTER COLUMN, so we need to work around this
-- For now, templates will have post_id = 0 as a convention

-- Create index for fast template lookup
CREATE INDEX IF NOT EXISTS idx_media_is_template ON media(is_template);
