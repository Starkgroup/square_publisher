import { validateIngestRequest, generateSummary, ValidationError } from '../lib/validation.js';
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

      // Insert post
      const result = db.prepare(`
        INSERT INTO posts (slug, text, summary, status, source, ext_id)
        VALUES (?, ?, ?, 'draft', ?, ?)
      `).run(
        slug,
        validatedData.text,
        summary,
        validatedData.source,
        validatedData.ext_id
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
}
