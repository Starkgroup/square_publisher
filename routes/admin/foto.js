import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../../db/index.js';
import { saveUpload, ALLOWED_MIME } from '../../lib/mediaStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const promptsDir = join(__dirname, '..', '..', 'prompts');
const defaultPromptPath = join(promptsDir, 'default.txt');

export default async function adminFotoRoutes(fastify) {
  // Foto page - list all template images
  fastify.get('/admin/foto', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const templates = db.prepare(`
      SELECT id, path, url, mime, size_bytes, alt, caption, created_at
      FROM media
      WHERE is_template = 1
      ORDER BY created_at DESC
    `).all();

    return reply.view('admin/foto.ejs', {
      templates,
      user: { email: request.session.userEmail },
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
      }
    }

    if (!saved) {
      return reply.redirect('/admin/foto?error=No+file+uploaded');
    }

    // Insert as template (post_id = NULL for templates, is_template = 1)
    db.prepare(`
      INSERT INTO media (post_id, kind, path, url, mime, size_bytes, alt, is_template)
      VALUES (NULL, 'image', ?, ?, ?, ?, ?, 1)
    `).run(saved.path, saved.url, saved.mime, saved.size_bytes, alt);

    return reply.redirect('/admin/foto?success=1');
  });

  // Delete template image
  fastify.post('/admin/foto/:id/delete', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const template = db.prepare('SELECT id FROM media WHERE id = ? AND is_template = 1').get(id);
    if (!template) {
      return reply.redirect('/admin/foto?error=Template+not+found');
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
    const { alt } = request.body || {};

    const template = db.prepare('SELECT id FROM media WHERE id = ? AND is_template = 1').get(id);
    if (!template) {
      return reply.redirect('/admin/foto?error=Template+not+found');
    }

    db.prepare('UPDATE media SET alt = ? WHERE id = ?').run(alt || '', id);

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
