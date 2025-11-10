import fp from 'fastify-plugin';

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
}

export default fp(requireAuthPlugin);
