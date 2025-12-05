#!/usr/bin/env node

import { unlinkSync, existsSync } from 'fs';
import config from '../config/index.js';
import { initDb, closeDb } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';

console.log('🧹 Reset database');
console.log(`Database file: ${config.db.path}`);

// Close existing connection if any
closeDb();

// Remove existing DB file if it exists
if (existsSync(config.db.path)) {
  console.log('Removing existing database file...');
  unlinkSync(config.db.path);
}

// Initialize new database and run migrations
initDb(config.db.path);
runMigrations();

console.log('✅ Database reset and migrations applied');
