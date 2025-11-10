-- Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
);

-- Create index on post_id for filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_post_id ON audit_log(post_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- Create index on action for filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
