import { getDb } from '../db/index.js';

/**
 * Log an audit event
 * @param {number|null} postId - Post ID (optional)
 * @param {string} actor - Who performed the action
 * @param {string} action - Action type
 * @param {object|null} payload - Additional data
 */
export function logAudit(postId, actor, action, payload = null) {
  const db = getDb();
  
  const payloadJson = payload ? JSON.stringify(payload) : null;
  
  db.prepare(`
    INSERT INTO audit_log (post_id, actor, action, payload)
    VALUES (?, ?, ?, ?)
  `).run(postId, actor, action, payloadJson);
}

/**
 * Get audit log entries
 * @param {object} filters - Filter options
 * @returns {Array} Audit log entries
 */
export function getAuditLog(filters = {}) {
  const db = getDb();
  
  const { postId, action, limit = 100, offset = 0 } = filters;
  
  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];
  
  if (postId) {
    query += ' AND post_id = ?';
    params.push(postId);
  }
  
  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return db.prepare(query).all(...params);
}
