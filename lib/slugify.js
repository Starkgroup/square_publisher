import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

/**
 * Generate a URL-safe slug from text
 * @param {string} text - The text to slugify
 * @param {number} maxLength - Maximum length of the slug
 * @returns {string} URL-safe slug
 */
export function slugify(text, maxLength = 50) {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
    .replace(/[\s_-]+/g, '-') // Replace spaces, underscores, hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

  const truncated = slug.substring(0, maxLength);
  
  // If slug is empty or very short, use random ID
  if (truncated.length < 3) {
    return `post-${nanoid()}`;
  }

  return truncated;
}

/**
 * Generate a unique slug by appending random suffix if needed
 * @param {string} text - The text to slugify
 * @param {Function} checkExists - Function to check if slug exists
 * @returns {Promise<string>} Unique slug
 */
export async function generateUniqueSlug(text, checkExists) {
  let slug = slugify(text);
  
  // Check if slug exists
  if (await checkExists(slug)) {
    // Append random suffix
    slug = `${slug}-${nanoid()}`;
  }
  
  return slug;
}
