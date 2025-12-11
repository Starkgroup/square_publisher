import { verifyUser, updateLastLogin } from '../../lib/users.js';
import { logAudit } from '../../lib/audit.js';

export default async function adminAuthRoutes(fastify) {
  /**
   * GET /admin/login
   * Show login page
   */
  fastify.get('/admin/login', async (request, reply) => {
    if (request.session.userId) {
      return reply.redirect('/admin/posts');
    }
    
    return reply.view('admin/login.ejs', {
      error: request.query.error,
    });
  });

  /**
   * POST /admin/login
   * Process login
   */
  fastify.post('/admin/login', async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.redirect('/admin/login?error=missing_credentials');
    }

    try {
      const user = await verifyUser(email, password);

      if (!user) {
        // Log failed attempt
        logAudit(null, email, 'login_failed', {
          ip: request.ip,
          reason: 'invalid_credentials',
        });

        fastify.log.warn({
          email,
          ip: request.ip,
          trace_id: request.id,
        }, 'Failed login attempt');

        return reply.redirect('/admin/login?error=invalid_credentials');
      }

      // Set session
      request.session.userId = user.id;
      request.session.email = user.email;
      request.session.role = user.role;
      request.session.clientKey = user.client_key || null;

      // Update last login
      updateLastLogin(user.id);

      // Log successful login
      logAudit(null, user.email, 'login_success', {
        ip: request.ip,
      });

      fastify.log.info({
        user_id: user.id,
        email: user.email,
        ip: request.ip,
        trace_id: request.id,
      }, 'User logged in');

      return reply.redirect('/admin/posts');

    } catch (err) {
      fastify.log.error({ err }, 'Login error');
      return reply.redirect('/admin/login?error=server_error');
    }
  });

  /**
   * POST /admin/logout
   * Logout user
   */
  fastify.post('/admin/logout', async (request, reply) => {
    if (request.session.userId) {
      logAudit(null, request.session.email, 'logout', {
        ip: request.ip,
      });

      fastify.log.info({
        user_id: request.session.userId,
        email: request.session.email,
        trace_id: request.id,
      }, 'User logged out');
    }

    request.session.destroy();
    return reply.redirect('/admin/login');
  });
}
