import { getDb } from '../../db/index.js';
import { validateText, normalizeText, generateSummary, ValidationError } from '../../lib/validation.js';
import { logAudit } from '../../lib/audit.js';

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
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = 'SELECT id, slug, title, summary, status, pub_date, created_at, updated_at FROM posts';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), offset);

    const posts = db.prepare(query).all(...params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM posts';
    if (status) {
      countQuery += ' WHERE status = ?';
      const { total } = db.prepare(countQuery).get(status);
      var totalCount = total;
    } else {
      const { total } = db.prepare(countQuery).get();
      var totalCount = total;
    }

    const totalPages = Math.ceil(totalCount / parseInt(limit, 10));

    return reply.view('admin/posts.ejs', {
      posts,
      user: {
        email: request.session.email,
        role: request.session.role,
      },
      filters: {
        status: status || 'all',
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
