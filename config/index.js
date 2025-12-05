import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Load environment variables from .env file
dotenvConfig();

const env = process.env;

// Validate required env vars
const required = ['ADMIN_USER', 'ADMIN_PASS', 'INGEST_TOKEN', 'SESSION_SECRET'];
for (const key of required) {
  if (!env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export default {
  env: env.NODE_ENV || 'development',
  isDev: env.NODE_ENV === 'development',
  
  server: {
    port: parseInt(env.PORT, 10) || 3000,
    host: env.HOST || '0.0.0.0',
    baseUrl: env.BASE_URL || `http://localhost:${env.PORT || 3000}`,
  },
  
  db: {
    path: env.DB_PATH || resolve(rootDir, 'data/square.db'),
  },
  
  auth: {
    adminUser: env.ADMIN_USER,
    adminPass: env.ADMIN_PASS,
    ingestToken: env.INGEST_TOKEN,
    sessionSecret: env.SESSION_SECRET,
  },
  
  uploads: {
    dir: resolve(env.UPLOADS_DIR || resolve(rootDir, 'uploads')),
    maxFileSize: parseInt(env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB
  },
  
  limits: {
    maxTextLength: parseInt(env.MAX_TEXT_LENGTH, 10) || 50000,
    rateLimitMax: parseInt(env.RATE_LIMIT_MAX, 10) || 100,
    rateLimitTimeWindow: parseInt(env.RATE_LIMIT_TIMEWINDOW, 10) || 60000,
  },
  
  rss: {
    feedSize: parseInt(env.RSS_FEED_SIZE, 10) || 50,
    cacheTtl: parseInt(env.RSS_CACHE_TTL, 10) || 300000, // 5 minutes
  },

  openai: {
    apiKey: env.OPENAI_API_KEY || '',
    imageModel: env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    textModel: env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
    size: env.OPENAI_IMAGE_SIZE || '1024x1024',
    quality: env.OPENAI_IMAGE_QUALITY || 'high',
    outputFormat: env.OPENAI_IMAGE_FORMAT || 'png',
  },
};
