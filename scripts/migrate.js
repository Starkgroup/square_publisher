#!/usr/bin/env node

import config from '../config/index.js';
import { initDb } from '../db/index.js';
import { runMigrations, getMigrationStatus } from '../db/migrate.js';

console.log('🗄️  Database Migration Tool');
console.log(`Database: ${config.db.path}\n`);

// Initialize database
initDb(config.db.path);

const command = process.argv[2];

if (command === 'status') {
  const migrations = getMigrationStatus();
  
  if (migrations.length === 0) {
    console.log('No migrations applied yet.');
  } else {
    console.log('Applied migrations:');
    migrations.forEach(m => {
      console.log(`  ✅ ${m.name} (${new Date(m.applied_at).toISOString()})`);
    });
  }
} else {
  // Run migrations
  runMigrations();
}
