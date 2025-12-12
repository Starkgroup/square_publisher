import { getDb, initDb } from './db/index.js';
import config from './config/index.js';

initDb(config.db.path);
const db = getDb();

const users = db.prepare('SELECT id, email, role, password_hash FROM users').all();
console.log('Users found:', users.length);
users.forEach(u => {
    console.log(`- ${u.id}: ${u.email} (${u.role})`);
});
