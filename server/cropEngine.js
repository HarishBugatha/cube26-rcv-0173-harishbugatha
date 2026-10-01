const sharp = require('sharp');
const { computeSha256 } = require('./security');

/**
 * Crop Engine for PRD-3 DEBATE Adversarial Verification
 * 
 * Provides:
 * 1. Precision bounding box cropping for the isolated Blind Verifier.
 * 2. Visual evidence bounding box overlays for inspector review.
 * 3. Cryptographic SHA-256 hashes of visual crops.
 */

/**
 * Extracts a cropped ROI from an image buffer based on normalized bounding box [ymin, xmin, ymax, xmax]
 * @param {Buffer} imageBuffer - Clean image buffer
 * @param {Array<number>} bbox - [ymin, xmin, ymax, xmax] normalized (0 to 1)
 * @param {number} paddingPercent - optional padding percentage (e.g. 0.05 for 5%)
 * @returns {Promise<{ cropBuffer: Buffer, cropBase64: string, cropHash: string, pixelCoords: Object }>}
 */
async function extractCrop(imageBuffer, bbox, paddingPercent = 0.04) {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 800;
  const height = metadata.height || 600;

  let [ymin, xmin, ymax, xmax] = bbox;

  // Clamp normalized coordinates
  ymin = Math.max(0, Math.min(1, ymin));
  xmin = Math.max(0, Math.min(1, xmin));
  ymax = Math.max(ymin + 0.01, Math.min(1, ymax));
  xmax = Math.max(xmin + 0.01, Math.min(1, xmax));

  // Add padding
  const boxW = xmax - xmin;
  const boxH = ymax - ymin;
  const padX = boxW * paddingPercent;
  const padY = boxH * paddingPercent;

  const paddedXmin = Math.max(0, xmin - padX);
  const paddedYmin = Math.max(0, ymin - padY);
  const paddedXmax = Math.min(1, xmax + padX);
  const paddedYmax = Math.min(1, ymax + padY);

  const left = Math.round(paddedXmin * width);
  const top = Math.round(paddedYmin * height);
  const extractWidth = Math.max(10, Math.min(width - left, Math.round((paddedXmax - paddedXmin) * width)));
  const extractHeight = Math.max(10, Math.min(height - top, Math.round((paddedYmax - paddedYmin) * height)));

  const cropBuffer = await sharp(imageBuffer)
    .extract({ left, top, width: extractWidth, height: extractHeight })
    .png()
    .toBuffer();

  const cropHash = computeSha256(cropBuffer);
  const cropBase64 = `data:image/png;base64,${cropBuffer.toString('base64')}`;

  return {
    cropBuffer,
    cropBase64,
    cropHash,
    pixelCoords: {
      left,
      top,
      width: extractWidth,
      height: extractHeight,
      imageWidth: width,
      imageHeight: height
    }
  };
}

/**
 * Creates an annotated image with colored bounding boxes and claim tags
 * @param {Buffer} imageBuffer 
 * @param {Array<Object>} claims - list of claims with { bbox, label, status }
 * @returns {Promise<{ annotatedBase64: string, annotatedBuffer: Buffer }>}
 */
async function generateAnnotatedImage(imageBuffer, claims = []) {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 800;
  const height = metadata.height || 600;

  if (!claims || claims.length === 0) {
    const annotatedBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    return { annotatedBase64, annotatedBuffer: imageBuffer };
  }

  // Build SVG overlay for bounding boxes
  const svgRects = claims.map((claim, index) => {
    if (!claim.bbox || claim.bbox.length < 4) return '';

    const [ymin, xmin, ymax, xmax] = claim.bbox;
    const x = Math.round(xmin * width);
    const y = Math.round(ymin * height);
    const w = Math.round((xmax - xmin) * width);
    const h = Math.round((ymax - ymin) * height);

    let color = '#ef4444'; // Red for VERIFIED / FAIL
    let bgColor = 'rgba(239, 68, 68, 0.2)';
    let badgeColor = '#ef4444';

    if (claim.status === 'REJECTED') {
      color = '#10b981'; // Green for REJECTED defect (Clean)
      bgColor = 'rgba(16, 185, 129, 0.15)';
      badgeColor = '#10b981';
    } else if (claim.status === 'CHALLENGED') {
      color = '#f59e0b'; // Amber for CHALLENGED / UNCERTAIN
      bgColor = 'rgba(245, 158, 11, 0.2)';
      badgeColor = '#f59e0b';
    }

    const labelText = `${claim.id || `C${index+1}`}: ${claim.type || 'DEFECT'}`;

    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bgColor}" stroke="${color}" stroke-width="3" stroke-dasharray="${claim.status === 'CHALLENGED' ? '6,4' : 'none'}" rx="4" />
        <rect x="${x}" y="${Math.max(0, y - 24)}" width="${Math.min(w, labelText.length * 9 + 16)}" height="22" fill="${badgeColor}" rx="3" />
        <text x="${x + 8}" y="${Math.max(14, y - 8)}" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="bold">${labelText}</text>
      </g>
    `;
  }).join('');

  const svgOverlay = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${svgRects}
    </svg>
  `;

  const annotatedBuffer = await sharp(imageBuffer)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .png()
    .toBuffer();

  const annotatedBase64 = `data:image/png;base64,${annotatedBuffer.toString('base64')}`;

  return {
    annotatedBuffer,
    annotatedBase64
  };
}

module.exports = {
  extractCrop,
  generateAnnotatedImage
};
