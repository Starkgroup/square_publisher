import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import formbody from '@fastify/formbody';
import view from '@fastify/view';
import ejs from 'ejs';
import { mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config/index.js';
import { initDb } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { initDefaultAdmin } from './lib/users.js';
import { startAutoPublishWorker, stopAutoPublishWorker } from './lib/auto-publish-worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Plugins
import authPlugin from './plugins/auth.js';
import requireAuthPlugin from './plugins/require-auth.js';

// Routes
import healthzRoutes from './routes/healthz.js';
import ingestRoutes from './routes/ingest.js';
import adminAuthRoutes from './routes/admin/auth.js';
import adminPostsRoutes from './routes/admin/posts.js';
import adminMediaRoutes from './routes/admin/media.js';
import adminPublishRoutes from './routes/admin/publish.js';
import adminAuditRoutes from './routes/admin/audit.js';
import adminAiGenerateRoutes from './routes/admin/ai-generate.js';
import adminFotoRoutes from './routes/admin/foto.js';
import adminUsersRoutes from './routes/admin/users.js';
import magicLoginRoutes from './routes/admin/magic-login.js';
import autoPublishRoutes from './routes/admin/auto-publish.js';
import rssRoutes from './routes/rss.js';

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

// Apply pending migrations
runMigrations();

// Initialize default admin user
await initDefaultAdmin(config.auth.adminUser, config.auth.adminPass);

// Make config available to routes
fastify.decorate('config', config);

// Register auth plugins
await fastify.register(authPlugin);
await fastify.register(requireAuthPlugin);

// Cookie and session support
await fastify.register(cookie);
await fastify.register(session, {
  secret: config.auth.sessionSecret,
  cookie: {
    secure: !config.isDev,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});

// Form body parser
await fastify.register(formbody);

// Template engine
await fastify.register(view, {
  engine: {
    ejs,
  },
  root: join(__dirname, 'views'),
});

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

// Static files (for public assets)
await fastify.register(staticPlugin, {
  root: join(__dirname, 'public'),
  prefix: '/public/',
  decorateReply: false,
});

// Routes
await fastify.register(healthzRoutes);
await fastify.register(ingestRoutes);
// Register RSS before admin routes so decorators are available
await fastify.register(rssRoutes);
await fastify.register(adminAuthRoutes);
await fastify.register(adminPostsRoutes);
await fastify.register(adminMediaRoutes);
await fastify.register(adminPublishRoutes);
await fastify.register(adminAuditRoutes);
await fastify.register(adminAiGenerateRoutes);
await fastify.register(adminFotoRoutes);
await fastify.register(adminUsersRoutes);
await fastify.register(magicLoginRoutes);
await fastify.register(autoPublishRoutes);

// Root redirects
fastify.get('/', async (request, reply) => {
  if (request.session && request.session.userId) {
    return reply.redirect('/admin/posts');
  }

  return reply.redirect('/admin/login');
});

fastify.get('/admin', async (request, reply) => {
  if (request.session && request.session.userId) {
    return reply.redirect('/admin/posts');
  }

  return reply.redirect('/admin/login');
});

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

    // Start auto-publish worker (checks every 60 seconds)
    startAutoPublishWorker(fastify, 60000);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  fastify.log.info(`Received ${signal}, closing server...`);
  stopAutoPublishWorker();
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
