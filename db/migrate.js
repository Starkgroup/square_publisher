import { getDb } from './index.js';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function runMigrations() {
  const db = getDb();
  
  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationsDir = join(__dirname, 'migrations');
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration files`);

  for (const file of files) {
    const name = file.replace('.sql', '');
    
    // Check if migration already applied
    const existing = db.prepare('SELECT id FROM migrations WHERE name = ?').get(name);
    
    if (existing) {
      console.log(`⏭  Migration already applied: ${name}`);
      continue;
    }

    console.log(`🔄 Applying migration: ${name}`);
    
    try {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      
      // Run migration in transaction
      db.exec('BEGIN TRANSACTION');
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name);
      db.exec('COMMIT');
      
      console.log(`✅ Applied migration: ${name}`);
    } catch (err) {
      db.exec('ROLLBACK');
      console.error(`❌ Failed to apply migration ${name}:`, err.message);
      throw err;
    }
  }

  console.log('✅ All migrations completed');
}

export function getMigrationStatus() {
  const db = getDb();
  
  try {
    const applied = db.prepare('SELECT name, applied_at FROM migrations ORDER BY id').all();
    return applied;
  } catch (err) {
    return [];
  }
}
