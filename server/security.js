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
 * Converts it to a clean PNG (scenario fixtures) or JPEG working copy (uploads, ≤2048 px long edge)
 * @param {Buffer} buffer - Raw uploaded image buffer
 * @param {string} format - Output format ('png' or 'jpeg')
 * @returns {Promise<{ cleanBuffer: Buffer, rawHash: string, cleanHash: string, metadataStripped: boolean, width: number, height: number }>}
 */
async function sanitizeImageMetadata(buffer, format = 'png') {
  const rawHash = computeSha256(buffer);

  // Decode first: the real format is checked from the bytes, not from the client-declared MIME.
  // An undecodable file is rejected (400) rather than passed on raw with its EXIF/GPS intact.
  let detected;
  try {
    detected = (await sharp(buffer).metadata()).format;
  } catch {
    detected = null;
  }
  if (!DECODED_FORMATS.includes(detected)) {
    throw badRequest('Uploaded file is not a decodable JPEG, PNG, WEBP or TIFF image.');
  }

  // Sharp removes all EXIF/GPS metadata when re-encoding unless .withMetadata() is specified
  const imagePipeline = sharp(buffer).rotate(); // auto-rotate based on EXIF before stripping
  const isJpeg = format === 'jpeg' || format === 'jpg';
  // JPEG = upload working copy: capped at WORKING_MAX_EDGE so reports and model calls stay small.
  // cleanHash is the hash of this working copy; rawHash stays the hash of the original upload bytes.
  const { data: cleanBuffer, info } = isJpeg
    ? await imagePipeline
        .resize({ width: WORKING_MAX_EDGE, height: WORKING_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 88 })
        .toBuffer({ resolveWithObject: true })
    : await imagePipeline.png({ compressionLevel: 8 }).toBuffer({ resolveWithObject: true });

  return {
    cleanBuffer,
    rawHash,
    cleanHash: computeSha256(cleanBuffer),
    metadataStripped: true,
    mimeType: isJpeg ? 'image/jpeg' : 'image/png',
    width: info.width,
    height: info.height
  };
}

const DECODED_FORMATS = ['jpeg', 'png', 'webp', 'tiff'];
const WORKING_MAX_EDGE = 2048;

/** Error carrying an HTTP 400 status for client-input problems. */
function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
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
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

module.exports = {
  badRequest,
  validateUpload,
  computeSha256,
  sanitizeImageMetadata,
  sanitizeExtractedText,
  withTimeout,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES
};
