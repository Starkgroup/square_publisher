import { validateIngestRequest, generateSummary, ValidationError, validateRssToLinkedInRequest, buildLinkedInText } from '../lib/validation.js';
import { generateUniqueSlug } from '../lib/slugify.js';
import { getDb } from '../db/index.js';

export default async function ingestRoutes(fastify) {
  /**
   * POST /ingest/text
   * Ingest text content and create draft post
   */
  fastify.post('/ingest/text', {
    onRequest: [fastify.verifyIngestToken],
  }, async (request, reply) => {
    const db = getDb();

    try {
      // Validate request
      const validatedData = validateIngestRequest(
        request.body,
        fastify.config.limits.maxTextLength
      );

      // Generate unique slug
      const checkSlugExists = async (slug) => {
        const existing = db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
        return !!existing;
      };

      const slug = await generateUniqueSlug(validatedData.text, checkSlugExists);
      const summary = generateSummary(validatedData.text);

      const result = db.prepare(`
        INSERT INTO posts (slug, text, summary, status, source, ext_id, tag, link, client_key)
        VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)
      `).run(
        slug,
        validatedData.text,
        summary,
        validatedData.source,
        validatedData.ext_id,
        validatedData.tag,
        validatedData.link,
        validatedData.client_key
      );

      const postId = result.lastInsertRowid;

      fastify.log.info({
        post_id: postId,
        slug,
        source: validatedData.source,
        ext_id: validatedData.ext_id,
        trace_id: request.id,
      }, 'Post ingested successfully');

      return reply.status(201).send({
        id: postId,
        slug,
        status: 'draft',
        edit_url: `${fastify.config.server.baseUrl}/admin/posts/${postId}`,
      });

    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
          details: err.details,
        });
      }
      throw err;
    }
  });

  /**
   * POST /ingest/rss-to-linkedin
   * Accept RSS item fields and return LinkedIn-ready text and media hint
   */
  fastify.post('/ingest/rss-to-linkedin', {
    onRequest: [fastify.verifyIngestToken],
  }, async (request, reply) => {
    try {
      const data = validateRssToLinkedInRequest(request.body);
      const text = buildLinkedInText({ title: data.title, link: data.link, summary: data.summary });

      return reply.status(200).send({
        text,
        image_url: data.image_url || null,
        guid: data.guid || null,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
          details: err.details,
        });
      }
      throw err;
    }
  });
}
