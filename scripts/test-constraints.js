#!/usr/bin/env node

import config from '../config/index.js';
import { initDb, getDb } from '../db/index.js';

console.log('🧪 Testing database constraints\n');

initDb(config.db.path);
const db = getDb();

// Test 1: Unique slug constraint
console.log('Test 1: Unique slug constraint');
try {
  db.prepare('INSERT INTO posts (slug, text) VALUES (?, ?)').run('test-slug', 'First post');
  console.log('  ✅ First insert succeeded');
  
  try {
    db.prepare('INSERT INTO posts (slug, text) VALUES (?, ?)').run('test-slug', 'Second post');
    console.log('  ❌ FAILED: Duplicate slug was allowed');
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      console.log('  ✅ Duplicate slug rejected correctly');
    } else {
      console.log('  ❌ FAILED: Wrong error:', err.message);
    }
  }
} catch (err) {
  console.log('  ❌ FAILED:', err.message);
}

// Test 2: Foreign key constraint for media.post_id
console.log('\nTest 2: Foreign key constraint (media.post_id)');
try {
  db.prepare('INSERT INTO media (post_id, path, url, mime, size_bytes) VALUES (?, ?, ?, ?, ?)')
    .run(99999, '/fake/path', 'http://example.com/fake', 'image/jpeg', 1000);
  console.log('  ❌ FAILED: Orphan media was allowed');
} catch (err) {
  if (err.message.includes('FOREIGN KEY')) {
    console.log('  ✅ Orphan media rejected correctly');
  } else {
    console.log('  ❌ FAILED: Wrong error:', err.message);
  }
}

// Test 3: Cascade delete
console.log('\nTest 3: Cascade delete (deleting post deletes media)');
try {
  const post = db.prepare('INSERT INTO posts (slug, text) VALUES (?, ?)').run('cascade-test', 'Test post');
  const postId = post.lastInsertRowid;
  
  db.prepare('INSERT INTO media (post_id, path, url, mime, size_bytes) VALUES (?, ?, ?, ?, ?)')
    .run(postId, '/test/path', 'http://example.com/test', 'image/jpeg', 1000);
  
  const mediaCountBefore = db.prepare('SELECT COUNT(*) as count FROM media WHERE post_id = ?').get(postId).count;
  console.log(`  ℹ️  Media count before delete: ${mediaCountBefore}`);
  
  db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
  
  const mediaCountAfter = db.prepare('SELECT COUNT(*) as count FROM media WHERE post_id = ?').get(postId).count;
  console.log(`  ℹ️  Media count after delete: ${mediaCountAfter}`);
  
  if (mediaCountAfter === 0) {
    console.log('  ✅ Cascade delete works correctly');
  } else {
    console.log('  ❌ FAILED: Media was not deleted');
  }
} catch (err) {
  console.log('  ❌ FAILED:', err.message);
}

console.log('\n✅ All constraint tests completed');
