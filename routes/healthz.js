import { getDb } from '../db/index.js';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export default async function healthzRoutes(fastify) {
  fastify.get('/healthz', async (request, reply) => {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: {
        database: false,
        filesystem: false,
      },
    };

    try {
      // Check database
      const db = getDb();
      db.prepare('SELECT 1').get();
      checks.checks.database = true;
    } catch (err) {
      checks.status = 'error';
      checks.checks.database = false;
      fastify.log.error({ err }, 'Database health check failed');
    }

    try {
      // Check filesystem
      const testFile = join(tmpdir(), `healthz-${Date.now()}.tmp`);
      writeFileSync(testFile, 'test');
      if (existsSync(testFile)) {
        unlinkSync(testFile);
        checks.checks.filesystem = true;
      }
    } catch (err) {
      checks.status = 'error';
      checks.checks.filesystem = false;
      fastify.log.error({ err }, 'Filesystem health check failed');
    }

    const statusCode = checks.status === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(checks);
  });
}
