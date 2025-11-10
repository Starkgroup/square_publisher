import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const ALLOWED_MIME = Object.keys(MIME_EXT);

/**
 * Save an uploaded file stream to disk under uploads/YYYY/MM/uuid.ext
 * Returns { path, url, mime, size }
 */
export async function saveUpload({ file, filename, mimetype, limit, uploadsDir, baseUrl }) {
  if (!ALLOWED_MIME.includes(mimetype)) {
    const err = new Error('Unsupported media type');
    err.statusCode = 415;
    err.code = 'UNSUPPORTED_MEDIA_TYPE';
    throw err;
  }

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const subdir = join(uploadsDir, year, month);
  if (!existsSync(subdir)) {
    mkdirSync(subdir, { recursive: true });
  }

  const ext = MIME_EXT[mimetype] || extname(filename) || '.bin';
  const id = randomUUID();
  const fname = `${id}${ext}`;
  const absPath = join(subdir, fname);

  let size = 0;
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(absPath);
    file.on('data', (chunk) => {
      size += chunk.length;
      if (limit && size > limit) {
        ws.destroy();
        const err = new Error('File too large');
        err.statusCode = 413;
        err.code = 'PAYLOAD_TOO_LARGE';
        reject(err);
      }
    });
    file.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', resolve);
    file.pipe(ws);
  });

  const relPath = `/${year}/${month}/${fname}`;
  const url = `${baseUrl.replace(/\/$/, '')}/media${relPath}`;

  return { path: relPath, url, mime: mimetype, size_bytes: size };
}
