import { getDb } from '../../db/index.js';
import { validateText, normalizeText, generateSummary, ValidationError } from '../../lib/validation.js';
import { logAudit } from '../../lib/audit.js';
import { getAutoPublishEnabled, getAllUsers } from '../../lib/users.js';

export default async function adminPostsRoutes(fastify) {
  /**
   * GET /admin/posts
   * List posts with filters and pagination
   */
  fastify.get('/admin/posts', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    
    const { status, page = 1, limit = 20 } = request.query;
    const statusFilter = status && status !== 'all' ? status : null;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = 'SELECT id, slug, title, summary, status, pub_date, created_at, updated_at FROM posts';
    const params = [];

    const isAdmin = request.session.role === 'admin';
    const clientKey = request.session.clientKey || null;

    const whereClauses = [];

    if (statusFilter) {
      whereClauses.push('status = ?');
      params.push(statusFilter);
    }

    // For non-admin users, restrict posts to their client_key (if set)
    if (!isAdmin && clientKey) {
      whereClauses.push('client_key = ?');
      params.push(clientKey);
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), offset);

    const posts = db.prepare(query).all(...params);

    // Get total count (with same filters)
    let countQuery = 'SELECT COUNT(*) as total FROM posts';
    const countParams = [];

    if (whereClauses.length > 0) {
      countQuery += ' WHERE ' + whereClauses.join(' AND ');
      if (statusFilter) {
        countParams.push(statusFilter);
      }
      if (!isAdmin && clientKey) {
        countParams.push(clientKey);
      }
    }

    const { total: totalCount } = db.prepare(countQuery).get(...countParams);

    const totalPages = Math.ceil(totalCount / parseInt(limit, 10));

    // Get auto-publish status for current user
    const autoPublishEnabled = getAutoPublishEnabled(request.session.userId);

    const usersForAutoPublish = isAdmin
      ? getAllUsers().filter(u => u.role === 'editor')
      : [];

    return reply.view('admin/posts.ejs', {
      posts,
      user: {
        email: request.session.email,
        role: request.session.role,
        userId: request.session.userId,
      },
      autoPublishEnabled,
      usersForAutoPublish,
      filters: {
        status: statusFilter || 'all',
      },
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: totalCount,
        totalPages,
      },
    });
  });

  /**
   * GET /admin/posts/:id
   * Show edit form for a post
   */
  fastify.get('/admin/posts/:id', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);

    if (!post) {
      return reply.status(404).send({ error: 'Post not found', code: 'NOT_FOUND' });
    }

    // Get media for this post
    const media = db.prepare('SELECT * FROM media WHERE post_id = ? ORDER BY sort_order, created_at').all(id);

    return reply.view('admin/post-edit.ejs', {
      post,
      media,
      user: {
        email: request.session.email,
        role: request.session.role,
      },
      success: request.query.success,
      error: request.query.error,
    });
  });

  /**
   * PATCH /admin/posts/:id
   * Update post fields
   */
  fastify.patch('/admin/posts/:id', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params;
    const { title, text, tag, link } = request.body;

    try {
      const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);

      if (!post) {
        return reply.status(404).send({ error: 'Post not found', code: 'NOT_FOUND' });
      }

      const updates = {};
      const params = [];

      // Update title (optional)
      if (title !== undefined) {
        const trimmedTitle = title.trim();
        if (trimmedTitle.length > 0 && trimmedTitle.length <= 200) {
          updates.title = '?';
          params.push(trimmedTitle);
        }
      }

      // Update text (required if provided)
      if (text !== undefined) {
        const validatedText = validateText(text, fastify.config.limits.maxTextLength);
        const normalizedText = normalizeText(validatedText);
        updates.text = '?';
        params.push(normalizedText);
        
        // Regenerate summary
        updates.summary = '?';
        params.push(generateSummary(normalizedText));
      }

      // Update tag (optional)
      if (tag !== undefined) {
        const trimmedTag = typeof tag === 'string' ? tag.trim() : '';
        if (trimmedTag.length === 0) {
          updates.tag = 'NULL';
        } else {
          updates.tag = '?';
          params.push(trimmedTag);
        }
      }

      if (link !== undefined) {
        const trimmedLink = typeof link === 'string' ? link.trim() : '';
        if (trimmedLink.length === 0) {
          updates.link = 'NULL';
        } else {
          updates.link = '?';
          params.push(trimmedLink);
        }
      }

      // Increment version
      updates.version = 'version + 1';
      updates.updated_at = 'CURRENT_TIMESTAMP';

      if (Object.keys(updates).length === 2) {
        // Only version and updated_at, no real changes
        return reply.send({ id, updated: false });
      }

      const setClauses = Object.entries(updates).map(([key, value]) => `${key} = ${value}`).join(', ');
      params.push(id);

      db.prepare(`UPDATE posts SET ${setClauses} WHERE id = ?`).run(...params);

      // Log audit
      logAudit(id, request.session.email, 'post_updated', {
        fields: Object.keys(updates).filter(k => k !== 'version' && k !== 'updated_at'),
      });

      fastify.log.info({
        post_id: id,
        user: request.session.email,
        trace_id: request.id,
      }, 'Post updated');

      return reply.send({ id, updated: true });

    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }
      throw err;
    }
  });
}
