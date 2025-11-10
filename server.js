import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import cors from '@fastify/cors';
import { mkdirSync, existsSync } from 'fs';
import config from './config/index.js';
import { initDb } from './db/index.js';

// Plugins
import authPlugin from './plugins/auth.js';

// Routes
import healthzRoutes from './routes/healthz.js';
import ingestRoutes from './routes/ingest.js';

// Ensure uploads directory exists
if (!existsSync(config.uploads.dir)) {
  mkdirSync(config.uploads.dir, { recursive: true });
}

const fastify = Fastify({
  logger: {
    level: config.isDev ? 'debug' : 'info',
    transport: config.isDev ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
  requestIdHeader: 'x-trace-id',
  requestIdLogLabel: 'trace_id',
  disableRequestLogging: false,
  bodyLimit: config.uploads.maxFileSize,
});

// Initialize database
initDb(config.db.path);

// Make config available to routes
fastify.decorate('config', config);

// Register auth plugin
await fastify.register(authPlugin);

// Security plugins
await fastify.register(helmet, {
  contentSecurityPolicy: config.isDev ? false : undefined,
});

await fastify.register(cors, {
  origin: config.isDev ? true : config.server.baseUrl,
});

await fastify.register(rateLimit, {
  max: config.limits.rateLimitMax,
  timeWindow: config.limits.rateLimitTimeWindow,
});

// Compression
await fastify.register(compress, { global: true });

// Multipart support
await fastify.register(multipart, {
  limits: {
    fileSize: config.uploads.maxFileSize,
  },
});

// Static files (for media)
await fastify.register(staticPlugin, {
  root: config.uploads.dir,
  prefix: '/media/',
  decorateReply: false,
});

// Routes
await fastify.register(healthzRoutes);
await fastify.register(ingestRoutes);

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  request.log.error({
    err: error,
    trace_id: request.id,
  }, 'Request error');

  const statusCode = error.statusCode || 500;
  const errorResponse = {
    error: error.message || 'Internal Server Error',
    code: error.code || 'INTERNAL_ERROR',
    trace_id: request.id,
  };

  if (config.isDev && error.validation) {
    errorResponse.details = error.validation;
  }

  reply.status(statusCode).send(errorResponse);
});

// 404 handler
fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    error: 'Not Found',
    code: 'NOT_FOUND',
    path: request.url,
  });
});

// Start server
const start = async () => {
  try {
    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
    });
    
    fastify.log.info(`Server started on ${config.server.baseUrl}`);
    fastify.log.info(`Environment: ${config.env}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  fastify.log.info(`Received ${signal}, closing server...`);
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
