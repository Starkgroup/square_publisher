-- Create media table
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
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
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Create index on post_id for fast lookup
CREATE INDEX IF NOT EXISTS idx_media_post_id ON media(post_id);

-- Create index on sort_order for ordering
CREATE INDEX IF NOT EXISTS idx_media_sort_order ON media(post_id, sort_order);
