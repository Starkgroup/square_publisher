#!/usr/bin/env node

import readline from 'readline';
import config from '../config/index.js';
import { initDb, closeDb } from '../db/index.js';
import { createUser } from '../lib/users.js';

console.log('🌱 Seeding admin user');
console.log(`Database: ${config.db.path}`);

initDb(config.db.path);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

(async () => {
  try {
    const email = await ask('Admin email: ');
    const password = await ask('Admin password: ');

    if (!email || !password) {
      console.error('Email and password are required');
      process.exitCode = 1;
      rl.close();
      closeDb();
      return;
    }

    const id = await createUser(email.trim(), password, 'admin');
    console.log(`✅ Admin user created with id ${id}`);
  } catch (err) {
    console.error('❌ Failed to seed admin user:', err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    closeDb();
  }
})();
