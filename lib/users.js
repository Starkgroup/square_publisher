import bcrypt from 'bcrypt';
import { getDb } from '../db/index.js';

const SALT_ROUNDS = 10;

/**
 * Create a new user
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @param {string} role - User role (admin/editor)
 * @returns {number} User ID
 */
export async function createUser(email, password, role = 'editor') {
  const db = getDb();
  
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, role)
    VALUES (?, ?, ?)
  `).run(email, passwordHash, role);
  
  return result.lastInsertRowid;
}

/**
 * Verify user credentials
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @returns {object|null} User object if valid, null otherwise
 */
export async function verifyUser(email, password) {
  const db = getDb();
  
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (!user) {
    return null;
  }
  
  const valid = await bcrypt.compare(password, user.password_hash);
  
  if (!valid) {
    return null;
  }
  
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

/**
 * Update user's last login timestamp
 * @param {number} userId - User ID
 */
export function updateLastLogin(userId) {
  const db = getDb();
  
  db.prepare(`
    UPDATE users SET last_login_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);
}

/**
 * Get user by ID
 * @param {number} userId - User ID
 * @returns {object|null} User object
 */
export function getUserById(userId) {
  const db = getDb();
  
  const user = db.prepare('SELECT id, email, role, created_at, last_login_at FROM users WHERE id = ?').get(userId);
  
  return user || null;
}

/**
 * Initialize default admin user from env
 */
export async function initDefaultAdmin(adminUser, adminPass) {
  const db = getDb();
  
  // Check if admin exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminUser);
  
  if (!existing) {
    console.log('Creating default admin user...');
    await createUser(adminUser, adminPass, 'admin');
    console.log('✅ Default admin user created');
  }
}
