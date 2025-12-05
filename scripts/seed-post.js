#!/usr/bin/env node

import config from '../config/index.js';
import { initDb, closeDb } from '../db/index.js';

console.log('🌱 Seeding test post');
console.log(`Database: ${config.db.path}`);

const db = initDb(config.db.path);

try {
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO posts (slug, title, text, summary, status, version, pub_date, source, ext_id, tag, link)
    VALUES (@slug, @title, @text, @summary, @status, @version, @pub_date, @source, @ext_id, @tag, @link)
  `).run({
    slug: 'test-post',
    title: 'Test Post',
    text: 'This is a seeded test post for Square Publisher.',
    summary: 'Seeded test post for Square Publisher.',
    status: 'draft',
    version: 1,
    pub_date: null,
    source: 'seed',
    ext_id: null,
    tag: null,
    link: null,
  });

  console.log(`✅ Inserted test post with id ${result.lastInsertRowid}`);
} catch (err) {
  console.error('❌ Failed to seed test post:', err.message);
  process.exitCode = 1;
} finally {
  closeDb();
}
