import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const promptsDir = join(__dirname, '..', 'prompts');

/**
 * Load a prompt template from prompts/ folder
 * @param {string} name - Prompt file name without extension
 * @returns {string} Prompt template content
 */
export function loadPromptTemplate(name = 'default') {
  const filePath = join(promptsDir, `${name}.txt`);
  return readFileSync(filePath, 'utf-8');
}

/**
 * Build prompt from template with variable substitution
 * @param {object} params - { title, tag }
 * @param {string} templateName - Prompt template name
 * @returns {string} Final prompt
 */
export function buildPrompt({ title, tag }, templateName = 'default') {
  let prompt = loadPromptTemplate(templateName);
  prompt = prompt.replace(/\{\{title\}\}/g, title || '');
  prompt = prompt.replace(/\{\{tag\}\}/g, tag || '');
  return prompt.trim();
}

/**
 * Generate an image using OpenAI Image API with an input image
 * Uses the /v1/images/edits endpoint for image-to-image generation
 * @param {object} params
 * @param {Buffer} params.imageBuffer - Input image as Buffer
 * @param {string} params.imageName - Original filename
 * @param {string} params.prompt - Text prompt
 * @returns {Promise<Buffer>} Generated image as Buffer
 */
export async function generateImageWithTemplate({ imageBuffer, imageName, prompt }) {
  const apiKey = config.openai.apiKey;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const formData = new FormData();
  
  // Create a Blob from the image buffer
  const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
  formData.append('image', imageBlob, imageName || 'template.png');
  formData.append('prompt', prompt);
  formData.append('model', config.openai.imageModel);
  formData.append('size', config.openai.size);
  formData.append('quality', config.openai.quality);

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || response.statusText;
    throw new Error(`OpenAI API error: ${errorMessage}`);
  }

  const data = await response.json();
  
  // gpt-image-1 returns base64-encoded image
  if (data.data && data.data[0] && data.data[0].b64_json) {
    return Buffer.from(data.data[0].b64_json, 'base64');
  }
  
  // Fallback for URL response (dall-e models)
  if (data.data && data.data[0] && data.data[0].url) {
    const imageResponse = await fetch(data.data[0].url);
    const arrayBuffer = await imageResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error('Unexpected response format from OpenAI');
}

/**
 * Generate an image from scratch (no input image)
 * Uses the /v1/images/generations endpoint
 * @param {object} params
 * @param {string} params.prompt - Text prompt
 * @returns {Promise<Buffer>} Generated image as Buffer
 */
export async function generateImage({ prompt }) {
  const apiKey = config.openai.apiKey;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openai.imageModel,
      prompt,
      n: 1,
      size: config.openai.size,
      quality: config.openai.quality,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || response.statusText;
    throw new Error(`OpenAI API error: ${errorMessage}`);
  }

  const data = await response.json();
  
  if (data.data && data.data[0] && data.data[0].b64_json) {
    return Buffer.from(data.data[0].b64_json, 'base64');
  }
  
  if (data.data && data.data[0] && data.data[0].url) {
    const imageResponse = await fetch(data.data[0].url);
    const arrayBuffer = await imageResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error('Unexpected response format from OpenAI');
}

/**
 * Moderate post content using LLM
 * Uses the /v1/chat/completions endpoint with gpt-4o-mini
 * @param {object} params
 * @param {string} params.text - Post text to moderate
 * @param {string} [params.promptTemplate] - Optional custom prompt template
 * @returns {Promise<{is_approved: boolean, reason: string}>} Moderation result
 */
export async function moderatePostContent({ text, promptTemplate }) {
  const apiKey = config.openai.apiKey;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // Load prompt template
  let prompt;
  if (promptTemplate) {
    prompt = promptTemplate;
  } else {
    prompt = loadPromptTemplate('moderation');
  }

  // Replace placeholder
  prompt = prompt.replace(/\{\{text\}\}/g, text.slice(0, 3000));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openai.textModel,
      messages: [
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || response.statusText;
    throw new Error(`OpenAI API error: ${errorMessage}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';

  // Parse JSON response
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const result = JSON.parse(jsonStr);
    return {
      is_approved: Boolean(result.is_approved),
      reason: result.reason || '',
    };
  } catch {
    // If parsing fails, reject with error reason
    return {
      is_approved: false,
      reason: 'Invalid JSON response from moderation LLM',
    };
  }
}

/**
 * Generate a catchy German title for an article cover image
 * Uses the /v1/chat/completions endpoint with gpt-4o-mini
 * @param {object} params
 * @param {string} params.description - Article description/text
 * @param {string} [params.tag] - Optional tag/category
 * @returns {Promise<string>} Generated title (max 50 chars, German)
 */
export async function generateTitle({ description, tag }) {
  const apiKey = config.openai.apiKey;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const systemPrompt = `Du bist ein Experte für prägnante deutsche Überschriften.
Erstelle eine einzige, aufmerksamkeitsstarke Überschrift für ein Artikelbild.
Regeln:
- Maximal 50 Zeichen
- Deutsch
- Keine Anführungszeichen
- Kein Punkt am Ende
- Kurz und prägnant
- Professionell und seriös`;

  const userPrompt = tag
    ? `Kategorie: ${tag}\n\nArtikelinhalt:\n${description.slice(0, 1000)}`
    : `Artikelinhalt:\n${description.slice(0, 1000)}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openai.textModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 60,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || response.statusText;
    throw new Error(`OpenAI API error: ${errorMessage}`);
  }

  const data = await response.json();
  const title = data.choices?.[0]?.message?.content?.trim() || '';
  
  // Ensure max 50 characters
  return title.slice(0, 50);
}
