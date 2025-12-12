-- Add auto_publish_enabled flag to users table
ALTER TABLE users ADD COLUMN auto_publish_enabled INTEGER NOT NULL DEFAULT 0;

