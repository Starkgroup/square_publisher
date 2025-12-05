-- Allow NULL post_id for template images
-- SQLite requires table recreation to change column constraints

-- Step 1: Create new table with nullable post_id
CREATE TABLE media_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER,  -- Now nullable for templates
  kind TEXT NOT NULL DEFAULT 'image',
  path TEXT NOT NULL,
  url TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  alt TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_template INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Step 2: Copy existing data
INSERT INTO media_new (id, post_id, kind, path, url, mime, size_bytes, width, height, alt, caption, sort_order, is_template, created_at)
SELECT id, post_id, kind, path, url, mime, size_bytes, width, height, alt, caption, sort_order, is_template, created_at
FROM media;

-- Step 3: Drop old table
DROP TABLE media;

-- Step 4: Rename new table
ALTER TABLE media_new RENAME TO media;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_media_post_id ON media(post_id);
CREATE INDEX IF NOT EXISTS idx_media_sort_order ON media(post_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_media_is_template ON media(is_template);
