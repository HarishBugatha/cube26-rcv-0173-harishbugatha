const crypto = require('crypto');
const sharp = require('sharp');

/**
 * Security Preprocessing Utilities for Receiving Manager (PRD-3 DEBATE)
 * 
 * 1. Upload Validation (MIME type whitelist, size limits)
 * 2. EXIF / GPS Metadata Stripping
 * 3. Cryptographic SHA-256 Hashing of raw and processed images
 * 4. Image Text Sanitization (Untrusted OCR/Text Defense against prompt injection)
 * 5. Rate Limiting & Timeout Guardrails
 */

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

/**
 * Validates uploaded file MIME type and size
 * @param {Object} file - Multer file object or buffer metadata
 */
function validateUpload(file) {
  if (!file) {
    throw new Error('No file provided for upload.');
  }
  
  if (file.size && file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size ${(file.size / (1024 * 1024)).toFixed(2)}MB exceeds max limit of 15MB.`);
  }

  const mime = file.mimetype || file.type;
  if (!ALLOWED_MIME_TYPES.includes(mime)) {
    throw new Error(`Invalid file type "${mime}". Only JPEG, PNG, WEBP, and TIFF are supported.`);
  }

  return true;
}

/**
 * Computes SHA-256 hash of a buffer
 * @param {Buffer} buffer 
 * @returns {string} Hex-encoded SHA-256 hash
 */
function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Strips all EXIF, GPS, IPTC, and location metadata from an image buffer
 * Converts it to a clean PNG/JPEG buffer without metadata tags
 * @param {Buffer} buffer - Raw uploaded image buffer
 * @param {string} format - Output format ('png' or 'jpeg')
 * @returns {Promise<{ cleanBuffer: Buffer, rawHash: string, cleanHash: string, metadataStripped: boolean }>}
 */
async function sanitizeImageMetadata(buffer, format = 'png') {
  const rawHash = computeSha256(buffer);
  
  try {
    // Sharp automatically removes all EXIF/GPS metadata when re-encoding unless .withMetadata() is specified
    let imagePipeline = sharp(buffer).rotate(); // auto-rotate based on EXIF before stripping
    
    let cleanBuffer;
    if (format === 'jpeg' || format === 'jpg') {
      cleanBuffer = await imagePipeline.jpeg({ quality: 92 }).toBuffer();
    } else {
      cleanBuffer = await imagePipeline.png({ compressionLevel: 8 }).toBuffer();
    }

    const cleanHash = computeSha256(cleanBuffer);

    return {
      cleanBuffer,
      rawHash,
      cleanHash,
      metadataStripped: true,
      mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png'
    };
  } catch (err) {
    console.warn('Sharp metadata sanitization warning, fallback to buffer:', err.message);
    return {
      cleanBuffer: buffer,
      rawHash,
      cleanHash: rawHash,
      metadataStripped: false,
      mimeType: 'image/jpeg'
    };
  }
}

/**
 * Defense-in-depth: Treat all text read from images / OCR as untrusted data
 * Neutralizes potential prompt injection markers, instruction overrides,
 * markdown escapes, script tags, and delimiter exploits.
 * @param {string} text - Raw OCR / extracted text
 * @returns {string} Sanitized, safe text string
 */
function sanitizeExtractedText(text) {
  if (typeof text !== 'string') return '';

  return text
    // Neutralize overt prompt injection attacks
    .replace(/(?:ignore\s+previous\s+instructions|system\s+override|bypass\s+quarantine|jailbreak|disregard\s+all\s+prior)/gi, '[REDACTED_PROMPT_INJECTION]')
    // Strip control characters & null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Replace HTML/XML tag characters
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Neutralize template delimiters and prompt injection keywords
    .replace(/\{\{/g, '&#123;&#123;')
    .replace(/\}\}/g, '&#125;&#125;')
    .replace(/```/g, "'''")
    // Trim excessive whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Timeout promise wrapper for model and network calls
 * @param {Promise} promise 
 * @param {number} timeoutMs 
 * @param {string} operationName 
 */
function withTimeout(promise, timeoutMs = 15000, operationName = 'Operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

module.exports = {
  validateUpload,
  computeSha256,
  sanitizeImageMetadata,
  sanitizeExtractedText,
  withTimeout,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES
};
