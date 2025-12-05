import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { getDb } from '../../db/index.js';
import { generateImageWithTemplate, buildPrompt, generateTitle } from '../../lib/openai.js';
import { renderOverlay } from '../../lib/imageOverlay.js';

// Available tags for AI generation
const AVAILABLE_TAGS = [
  'Finance',
  'Technology',
  'Marketing',
  'Business',
  'Investment',
  'Economy',
  'Leadership',
  'Innovation',
  'Strategy',
  'General',
];

export default async function aiGenerateRoutes(fastify) {
  // Get available tags
  fastify.get('/admin/ai/tags', {
    onRequest: [fastify.requireAuth],
  }, async (_request, reply) => {
    return reply.send({ tags: AVAILABLE_TAGS });
  });

  // Get all template images
  fastify.get('/admin/ai/templates', {
    onRequest: [fastify.requireAuth],
  }, async (_request, reply) => {
    const db = getDb();
    const templates = db.prepare(`
      SELECT id, path, url, mime, size_bytes, alt, created_at
      FROM media
      WHERE is_template = 1
      ORDER BY created_at DESC
    `).all();
    return reply.send({ templates });
  });

  // Generate image with AI
  fastify.post('/admin/posts/:id/media/generate-ai', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id: postId } = request.params;
    const { templateId, title, tag, useRandomTemplate } = request.body || {};

    // Validate post exists
    const post = db.prepare('SELECT id, title FROM posts WHERE id = ?').get(postId);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found', code: 'NOT_FOUND' });
    }

    // Get template image
    let template;
    if (useRandomTemplate || !templateId) {
      // Get random template
      template = db.prepare(`
        SELECT id, path, url, mime
        FROM media
        WHERE is_template = 1
        ORDER BY RANDOM()
        LIMIT 1
      `).get();
    } else {
      template = db.prepare(`
        SELECT id, path, url, mime
        FROM media
        WHERE id = ? AND is_template = 1
      `).get(templateId);
    }

    if (!template) {
      return reply.status(400).send({
        error: 'No template images available. Please upload template images first.',
        code: 'NO_TEMPLATES',
      });
    }

    // Build prompt
    const finalTitle = title || post.title || 'Untitled Article';
    const finalTag = tag || 'General';
    const prompt = buildPrompt({ title: finalTitle, tag: finalTag });

    // Read template image from disk
    const uploadsDir = fastify.config.uploads.dir;
    const templatePath = join(uploadsDir, template.path);
    
    if (!existsSync(templatePath)) {
      return reply.status(500).send({
        error: 'Template image file not found on disk',
        code: 'TEMPLATE_FILE_MISSING',
      });
    }

    const imageBuffer = readFileSync(templatePath);

    try {
      // Generate image with OpenAI
      const generatedBuffer = await generateImageWithTemplate({
        imageBuffer,
        imageName: `template_${template.id}.png`,
        prompt,
      });

      // Save generated image to disk
      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const subdir = join(uploadsDir, year, month);
      
      if (!existsSync(subdir)) {
        mkdirSync(subdir, { recursive: true });
      }

      const fname = `ai_${randomUUID()}.png`;
      const absPath = join(subdir, fname);
      writeFileSync(absPath, generatedBuffer);

      const relPath = `/${year}/${month}/${fname}`;
      const url = `${fastify.config.server.baseUrl.replace(/\/$/, '')}/media${relPath}`;

      // Save to database
      const result = db.prepare(`
        INSERT INTO media (post_id, kind, path, url, mime, size_bytes, alt)
        VALUES (?, 'image', ?, ?, 'image/png', ?, ?)
      `).run(postId, relPath, url, generatedBuffer.length, `AI generated: ${finalTitle}`);

      const mediaId = result.lastInsertRowid;

      return reply.status(201).send({
        media_id: mediaId,
        url,
        mime: 'image/png',
        size_bytes: generatedBuffer.length,
        path: relPath,
        template_used: template.id,
        prompt_used: prompt,
      });
    } catch (err) {
      request.log.error({ err }, 'AI image generation failed');
      return reply.status(500).send({
        error: `AI generation failed: ${err.message}`,
        code: 'AI_GENERATION_FAILED',
      });
    }
  });

  // Generate cover: AI title + overlay on template
  fastify.post('/admin/posts/:id/media/generate-cover', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const db = getDb();
    const { id: postId } = request.params;
    const { templateId, tag, useRandomTemplate } = request.body || {};

    // Validate post exists and get its text
    const post = db.prepare('SELECT id, title, text FROM posts WHERE id = ?').get(postId);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found', code: 'NOT_FOUND' });
    }

    if (!post.text || post.text.trim().length === 0) {
      return reply.status(400).send({
        error: 'Post has no text content. Add article text first.',
        code: 'NO_TEXT_CONTENT',
      });
    }

    // Get template image
    let template;
    if (useRandomTemplate || !templateId) {
      template = db.prepare(`
        SELECT id, path, url, mime
        FROM media
        WHERE is_template = 1
        ORDER BY RANDOM()
        LIMIT 1
      `).get();
    } else {
      template = db.prepare(`
        SELECT id, path, url, mime
        FROM media
        WHERE id = ? AND is_template = 1
      `).get(templateId);
    }

    if (!template) {
      return reply.status(400).send({
        error: 'No template images available. Please upload template images first.',
        code: 'NO_TEMPLATES',
      });
    }

    // Read template image from disk
    const uploadsDir = fastify.config.uploads.dir;
    const templatePath = join(uploadsDir, template.path);
    
    if (!existsSync(templatePath)) {
      return reply.status(500).send({
        error: 'Template image file not found on disk',
        code: 'TEMPLATE_FILE_MISSING',
      });
    }

    const imageBuffer = readFileSync(templatePath);
    const finalTag = tag || 'General';

    try {
      // Step 1: Generate title using OpenAI chat/completions
      const generatedTitle = await generateTitle({
        description: post.text,
        tag: finalTag,
      });

      request.log.info({ generatedTitle, tag: finalTag }, 'Generated title for cover');

      // Step 2: Render overlay on template image
      const coverBuffer = await renderOverlay({
        imageBuffer,
        title: generatedTitle,
        tag: finalTag,
      });

      // Step 3: Save generated cover to disk
      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const subdir = join(uploadsDir, year, month);
      
      if (!existsSync(subdir)) {
        mkdirSync(subdir, { recursive: true });
      }

      const fname = `cover_${randomUUID()}.png`;
      const absPath = join(subdir, fname);
      writeFileSync(absPath, coverBuffer);

      const relPath = `/${year}/${month}/${fname}`;
      const url = `${fastify.config.server.baseUrl.replace(/\/$/, '')}/media${relPath}`;

      // Step 4: Save to database
      const result = db.prepare(`
        INSERT INTO media (post_id, kind, path, url, mime, size_bytes, alt)
        VALUES (?, 'image', ?, ?, 'image/png', ?, ?)
      `).run(postId, relPath, url, coverBuffer.length, `Cover: ${generatedTitle}`);

      const mediaId = result.lastInsertRowid;

      return reply.status(201).send({
        media_id: mediaId,
        url,
        mime: 'image/png',
        size_bytes: coverBuffer.length,
        path: relPath,
        template_used: template.id,
        generated_title: generatedTitle,
        tag: finalTag,
      });
    } catch (err) {
      request.log.error({ err }, 'Cover generation failed');
      return reply.status(500).send({
        error: `Cover generation failed: ${err.message}`,
        code: 'COVER_GENERATION_FAILED',
      });
    }
  });
}
