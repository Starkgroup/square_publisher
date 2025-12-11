/**
 * Validation utilities
 */

export class ValidationError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = code;
    this.details = details;
  }
}

/**
 * Validate text content
 * @param {string} text - Text to validate
 * @param {number} maxLength - Maximum allowed length
 * @throws {ValidationError} If validation fails
 */
export function validateText(text, maxLength = 50000) {
  if (typeof text !== 'string') {
    throw new ValidationError('Text must be a string', 'INVALID_TYPE');
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('Text cannot be empty', 'EMPTY_TEXT');
  }

  if (trimmed.length > maxLength) {
    throw new ValidationError(
      `Text exceeds maximum length of ${maxLength} characters`,
      'TEXT_TOO_LONG',
      { length: trimmed.length, maxLength }
    );
  }

  return trimmed;
}

/**
 * Normalize text content
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .replace(/[ \t]+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Generate summary from text
 * @param {string} text - Text to summarize
 * @param {number} maxLength - Maximum summary length
 * @returns {string} Summary
 */
export function generateSummary(text, maxLength = 300) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  
  if (normalized.length <= maxLength) {
    return normalized;
  }

  // Try to break at sentence end
  const truncated = normalized.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclamation = truncated.lastIndexOf('!');
  
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);
  
  if (lastSentenceEnd > maxLength * 0.7) {
    return truncated.substring(0, lastSentenceEnd + 1);
  }

  // Break at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + '…';
  }

  return truncated + '…';
}

/**
 * Validate ingest request body
 * @param {object} body - Request body
 * @param {number} maxTextLength - Maximum text length
 * @returns {object} Validated data
 * @throws {ValidationError} If validation fails
 */
export function validateIngestRequest(body, maxTextLength = 50000) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Invalid request body', 'INVALID_BODY');
  }

  const { text, source, ext_id, tag, link, client_key, title } = body;

  // Validate text (required)
  const validatedText = validateText(text, maxTextLength);
  const normalizedText = normalizeText(validatedText);

  // Validate source (optional)
  let validatedSource = null;
  if (source !== undefined && source !== null) {
    if (typeof source !== 'string') {
      throw new ValidationError('Source must be a string', 'INVALID_SOURCE');
    }
    validatedSource = source.trim();
    if (validatedSource.length > 100) {
      throw new ValidationError('Source exceeds maximum length of 100 characters', 'SOURCE_TOO_LONG');
    }
  }

  // Validate ext_id (optional)
  let validatedExtId = null;
  if (ext_id !== undefined && ext_id !== null) {
    if (typeof ext_id !== 'string' && typeof ext_id !== 'number') {
      throw new ValidationError('External ID must be a string or number', 'INVALID_EXT_ID');
    }
    validatedExtId = String(ext_id).trim();
    if (validatedExtId.length > 255) {
      throw new ValidationError('External ID exceeds maximum length of 255 characters', 'EXT_ID_TOO_LONG');
    }
  }

  // Validate tag (optional)
  let validatedTag = null;
  if (tag !== undefined && tag !== null) {
    if (typeof tag !== 'string') {
      throw new ValidationError('Tag must be a string', 'INVALID_TAG');
    }
    validatedTag = tag.trim();
    if (validatedTag.length === 0) {
      validatedTag = null;
    } else if (validatedTag.length > 100) {
      throw new ValidationError('Tag exceeds maximum length of 100 characters', 'TAG_TOO_LONG');
    }
  }

  // Validate title (optional)
  let validatedTitle = null;
  if (title !== undefined && title !== null) {
    if (typeof title !== 'string') {
      throw new ValidationError('Title must be a string', 'INVALID_TITLE');
    }
    validatedTitle = title.trim();
    if (validatedTitle.length === 0) {
      validatedTitle = null;
    } else if (validatedTitle.length > 200) {
      throw new ValidationError('Title exceeds maximum length of 200 characters', 'TITLE_TOO_LONG');
    }
  }

  let validatedLink = null;
  if (link !== undefined && link !== null) {
    if (typeof link !== 'string') {
      throw new ValidationError('Link must be a string', 'INVALID_LINK');
    }
    validatedLink = link.trim();
    if (validatedLink.length === 0) {
      validatedLink = null;
    } else if (validatedLink.length > 2048) {
      throw new ValidationError('Link exceeds maximum length of 2048 characters', 'LINK_TOO_LONG');
    }
  }

  let validatedClientKey = null;
  if (client_key !== undefined && client_key !== null) {
    if (typeof client_key !== 'string') {
      throw new ValidationError('client_key must be a string', 'INVALID_CLIENT_KEY');
    }
    validatedClientKey = client_key.trim();
    if (validatedClientKey.length === 0) {
      validatedClientKey = null;
    } else if (validatedClientKey.length > 100) {
      throw new ValidationError('client_key exceeds maximum length of 100 characters', 'CLIENT_KEY_TOO_LONG');
    }
  }

  return {
    text: normalizedText,
    source: validatedSource,
    ext_id: validatedExtId,
    tag: validatedTag,
    title: validatedTitle,
    link: validatedLink,
    client_key: validatedClientKey,
  };
}

export function validateRssToLinkedInRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Invalid request body', 'INVALID_BODY');
  }

  const { title, link, summary, image_url, guid } = body;

  let validatedTitle = '';
  if (title !== undefined && title !== null) {
    if (typeof title !== 'string') {
      throw new ValidationError('Title must be a string', 'INVALID_TITLE');
    }
    validatedTitle = title.trim();
  }

  if (typeof link !== 'string' || link.trim().length === 0) {
    throw new ValidationError('Link is required', 'INVALID_LINK');
  }
  const validatedLink = link.trim();

  let validatedSummary = '';
  if (summary !== undefined && summary !== null) {
    if (typeof summary !== 'string') {
      throw new ValidationError('Summary must be a string', 'INVALID_SUMMARY');
    }
    validatedSummary = normalizeText(summary);
  }

  let validatedImage = null;
  if (image_url !== undefined && image_url !== null) {
    if (typeof image_url !== 'string') {
      throw new ValidationError('image_url must be a string', 'INVALID_IMAGE');
    }
    const url = image_url.trim();
    if (url.length > 0) {
      validatedImage = url;
    }
  }

  let validatedGuid = null;
  if (guid !== undefined && guid !== null) {
    if (typeof guid !== 'string' && typeof guid !== 'number') {
      throw new ValidationError('guid must be a string or number', 'INVALID_GUID');
    }
    validatedGuid = String(guid).trim();
  }

  return {
    title: validatedTitle,
    link: validatedLink,
    summary: validatedSummary,
    image_url: validatedImage,
    guid: validatedGuid,
  };
}

export function buildLinkedInText({ title = '', link, summary = '' }) {
  const max = 3000;
  const parts = [];
  if (title && title.length > 0) parts.push(title);
  if (summary && summary.length > 0) parts.push(summary);
  parts.push(link);
  let text = parts.filter(Boolean).join('\n\n');
  if (text.length <= max) return text;
  const available = max - (link.length + 2);
  const head = (title + (summary ? '\n\n' + summary : '')).trim();
  let clipped = head;
  if (head.length > available) {
    const truncated = head.substring(0, available);
    const lastSpace = truncated.lastIndexOf(' ');
    clipped = (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '…';
  }
  return clipped + '\n\n' + link;
}
