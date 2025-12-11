import crypto from 'crypto';
import { getDb } from '../db/index.js';
import config from '../config/index.js';

/**
 * Generate a cryptographically secure token
 * @returns {string} 64-character hex token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a magic link token for a user
 * @param {number} userId - User ID
 * @param {string} ip - IP address of the request
 * @param {string} userAgent - User agent string
 * @returns {object} Created magic link record
 */
export function createMagicLink(userId, ip = null, userAgent = null) {
  const db = getDb();
  const token = generateToken();
  const ttlMinutes = config.magicLink.ttlMinutes;
  
  const result = db.prepare(`
    INSERT INTO magic_links (user_id, token, expires_at, ip_created, user_agent)
    VALUES (?, ?, datetime('now', '+' || ? || ' minutes'), ?, ?)
  `).run(userId, token, ttlMinutes, ip, userAgent);

  return {
    id: result.lastInsertRowid,
    token,
    expiresInMinutes: ttlMinutes,
  };
}

/**
 * Find and validate a magic link token
 * @param {string} token - Token to validate
 * @returns {object|null} Magic link record with user info if valid, null otherwise
 */
export function findValidMagicLink(token) {
  const db = getDb();

  const record = db.prepare(`
    SELECT 
      ml.id,
      ml.user_id,
      ml.token,
      ml.created_at,
      ml.expires_at,
      ml.used_at,
      u.email,
      u.role
    FROM magic_links ml
    JOIN users u ON u.id = ml.user_id
    WHERE ml.token = ?
  `).get(token);

  if (!record) {
    return null;
  }

  // Check if already used
  if (record.used_at) {
    return { error: 'already_used', record };
  }

  // Check if expired
  const now = new Date();
  const expiresAt = new Date(record.expires_at + 'Z');
  if (now > expiresAt) {
    return { error: 'expired', record };
  }

  return { valid: true, record };
}

/**
 * Mark a magic link as used
 * @param {number} linkId - Magic link ID
 */
export function markMagicLinkUsed(linkId) {
  const db = getDb();

  db.prepare(`
    UPDATE magic_links 
    SET used_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(linkId);
}

/**
 * Count recent magic links for rate limiting
 * @param {number} userId - User ID
 * @param {number} hoursBack - Hours to look back
 * @returns {number} Count of magic links created
 */
export function countRecentMagicLinks(userId, hoursBack = 1) {
  const db = getDb();

  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM magic_links
    WHERE user_id = ?
      AND created_at >= datetime('now', '-' || ? || ' hours')
  `).get(userId, hoursBack);

  return result?.count || 0;
}

/**
 * Check if user can request a new magic link (rate limiting)
 * @param {number} userId - User ID
 * @returns {boolean} True if user can request a new link
 */
export function canRequestMagicLink(userId) {
  const count = countRecentMagicLinks(userId, 1);
  return count < config.magicLink.maxPerHour;
}

/**
 * Clean up expired magic links (housekeeping)
 * @returns {number} Number of deleted records
 */
export function cleanupExpiredLinks() {
  const db = getDb();

  const result = db.prepare(`
    DELETE FROM magic_links
    WHERE expires_at < datetime('now', '-1 day')
  `).run();

  return result.changes;
}
