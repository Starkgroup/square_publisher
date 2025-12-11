-- Add optional client_key column to posts for mapping external clients/users
ALTER TABLE posts ADD COLUMN client_key TEXT;
