import { getDb } from '../../db/index.js';

export default async function adminAuditRoutes(fastify) {
  // Get audit log with pagination and filters
  fastify.get('/admin/audit', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { page = 1, limit = 50, action, user_email, post_id } = request.query;
    
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const limitInt = parseInt(limit, 10);

    let whereClause = '1=1';
    const params = [];

    if (action) {
      whereClause += ' AND action = ?';
      params.push(action);
    }
    if (user_email) {
      whereClause += ' AND user_email LIKE ?';
      params.push(`%${user_email}%`);
    }
    if (post_id) {
      whereClause += ' AND post_id = ?';
      params.push(parseInt(post_id, 10));
    }

    const logs = db.prepare(`
      SELECT * FROM audit_log
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitInt, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM audit_log
      WHERE ${whereClause}
    `).get(...params);

    return reply.view('admin/audit.ejs', {
      logs,
      total: total.count,
      page: parseInt(page, 10),
      limit: limitInt,
      filters: { action, user_email, post_id },
      user: { email: request.session.email },
    });
  });

  // Get audit log as JSON (for API access)
  fastify.get('/admin/api/audit', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { page = 1, limit = 50, action, user_email, post_id } = request.query;
    
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const limitInt = parseInt(limit, 10);

    let whereClause = '1=1';
    const params = [];

    if (action) {
      whereClause += ' AND action = ?';
      params.push(action);
    }
    if (user_email) {
      whereClause += ' AND user_email LIKE ?';
      params.push(`%${user_email}%`);
    }
    if (post_id) {
      whereClause += ' AND post_id = ?';
      params.push(parseInt(post_id, 10));
    }

    const logs = db.prepare(`
      SELECT * FROM audit_log
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitInt, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM audit_log
      WHERE ${whereClause}
    `).get(...params);

    return reply.send({
      logs,
      total: total.count,
      page: parseInt(page, 10),
      limit: limitInt,
      hasMore: offset + logs.length < total.count,
    });
  });
}
