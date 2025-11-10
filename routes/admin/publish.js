import { getDb } from '../../db/index.js';
import { logAudit } from '../../lib/audit.js';

export default async function adminPublishRoutes(fastify) {
  // Publish post: set status=published, set pub_date if not set
  fastify.post('/admin/posts/:id/publish', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const post = db.prepare('SELECT id, status, pub_date FROM posts WHERE id = ?').get(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found', code: 'NOT_FOUND' });
    }

    // Only change status; pub_date set if not already
    const now = new Date().toISOString();
    if (!post.pub_date) {
      db.prepare(`UPDATE posts SET status='published', pub_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(now, id);
    } else {
      db.prepare(`UPDATE posts SET status='published', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    }

    logAudit(id, request.session.email, 'post_published', { previous_status: post.status, pub_date_set: !post.pub_date });
    if (typeof fastify.rssInvalidate === 'function') fastify.rssInvalidate();

    return reply.send({ published: true, id, pub_date: post.pub_date || now });
  });

  // Unpublish post: set status=draft, keep pub_date unchanged
  fastify.post('/admin/posts/:id/unpublish', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const post = db.prepare('SELECT id, status, pub_date FROM posts WHERE id = ?').get(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found', code: 'NOT_FOUND' });
    }

    db.prepare(`UPDATE posts SET status='draft', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);

    logAudit(id, request.session.email, 'post_unpublished', { previous_status: post.status });
    if (typeof fastify.rssInvalidate === 'function') fastify.rssInvalidate();

    return reply.send({ unpublished: true, id, pub_date: post.pub_date });
  });
}
