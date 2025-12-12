import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../../db/index.js';
import { 
  getAutoPublishEnabled, 
  setAutoPublishEnabled, 
  getUserById 
} from '../../lib/users.js';
import { logAudit } from '../../lib/audit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const promptsDir = join(__dirname, '..', '..', 'prompts');

export default async function autoPublishRoutes(fastify) {
  /**
   * GET /admin/auto-publish/status
   * Get current user's auto-publish status
   */
  fastify.get('/admin/auto-publish/status', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const enabled = getAutoPublishEnabled(request.session.userId);
    return reply.send({ enabled });
  });

  /**
   * POST /admin/auto-publish/toggle
   * Toggle current user's auto-publish status
   */
  fastify.post('/admin/auto-publish/toggle', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const { enabled } = request.body;
    const userId = request.session.userId;

    setAutoPublishEnabled(userId, Boolean(enabled));

    logAudit(null, request.session.email, 'auto_publish_toggled', {
      enabled: Boolean(enabled),
    });

    fastify.log.info({
      user_id: userId,
      enabled: Boolean(enabled),
      trace_id: request.id,
    }, 'Auto-publish toggled');

    return reply.send({ success: true, enabled: Boolean(enabled) });
  });

  /**
   * POST /admin/users/:id/auto-publish
   * Admin: Set auto-publish status for any user
   */
  fastify.post('/admin/users/:id/auto-publish', {
    preHandler: [fastify.requireAuth, fastify.requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { enabled } = request.body;
    const userId = parseInt(id, 10);

    const user = getUserById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found', code: 'NOT_FOUND' });
    }

    setAutoPublishEnabled(userId, Boolean(enabled));

    logAudit(null, request.session.email, 'auto_publish_set_by_admin', {
      target_user_id: userId,
      target_email: user.email,
      enabled: Boolean(enabled),
    });

    fastify.log.info({
      admin_id: request.session.userId,
      target_user_id: userId,
      enabled: Boolean(enabled),
      trace_id: request.id,
    }, 'Auto-publish set by admin');

    return reply.send({ success: true, enabled: Boolean(enabled) });
  });

  /**
   * GET /admin/moderation-prompt
   * Get current moderation prompt
   */
  fastify.get('/admin/moderation-prompt', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const filePath = join(promptsDir, 'moderation.txt');
    
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'Moderation prompt not found', code: 'NOT_FOUND' });
    }

    const content = readFileSync(filePath, 'utf-8');
    return reply.send({ content });
  });

  /**
   * POST /admin/moderation-prompt
   * Update moderation prompt (admin only)
   */
  fastify.post('/admin/moderation-prompt', {
    preHandler: [fastify.requireAuth, fastify.requireAdmin],
  }, async (request, reply) => {
    const { content } = request.body;

    if (!content || typeof content !== 'string') {
      return reply.status(400).send({ error: 'Content is required', code: 'INVALID_CONTENT' });
    }

    const filePath = join(promptsDir, 'moderation.txt');
    writeFileSync(filePath, content, 'utf-8');

    logAudit(null, request.session.email, 'moderation_prompt_updated', {
      content_length: content.length,
    });

    fastify.log.info({
      user_id: request.session.userId,
      content_length: content.length,
      trace_id: request.id,
    }, 'Moderation prompt updated');

    return reply.send({ success: true });
  });
}
