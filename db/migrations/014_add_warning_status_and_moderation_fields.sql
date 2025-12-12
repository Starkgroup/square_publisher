-- Add 'warning' status and moderation fields to posts table
-- SQLite requires table recreation to modify CHECK constraint

-- Step 1: Create new table with updated schema
CREATE TABLE posts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  text TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived', 'warning')),
  version INTEGER NOT NULL DEFAULT 1,
  pub_date DATETIME,
  cover_media_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT,
  ext_id TEXT,
  tag TEXT,
  link TEXT,
  client_key TEXT,
  -- New moderation/auto-publish fields
  publish_at DATETIME,
  moderation_checked_at DATETIME,
  moderation_reason TEXT
);

-- Step 2: Copy data from old table
INSERT INTO posts_new (
  id, slug, title, text, summary, status, version, pub_date, cover_media_id,
  created_at, updated_at, source, ext_id, tag, link, client_key
)
SELECT 
  id, slug, title, text, summary, status, version, pub_date, cover_media_id,
  created_at, updated_at, source, ext_id, tag, link, client_key
FROM posts;

-- Step 3: Drop old table
DROP TABLE posts;

-- Step 4: Rename new table
ALTER TABLE posts_new RENAME TO posts;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_pub_date ON posts(pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_posts_client_key ON posts(client_key);
CREATE INDEX IF NOT EXISTS idx_posts_publish_at ON posts(publish_at);

