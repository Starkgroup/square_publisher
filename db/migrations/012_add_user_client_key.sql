-- Add optional client_key column to users to map external automation clients
ALTER TABLE users ADD COLUMN client_key TEXT;
