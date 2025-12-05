import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to register system fonts for better German character support
const fontPaths = [
  '/System/Library/Fonts/Helvetica.ttc',
  '/System/Library/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

for (const fontPath of fontPaths) {
  if (existsSync(fontPath)) {
    try {
      GlobalFonts.registerFromPath(fontPath, 'SystemFont');
      break;
    } catch {
      // Font registration failed, continue to next
    }
  }
}

/**
 * Overlay configuration
 */
const OVERLAY_CONFIG = {
  // Text colors
  titleColor: '#0F172A',
  tagColor: '#475569',
  
  // Fonts
  titleFontSize: 78,
  tagFontSize: 46,
  fontFamily: 'SystemFont, Helvetica, Arial, sans-serif',
  
  // Positioning (left side, avoiding logo area at top)
  paddingX: 40,
  paddingYMin: 80, // minimal top/bottom padding
  maxWidth: 450, // Max width for text block
  lineHeight: 1.3,
  
  // Box padding
  boxPadding: 24,
  boxRadius: 12,
};

/**
 * Word wrap text to fit within maxWidth
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to wrap
 * @param {number} maxWidth - Maximum width
 * @returns {string[]} Array of lines
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Render title and tag overlay on an image
 * @param {object} params
 * @param {Buffer} params.imageBuffer - Source image as Buffer
 * @param {string} params.title - Title text to overlay
 * @param {string} params.tag - Tag text to overlay
 * @returns {Promise<Buffer>} Image with overlay as PNG Buffer
 */
export async function renderOverlay({ imageBuffer, title, tag }) {
  // Load the source image
  const image = await loadImage(imageBuffer);
  const { width, height } = image;
  
  // Create canvas with same dimensions
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Draw the original image
  ctx.drawImage(image, 0, 0);
  
  // Set up title font and measure
  ctx.font = `bold ${OVERLAY_CONFIG.titleFontSize}px ${OVERLAY_CONFIG.fontFamily}`;
  const titleLines = wrapText(ctx, title, OVERLAY_CONFIG.maxWidth - OVERLAY_CONFIG.boxPadding * 2);
  
  // Set up tag font and measure
  ctx.font = `${OVERLAY_CONFIG.tagFontSize}px ${OVERLAY_CONFIG.fontFamily}`;
  const tagLines = wrapText(ctx, tag, OVERLAY_CONFIG.maxWidth - OVERLAY_CONFIG.boxPadding * 2);
  
  // Calculate box dimensions
  const titleLineHeight = OVERLAY_CONFIG.titleFontSize * OVERLAY_CONFIG.lineHeight;
  const tagLineHeight = OVERLAY_CONFIG.tagFontSize * OVERLAY_CONFIG.lineHeight;
  
  const titleHeight = titleLines.length * titleLineHeight;
  const tagHeight = tagLines.length * tagLineHeight;
  const gapBetween = 16;
  
  const boxHeight = OVERLAY_CONFIG.boxPadding * 2 + titleHeight + gapBetween + tagHeight;
  const boxWidth = OVERLAY_CONFIG.maxWidth;
  const boxX = OVERLAY_CONFIG.paddingX;
  // Center vertically, but keep minimal padding from top/bottom
  const centeredY = (height - boxHeight) / 2;
  const maxY = height - OVERLAY_CONFIG.paddingYMin - boxHeight;
  const boxY = Math.max(OVERLAY_CONFIG.paddingYMin, Math.min(centeredY, maxY));
  
  // Draw title text (no background, directly on image)
  ctx.font = `bold ${OVERLAY_CONFIG.titleFontSize}px ${OVERLAY_CONFIG.fontFamily}`;
  ctx.fillStyle = OVERLAY_CONFIG.titleColor;
  ctx.textBaseline = 'top';
  
  let textY = boxY + OVERLAY_CONFIG.boxPadding;
  for (const line of titleLines) {
    ctx.fillText(line, boxX + OVERLAY_CONFIG.boxPadding, textY);
    textY += titleLineHeight;
  }
  
  // Draw tag text
  textY += gapBetween - (titleLineHeight - OVERLAY_CONFIG.titleFontSize); // Adjust gap
  ctx.font = `${OVERLAY_CONFIG.tagFontSize}px ${OVERLAY_CONFIG.fontFamily}`;
  ctx.fillStyle = OVERLAY_CONFIG.tagColor;
  
  for (const line of tagLines) {
    ctx.fillText(`#${line}`, boxX + OVERLAY_CONFIG.boxPadding, textY);
    textY += tagLineHeight;
  }
  
  // Return as PNG buffer
  return canvas.toBuffer('image/png');
}

/**
 * Check if canvas is available
 * @returns {boolean}
 */
export function isCanvasAvailable() {
  try {
    const testCanvas = createCanvas(1, 1);
    return !!testCanvas;
  } catch {
    return false;
  }
}
