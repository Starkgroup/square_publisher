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

  const { text, source, ext_id } = body;

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

  return {
    text: normalizedText,
    source: validatedSource,
    ext_id: validatedExtId,
  };
}
