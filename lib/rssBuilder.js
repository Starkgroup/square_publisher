import { getDb } from '../db/index.js';
import crypto from 'crypto';
import { sanitizeContent } from './sanitize.js';

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeTitle(post) {
  if (post.title && post.title.trim().length > 0) return post.title.trim();
  const t = post.text.replace(/\s+/g, ' ').trim();
  return t.length > 80 ? t.slice(0, 77) + '…' : t;
}

function rfc822Date(dateStr) {
  const d = new Date(dateStr);
  return d.toUTCString();
}

export function createRssBuilder({ baseUrl, feedSize }) {
  let cache = {
    xml: null,
    etag: null,
    lastModified: null,
    builtAt: 0,
  };

  function buildFeed() {
    const db = getDb();
    const posts = db.prepare(
      `SELECT p.id, p.slug, p.title, p.text, p.summary, p.pub_date, p.updated_at, p.cover_media_id
       FROM posts p
       WHERE p.status = 'published'
       ORDER BY p.pub_date DESC
       LIMIT ?`
    ).all(feedSize);

    const itemsXml = posts.map(p => {
      const link = `${baseUrl.replace(/\/$/, '')}/admin/posts/${p.id}`;
      const guid = p.slug;
      const title = makeTitle(p);
      const rawDescription = p.summary || p.text.slice(0, 300);
      const description = sanitizeContent(rawDescription);
      let enclosure = '';

      if (p.cover_media_id) {
        const m = getDb().prepare('SELECT url, mime, size_bytes FROM media WHERE id = ?').get(p.cover_media_id);
        if (m) {
          enclosure = `\n      <enclosure url="${escapeXml(m.url)}" length="${m.size_bytes || 0}" type="${escapeXml(m.mime)}"/>`;
        }
      }

      const pubDate = p.pub_date ? rfc822Date(p.pub_date) : rfc822Date(p.updated_at);

      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${description}]]></description>${enclosure}
    </item>`;
    }).join('\n');

    const now = new Date();
    const lastMod = posts.length > 0 ? new Date(posts[0].pub_date || posts[0].updated_at) : now;

    const channel = `  <channel>
    <title>Square Publisher Feed</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Recent posts</description>
    <lastBuildDate>${lastMod.toUTCString()}</lastBuildDate>
${itemsXml}\n  </channel>`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n${channel}\n</rss>`;

    const etag = 'W/"' + crypto.createHash('md5').update(xml).digest('hex') + '"';

    cache.xml = xml;
    cache.etag = etag;
    cache.lastModified = lastMod.toUTCString();
    cache.builtAt = Date.now();
  }

  return {
    getCache() {
      if (!cache.xml) buildFeed();
      return cache;
    },
    invalidate() {
      cache.xml = null;
      cache.etag = null;
      cache.lastModified = null;
      cache.builtAt = 0;
    },
    rebuild() {
      buildFeed();
      return cache;
    }
  };
}
