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
export async function createUser(email, password, role = 'editor', client_key = null) {
  const db = getDb();
  
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, role, client_key)
    VALUES (?, ?, ?, ?)
  `).run(email, passwordHash, role, client_key || null);
  
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
    client_key: user.client_key || null,
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
  
  const user = db.prepare('SELECT id, email, role, client_key, created_at, last_login_at FROM users WHERE id = ?').get(userId);
  
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

/**
 * Get user by email
 * @param {string} email - User email
 * @returns {object|null} User object
 */
export function getUserByEmail(email) {
  const db = getDb();
  
  const user = db.prepare('SELECT id, email, role, client_key, created_at, last_login_at FROM users WHERE email = ?').get(email);
  
  return user || null;
}

/**
 * Get all users
 * @returns {Array} List of users
 */
export function getAllUsers() {
  const db = getDb();
  
  return db.prepare(`
    SELECT id, email, role, client_key, created_at, last_login_at 
    FROM users 
    ORDER BY created_at DESC
  `).all();
}

/**
 * Update user details
 * @param {number} userId - User ID
 * @param {object} data - Fields to update
 * @param {string} [data.email] - New email
 * @param {string} [data.role] - New role
 * @returns {boolean} True if updated
 */
export function updateUser(userId, { email, role, client_key }) {
  const db = getDb();
  
  const fields = [];
  const values = [];
  
  if (email !== undefined) {
    fields.push('email = ?');
    values.push(email);
  }
  
  if (role !== undefined) {
    fields.push('role = ?');
    values.push(role);
  }
  
  if (client_key !== undefined) {
    fields.push('client_key = ?');
    values.push(client_key || null);
  }
  
  if (fields.length === 0) {
    return false;
  }
  
  values.push(userId);
  
  const result = db.prepare(`
    UPDATE users SET ${fields.join(', ')} WHERE id = ?
  `).run(...values);
  
  return result.changes > 0;
}

/**
 * Update user password
 * @param {number} userId - User ID
 * @param {string} newPassword - New plain text password
 * @returns {Promise<boolean>} True if updated
 */
export async function updateUserPassword(userId, newPassword) {
  const db = getDb();
  
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  
  const result = db.prepare(`
    UPDATE users SET password_hash = ? WHERE id = ?
  `).run(passwordHash, userId);
  
  return result.changes > 0;
}

/**
 * Delete user
 * @param {number} userId - User ID
 * @returns {boolean} True if deleted
 */
export function deleteUser(userId) {
  const db = getDb();
  
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  
  return result.changes > 0;
}

/**
 * Check if email is already taken (excluding a specific user)
 * @param {string} email - Email to check
 * @param {number} [excludeUserId] - User ID to exclude from check
 * @returns {boolean} True if email exists
 */
export function emailExists(email, excludeUserId = null) {
  const db = getDb();
  
  let query = 'SELECT id FROM users WHERE email = ?';
  const params = [email];
  
  if (excludeUserId) {
    query += ' AND id != ?';
    params.push(excludeUserId);
  }
  
  const result = db.prepare(query).get(...params);
  return !!result;
}
