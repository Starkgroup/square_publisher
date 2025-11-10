-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  text TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,
  pub_date DATETIME,
  cover_media_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT,
  ext_id TEXT
);

-- Create index on slug for fast lookup
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

-- Create index on pub_date for RSS sorting
CREATE INDEX IF NOT EXISTS idx_posts_pub_date ON posts(pub_date DESC);
