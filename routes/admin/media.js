import { getDb } from '../../db/index.js';
import { saveUpload, ALLOWED_MIME } from '../../lib/mediaStorage.js';

export default async function adminMediaRoutes(fastify) {
  // Upload media for a post
  fastify.post('/admin/posts/:id/media', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found', code: 'NOT_FOUND' });
    }

    const parts = request.parts();
    let saved = null;

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        saved = await saveUpload({
          file: part.file,
          filename: part.filename,
          mimetype: part.mimetype,
          limit: fastify.config.uploads.maxFileSize,
          uploadsDir: fastify.config.uploads.dir,
          baseUrl: fastify.config.server.baseUrl,
        });
        break;
      }
    }

    if (!saved) {
      return reply.status(400).send({ error: 'No file uploaded', code: 'NO_FILE' });
    }

    const result = db.prepare(`
      INSERT INTO media (post_id, kind, path, url, mime, size_bytes)
      VALUES (?, 'image', ?, ?, ?, ?)
    `).run(id, saved.path, saved.url, saved.mime, saved.size_bytes);

    const mediaId = result.lastInsertRowid;

    return reply.status(201).send({
      media_id: mediaId,
      url: saved.url,
      mime: saved.mime,
      size_bytes: saved.size_bytes,
      path: saved.path,
    });
  });

  // Update media metadata or set as cover
  fastify.patch('/admin/posts/:id/media/:mid', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id, mid } = request.params;
    const { alt, caption, sort_order, cover } = request.body || {};

    const media = db.prepare('SELECT * FROM media WHERE id = ? AND post_id = ?').get(mid, id);
    if (!media) {
      return reply.status(404).send({ error: 'Media not found', code: 'NOT_FOUND' });
    }

    const updates = [];
    const params = [];

    if (alt !== undefined) { updates.push('alt = ?'); params.push(String(alt)); }
    if (caption !== undefined) { updates.push('caption = ?'); params.push(String(caption)); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(parseInt(sort_order, 10) || 0); }

    if (updates.length > 0) {
      params.push(mid);
      db.prepare(`UPDATE media SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    if (cover === true || cover === 'true') {
      db.prepare('UPDATE posts SET cover_media_id = ? WHERE id = ?').run(mid, id);
    }

    return reply.send({ updated: true });
  });

  // Delete media
  fastify.delete('/admin/posts/:id/media/:mid', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id, mid } = request.params;

    const media = db.prepare('SELECT * FROM media WHERE id = ? AND post_id = ?').get(mid, id);
    if (!media) {
      return reply.status(404).send({ error: 'Media not found', code: 'NOT_FOUND' });
    }

    // If it is cover, unset on post
    const post = db.prepare('SELECT cover_media_id FROM posts WHERE id = ?').get(id);
    if (post?.cover_media_id === media.id) {
      db.prepare('UPDATE posts SET cover_media_id = NULL WHERE id = ?').run(id);
    }

    db.prepare('DELETE FROM media WHERE id = ?').run(mid);

    return reply.send({ deleted: true });
  });

  // Expose allowed mime types for UI
  fastify.get('/admin/media/mime', {
    onRequest: [fastify.requireAuth],
  }, async (_req, reply) => {
    return reply.send({ allowed: ALLOWED_MIME });
  });
}
