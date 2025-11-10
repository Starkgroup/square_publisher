import { createRssBuilder } from '../lib/rssBuilder.js';

export default async function rssRoutes(fastify) {
  const builder = createRssBuilder({
    baseUrl: fastify.config.server.baseUrl,
    feedSize: fastify.config.rss.feedSize,
  });

  fastify.decorate('rssInvalidate', () => builder.invalidate());

  fastify.get('/rss.xml', async (request, reply) => {
    const cache = builder.getCache();

    const inm = request.headers['if-none-match'];
    const ims = request.headers['if-modified-since'];

    reply.header('Content-Type', 'application/rss+xml; charset=utf-8');
    reply.header('ETag', cache.etag);
    reply.header('Last-Modified', cache.lastModified);
    reply.header('Cache-Control', 'public, max-age=60');

    if (inm && inm === cache.etag) {
      return reply.status(304).send();
    }
    if (ims && new Date(ims) >= new Date(cache.lastModified)) {
      return reply.status(304).send();
    }

    return reply.send(cache.xml);
  });
}
