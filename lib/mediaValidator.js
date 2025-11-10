/**
 * Validate media file by checking magic numbers (file signatures)
 * This provides additional security beyond MIME type checking
 */

const SIGNATURES = {
  'image/jpeg': [
    [0xFF, 0xD8, 0xFF],
  ],
  'image/png': [
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  ],
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  'image/webp': [
    [0x52, 0x49, 0x46, 0x46], // RIFF (WebP starts with RIFF)
  ],
};

/**
 * Check if buffer starts with any of the given signatures
 */
function matchesSignature(buffer, signatures) {
  return signatures.some(sig => {
    if (buffer.length < sig.length) return false;
    return sig.every((byte, i) => buffer[i] === byte);
  });
}

/**
 * Validate file content matches declared MIME type
 * Returns true if valid, false otherwise
 */
export function validateMediaSignature(buffer, mimeType) {
  const signatures = SIGNATURES[mimeType];
  if (!signatures) {
    // Unknown MIME type, cannot validate
    return false;
  }
  return matchesSignature(buffer, signatures);
}

/**
 * Detect MIME type from file signature
 * Returns detected MIME or null if unknown
 */
export function detectMimeType(buffer) {
  for (const [mime, signatures] of Object.entries(SIGNATURES)) {
    if (matchesSignature(buffer, signatures)) {
      return mime;
    }
  }
  return null;
}
