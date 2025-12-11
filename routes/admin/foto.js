import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../../db/index.js';
import { saveUpload, ALLOWED_MIME } from '../../lib/mediaStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const promptsDir = join(__dirname, '..', '..', 'prompts');
const defaultPromptPath = join(promptsDir, 'default.txt');

function normalizeTags(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const tags = raw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  if (tags.length === 0) return null;
  const joined = tags.join(',');
  return joined.length > 255 ? joined.slice(0, 255) : joined;
}

export default async function adminFotoRoutes(fastify) {
  // Foto page - list all template images
  fastify.get('/admin/foto', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const isAdmin = request.session.role === 'admin';
    const userId = request.session.userId;

    const where = [];
    const params = [];
    where.push('is_template = 1');
    if (!isAdmin) {
      where.push('owner_user_id = ?');
      params.push(userId);
    }

    const templates = db.prepare(`
      SELECT id, path, url, mime, size_bytes, alt, caption, tags, owner_user_id, created_at
      FROM media
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
    `).all(...params);

    return reply.view('admin/foto.ejs', {
      templates,
      user: {
        email: request.session.email,
        role: request.session.role,
      },
      success: request.query.success === '1',
      error: request.query.error || null,
    });
  });

  // Upload template image
  fastify.post('/admin/foto/upload', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const parts = request.parts();
    let saved = null;
    let alt = '';
    let tagsRaw = '';

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
      } else if (part.type === 'field' && part.fieldname === 'alt') {
        alt = part.value || '';
      } else if (part.type === 'field' && part.fieldname === 'tags') {
        tagsRaw = part.value || '';
      }
    }

    if (!saved) {
      return reply.redirect('/admin/foto?error=No+file+uploaded');
    }

    const tags = normalizeTags(tagsRaw);

    // Insert as template (post_id = NULL for templates, is_template = 1)
    db.prepare(`
      INSERT INTO media (post_id, owner_user_id, kind, path, url, mime, size_bytes, alt, tags, is_template)
      VALUES (NULL, ?, 'image', ?, ?, ?, ?, ?, ?, 1)
    `).run(request.session.userId, saved.path, saved.url, saved.mime, saved.size_bytes, alt, tags);

    return reply.redirect('/admin/foto?success=1');
  });

  // Delete template image
  fastify.post('/admin/foto/:id/delete', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const template = db.prepare('SELECT id, owner_user_id FROM media WHERE id = ? AND is_template = 1').get(id);
    if (!template) {
      return reply.redirect('/admin/foto?error=Template+not+found');
    }

    const isAdmin = request.session.role === 'admin';
    if (!isAdmin && template.owner_user_id !== request.session.userId) {
      return reply.redirect('/admin/foto?error=Not+allowed');
    }

    db.prepare('DELETE FROM media WHERE id = ?').run(id);

    return reply.redirect('/admin/foto?success=1');
  });

  // Update template alt text
  fastify.post('/admin/foto/:id/update', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params;
    const { alt, tags: tagsRaw } = request.body || {};

    const template = db.prepare('SELECT id, owner_user_id FROM media WHERE id = ? AND is_template = 1').get(id);
    if (!template) {
      return reply.redirect('/admin/foto?error=Template+not+found');
    }

    const isAdmin = request.session.role === 'admin';
    if (!isAdmin && template.owner_user_id !== request.session.userId) {
      return reply.redirect('/admin/foto?error=Not+allowed');
    }

    const tags = normalizeTags(tagsRaw);

    db.prepare('UPDATE media SET alt = ?, tags = ? WHERE id = ?').run(alt || '', tags, id);

    return reply.redirect('/admin/foto?success=1');
  });

  // Get current default prompt
  fastify.get('/admin/foto/prompt', {
    onRequest: [fastify.requireAuth],
  }, async (_request, reply) => {
    try {
      const content = readFileSync(defaultPromptPath, 'utf-8');
      return reply.send({ content });
    } catch (err) {
      request.log?.error?.({ err }, 'Failed to read prompt file');
      return reply.status(500).send({ error: 'Failed to read prompt file' });
    }
  });

  // Update default prompt
  fastify.post('/admin/foto/prompt', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const { content } = request.body || {};
    if (typeof content !== 'string') {
      return reply.status(400).send({ error: 'Invalid content' });
    }

    try {
      writeFileSync(defaultPromptPath, content, 'utf-8');
      return reply.send({ saved: true });
    } catch (err) {
      request.log?.error?.({ err }, 'Failed to write prompt file');
      return reply.status(500).send({ error: 'Failed to save prompt file' });
    }
  });
}
