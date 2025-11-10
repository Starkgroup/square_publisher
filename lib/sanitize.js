import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize HTML content for safe display in RSS feeds and admin
 * Allows basic formatting but strips dangerous tags/attributes
 */
export function sanitizeContent(html) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'u', 'b', 'i',
      'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    ],
    allowedAttributes: {
      'a': ['href', 'title', 'target'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      'a': (tagName, attribs) => {
        return {
          tagName: 'a',
          attribs: {
            ...attribs,
            rel: 'noopener noreferrer',
          },
        };
      },
    },
  });
}

/**
 * Strip all HTML tags for plain text summary
 */
export function stripHtml(html) {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });
}
