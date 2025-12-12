import { getDb } from '../db/index.js';
import { moderatePostContent } from './openai.js';
import { sendModerationRejectionEmail } from './email.js';
import { getUserByClientKey } from './users.js';
import { logAudit } from './audit.js';

let workerInterval = null;
let fastifyInstance = null;

/**
 * Process pending moderation for posts
 * Checks posts where moderation_checked_at IS NULL and publish_at IS NOT NULL
 */
async function processPendingModeration() {
  const db = getDb();

  const pendingPosts = db.prepare(`
    SELECT id, text, client_key
    FROM posts
    WHERE publish_at IS NOT NULL
      AND moderation_checked_at IS NULL
      AND status = 'draft'
    LIMIT 5
  `).all();

  for (const post of pendingPosts) {
    try {
      const result = await moderatePostContent({ text: post.text });
      const now = new Date().toISOString();

      if (result.is_approved) {
        // Approved - keep status as draft, will be published by scheduler
        db.prepare(`
          UPDATE posts
          SET moderation_checked_at = ?,
              moderation_reason = ?
          WHERE id = ?
        `).run(now, result.reason || 'Approved', post.id);

        logAudit(post.id, 'system', 'post_moderation_approved', {
          reason: result.reason,
        });

        if (fastifyInstance) {
          fastifyInstance.log.info({ post_id: post.id }, 'Post moderation approved');
        }
      } else {
        // Rejected - set status to warning
        db.prepare(`
          UPDATE posts
          SET status = 'warning',
              moderation_checked_at = ?,
              moderation_reason = ?,
              publish_at = NULL
          WHERE id = ?
        `).run(now, result.reason, post.id);

        logAudit(post.id, 'system', 'post_moderation_rejected', {
          reason: result.reason,
        });

        if (fastifyInstance) {
          fastifyInstance.log.warn({ post_id: post.id, reason: result.reason }, 'Post moderation rejected');
        }

        // Send email notification to admin
        const user = post.client_key ? getUserByClientKey(post.client_key) : null;
        await sendModerationRejectionEmail({
          postId: post.id,
          postText: post.text,
          userEmail: user?.email || post.client_key || 'Unknown',
          reason: result.reason,
        });
      }
    } catch (err) {
      console.error(`Moderation failed for post ${post.id}:`, err.message);
      
      // Mark as checked with error to avoid infinite retry
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE posts
        SET moderation_checked_at = ?,
            moderation_reason = ?
        WHERE id = ?
      `).run(now, `Moderation error: ${err.message}`, post.id);
    }
  }
}

/**
 * Process scheduled posts for publishing
 * Publishes posts where publish_at <= now and moderation is done
 */
function processScheduledPublishing() {
  const db = getDb();
  const now = new Date().toISOString();

  const postsToPublish = db.prepare(`
    SELECT id
    FROM posts
    WHERE status = 'draft'
      AND publish_at IS NOT NULL
      AND publish_at <= ?
      AND moderation_checked_at IS NOT NULL
    LIMIT 10
  `).all(now);

  for (const post of postsToPublish) {
    db.prepare(`
      UPDATE posts
      SET status = 'published',
          pub_date = COALESCE(pub_date, ?),
          updated_at = ?
      WHERE id = ?
    `).run(now, now, post.id);

    logAudit(post.id, 'system', 'post_auto_published', {});

    if (fastifyInstance) {
      fastifyInstance.log.info({ post_id: post.id }, 'Post auto-published');
      
      // Invalidate RSS cache if available
      if (typeof fastifyInstance.rssInvalidate === 'function') {
        fastifyInstance.rssInvalidate();
      }
    }
  }

  return postsToPublish.length;
}

/**
 * Main worker tick - runs every interval
 */
async function workerTick() {
  try {
    // Process pending moderation first
    await processPendingModeration();

    // Then process scheduled publishing
    processScheduledPublishing();
  } catch (err) {
    console.error('Auto-publish worker error:', err.message);
  }
}

/**
 * Start the auto-publish worker
 * @param {object} fastify - Fastify instance for logging
 * @param {number} intervalMs - Check interval in milliseconds (default: 60000)
 */
export function startAutoPublishWorker(fastify, intervalMs = 60000) {
  if (workerInterval) {
    console.warn('Auto-publish worker already running');
    return;
  }

  fastifyInstance = fastify;
  
  // Run immediately on start
  workerTick();

  // Then run on interval
  workerInterval = setInterval(workerTick, intervalMs);

  if (fastify) {
    fastify.log.info({ interval_ms: intervalMs }, 'Auto-publish worker started');
  } else {
    console.log(`Auto-publish worker started (interval: ${intervalMs}ms)`);
  }
}

/**
 * Stop the auto-publish worker
 */
export function stopAutoPublishWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    fastifyInstance = null;
    console.log('Auto-publish worker stopped');
  }
}

/**
 * Schedule a post for auto-publishing
 * @param {number} postId - Post ID
 * @param {number} delayHours - Hours until publication (default: 6)
 */
export function schedulePostForAutoPublish(postId, delayHours = 6) {
  const db = getDb();
  
  const publishAt = new Date();
  publishAt.setHours(publishAt.getHours() + delayHours);

  db.prepare(`
    UPDATE posts
    SET publish_at = ?
    WHERE id = ?
  `).run(publishAt.toISOString(), postId);

  return publishAt;
}
