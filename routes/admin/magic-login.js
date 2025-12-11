import { getUserByEmail, updateLastLogin } from '../../lib/users.js';
import { createMagicLink, findValidMagicLink, markMagicLinkUsed, canRequestMagicLink } from '../../lib/magicLinks.js';
import { sendMagicLinkEmail } from '../../lib/email.js';
import { logAudit } from '../../lib/audit.js';

export default async function magicLoginRoutes(fastify) {
  const config = fastify.config;

  /**
   * GET /login
   * Show magic link request form
   */
  fastify.get('/login', async (request, reply) => {
    if (request.session.userId) {
      return reply.redirect('/admin/posts');
    }

    return reply.view('admin/login-magic.ejs', {
      error: request.query.error,
      success: request.query.success,
    });
  });

  /**
   * POST /login/magic
   * Request magic link
   */
  fastify.post('/login/magic', async (request, reply) => {
    const { email } = request.body;

    if (!email || !email.trim()) {
      return reply.redirect('/login?error=missing_email');
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const user = getUserByEmail(normalizedEmail);

      if (user) {
        // Check rate limit
        if (canRequestMagicLink(user.id)) {
          // Create magic link
          const magicLink = createMagicLink(
            user.id,
            request.ip,
            request.headers['user-agent']
          );

          const link = `${config.server.baseUrl}/login/magic/${magicLink.token}`;

          // Send email
          const sent = await sendMagicLinkEmail({
            to: user.email,
            link,
            expiresInMinutes: magicLink.expiresInMinutes,
          });

          if (sent) {
            logAudit(null, user.email, 'magic_link_sent', {
              ip: request.ip,
            });

            fastify.log.info({
              user_id: user.id,
              email: user.email,
              ip: request.ip,
              trace_id: request.id,
            }, 'Magic link sent');
          } else {
            // Email not configured - log link for dev
            fastify.log.info({
              user_id: user.id,
              email: user.email,
              link,
              trace_id: request.id,
            }, 'Magic link created (email not sent)');
          }
        } else {
          logAudit(null, user.email, 'magic_link_rate_limited', {
            ip: request.ip,
          });

          fastify.log.warn({
            email: user.email,
            ip: request.ip,
            trace_id: request.id,
          }, 'Magic link request rate limited');
        }
      } else {
        // User not found - log but show same message
        fastify.log.info({
          email: normalizedEmail,
          ip: request.ip,
          trace_id: request.id,
        }, 'Magic link requested for unknown email');
      }

      // Always show the same success message
      return reply.redirect('/login?success=link_sent');

    } catch (err) {
      fastify.log.error({ err }, 'Magic link request error');
      return reply.redirect('/login?error=server_error');
    }
  });

  /**
   * GET /login/magic/:token
   * Process magic link login
   */
  fastify.get('/login/magic/:token', async (request, reply) => {
    const { token } = request.params;

    if (!token) {
      return reply.view('admin/login-magic-error.ejs', {
        error: 'invalid_link',
      });
    }

    try {
      const result = findValidMagicLink(token);

      if (!result) {
        fastify.log.warn({
          token_prefix: token.substring(0, 8),
          ip: request.ip,
          trace_id: request.id,
        }, 'Magic link not found');

        return reply.view('admin/login-magic-error.ejs', {
          error: 'invalid_link',
        });
      }

      if (result.error === 'already_used') {
        fastify.log.warn({
          token_prefix: token.substring(0, 8),
          user_id: result.record.user_id,
          ip: request.ip,
          trace_id: request.id,
        }, 'Magic link already used');

        return reply.view('admin/login-magic-error.ejs', {
          error: 'already_used',
        });
      }

      if (result.error === 'expired') {
        fastify.log.warn({
          token_prefix: token.substring(0, 8),
          user_id: result.record.user_id,
          ip: request.ip,
          trace_id: request.id,
        }, 'Magic link expired');

        return reply.view('admin/login-magic-error.ejs', {
          error: 'expired',
        });
      }

      // Valid token - log user in
      const { record } = result;

      // Mark token as used
      markMagicLinkUsed(record.id);

      // Set session
      request.session.userId = record.user_id;
      request.session.email = record.email;
      request.session.role = record.role;

      // Update last login
      updateLastLogin(record.user_id);

      // Log successful login
      logAudit(null, record.email, 'magic_login_success', {
        ip: request.ip,
      });

      fastify.log.info({
        user_id: record.user_id,
        email: record.email,
        ip: request.ip,
        trace_id: request.id,
      }, 'User logged in via magic link');

      return reply.redirect('/admin/posts');

    } catch (err) {
      fastify.log.error({ err }, 'Magic link login error');
      return reply.view('admin/login-magic-error.ejs', {
        error: 'server_error',
      });
    }
  });
}
