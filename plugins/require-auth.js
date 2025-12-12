import fp from 'fastify-plugin';
import { getUserById } from '../lib/users.js';

/**
 * Authentication middleware plugin
 */
async function requireAuthPlugin(fastify) {
  /**
   * Require authenticated user
   */
  fastify.decorate('requireAuth', async function (request, reply) {
    if (!request.session.userId) {
      return reply.redirect('/admin/login');
    }

    if (request.session.name === undefined) {
      const user = getUserById(request.session.userId);
      request.session.name = user ? (user.name || null) : null;
    }
  });

  /**
   * Require specific role
   */
  fastify.decorate('requireRole', (role) => {
    return async function (request, reply) {
      if (!request.session.userId) {
        return reply.redirect('/admin/login');
      }

      if (request.session.role !== role && request.session.role !== 'admin') {
        return reply.status(403).send({
          error: 'Forbidden',
          code: 'INSUFFICIENT_PERMISSIONS',
        });
      }
    };
  });

  /**
   * Require admin role
   */
  fastify.decorate('requireAdmin', async function (request, reply) {
    if (!request.session.userId) {
      return reply.redirect('/admin/login');
    }

    if (request.session.name === undefined) {
      const user = getUserById(request.session.userId);
      request.session.name = user ? (user.name || null) : null;
    }

    if (request.session.role !== 'admin') {
      return reply.status(403).send({
        error: 'Forbidden',
        code: 'ADMIN_REQUIRED',
      });
    }
  });
}

export default fp(requireAuthPlugin);
