-- Add foreign key constraint for cover_media_id
-- Note: SQLite doesn't support ALTER TABLE ADD CONSTRAINT, 
-- so this is handled in application logic
-- This file documents the intended constraint for reference

-- Intended constraint (enforced in application):
-- FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL
