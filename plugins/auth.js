import fp from 'fastify-plugin';

/**
 * Authentication plugin
 */
async function authPlugin(fastify) {
  /**
   * Verify Bearer token for ingest API
   */
  fastify.decorate('verifyIngestToken', async function (request, reply) {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return reply.status(401).send({
        error: 'Missing authorization header',
        code: 'UNAUTHORIZED',
      });
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return reply.status(401).send({
        error: 'Invalid authorization format. Expected: Bearer <token>',
        code: 'INVALID_AUTH_FORMAT',
      });
    }

    const validToken = fastify.config.auth.ingestToken;

    if (token !== validToken) {
      fastify.log.warn({ 
        ip: request.ip,
        trace_id: request.id,
      }, 'Invalid ingest token attempt');
      
      return reply.status(401).send({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }

    // Token is valid, continue
  });
}

export default fp(authPlugin);
