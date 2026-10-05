const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
  validateUpload,
  computeSha256,
  sanitizeImageMetadata,
  sanitizeExtractedText,
  withTimeout
} = require('./security');
const { SCENARIOS, getScenarioImageBuffer } = require('./scenarios');
const { runDebatePipeline } = require('./debateEngine');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend from dist if built
const rootDistPath = path.join(__dirname, '..', 'dist');
const clientDistPath = fs.existsSync(rootDistPath) ? rootDistPath : path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}

// In-memory report cache for export / download
const reportCache = new Map();

// Configure Multer memory storage for secure processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB
});

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

/**
 * Health Check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'Receiving Manager PRD-3 DEBATE Engine',
    version: '3.2.0',
    security: {
      exifStripping: 'ACTIVE',
      sha256Hashing: 'ENFORCED',
      blindVerifierIsolation: 'STRICT',
      textSanitization: 'ENABLED'
    },
    uptime: process.uptime()
  });
});

/**
 * Get all 10 PRD Scenarios
 */
app.get('/api/scenarios', (req, res) => {
  const scenarioList = SCENARIOS.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    expectedVerdict: s.expectedVerdict,
    po: s.po
  }));

  res.json({
    success: true,
    total: scenarioList.length,
    scenarios: scenarioList
  });
});

/**
 * Get single scenario details including rendered image
 */
app.get('/api/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getScenarioImageBuffer(id);
    
    res.json({
      success: true,
      scenario: {
        id: result.scenario.id,
        name: result.scenario.name,
        category: result.scenario.category,
        description: result.scenario.description,
        expectedVerdict: result.scenario.expectedVerdict,
        po: result.scenario.po,
        visualMetadata: result.scenario.visualMetadata,
        imageDataUrl: result.dataUrl,
        sha256: result.sha256
      }
    });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

/**
 * Run DEBATE Verification Workflow on a PRD Scenario
 */
app.post('/api/verify/scenario/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const scenario = SCENARIOS.find(s => s.id === id);
    if (!scenario) {
      return res.status(404).json({ success: false, error: `Scenario ${id} not found.` });
    }

    // Generate scenario image & metadata
    const { pngBuffer, sha256, dataUrl } = await getScenarioImageBuffer(id);

    // Sanitize image metadata (EXIF/GPS stripping)
    const { cleanBuffer, rawHash, cleanHash } = await sanitizeImageMetadata(pngBuffer);

    // Merge custom PO override if user edited PO values in UI
    const userPoOverride = req.body.po || {};
    const po = {
      poNumber: sanitizeExtractedText(userPoOverride.poNumber || scenario.po.poNumber),
      vendor: sanitizeExtractedText(userPoOverride.vendor || scenario.po.vendor),
      expectedSku: sanitizeExtractedText(userPoOverride.expectedSku || scenario.po.expectedSku),
      productName: sanitizeExtractedText(userPoOverride.productName || scenario.po.productName),
      expectedQuantity: Number(userPoOverride.expectedQuantity) || scenario.po.expectedQuantity,
      expectedVariant: sanitizeExtractedText(userPoOverride.expectedVariant || scenario.po.expectedVariant),
      expectedComponents: userPoOverride.expectedComponents || scenario.po.expectedComponents,
      carrierTracking: sanitizeExtractedText(userPoOverride.carrierTracking || scenario.po.carrierTracking),
      notes: sanitizeExtractedText(userPoOverride.notes || scenario.po.notes)
    };

    // Run adversarial debate pipeline with timeout guard
    const report = await withTimeout(
      runDebatePipeline(po, cleanBuffer, cleanHash, rawHash, scenario.visualMetadata),
      25000,
      'Adversarial DEBATE Pipeline'
    );

    // Attach scenario id to report and cache
    report.scenarioId = id;
    reportCache.set(report.inspectionId, report);

    res.json({
      success: true,
      report
    });
  } catch (err) {
    console.error('Error running scenario verification:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Run DEBATE Verification Workflow on Custom Uploaded Image & PO
 */
app.post('/api/verify/custom', upload.single('photo'), async (req, res) => {
  try {
    let imageBuffer;
    let rawMime = 'image/png';

    if (req.file) {
      validateUpload(req.file);
      imageBuffer = req.file.buffer;
      rawMime = req.file.mimetype;
    } else if (req.body.imageDataUrl) {
      // Base64 upload fallback
      const base64Data = req.body.imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      return res.status(400).json({ success: false, error: 'No receiving photo uploaded.' });
    }

    // Security: Strip EXIF, GPS and calculate SHA-256 hashes
    const { cleanBuffer, rawHash, cleanHash } = await sanitizeImageMetadata(imageBuffer);

    // Sanitize user-provided PO inputs to prevent prompt injection
    const po = {
      poNumber: sanitizeExtractedText(req.body.poNumber || `PO-${Date.now().toString().slice(-6)}`),
      vendor: sanitizeExtractedText(req.body.vendor || 'Vendor Unknown'),
      expectedSku: sanitizeExtractedText(req.body.expectedSku || 'SKU-UNKNOWN'),
      productName: sanitizeExtractedText(req.body.productName || 'General Receiving Item'),
      expectedQuantity: Number(req.body.expectedQuantity) || 1,
      expectedVariant: sanitizeExtractedText(req.body.expectedVariant || 'Standard'),
      expectedComponents: req.body.expectedComponents ? JSON.parse(req.body.expectedComponents) : [],
      carrierTracking: sanitizeExtractedText(req.body.carrierTracking || ''),
      notes: sanitizeExtractedText(req.body.notes || '')
    };

    // Custom visual feature detection or inspection simulation
    const customVisualMeta = req.body.visualMeta ? JSON.parse(req.body.visualMeta) : null;

    // Run adversarial debate pipeline
    const report = await withTimeout(
      runDebatePipeline(po, cleanBuffer, cleanHash, rawHash, customVisualMeta),
      25000,
      'Custom DEBATE Verification Pipeline'
    );

    report.isCustomUpload = true;
    reportCache.set(report.inspectionId, report);

    res.json({
      success: true,
      report
    });
  } catch (err) {
    console.error('Error running custom verification:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Download / Export Structured Inspection Report (JSON or HTML)
 */
app.get('/api/report/:id', (req, res) => {
  const { id } = req.params;
  const report = reportCache.get(id);

  if (!report) {
    return res.status(404).json({ success: false, error: `Report ${id} not found or expired.` });
  }

  const format = req.query.format || 'json';

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${id}-DEBATE-evidence-report.json"`);
    return res.send(JSON.stringify(report, null, 2));
  }

  // Printable HTML Report
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>DEBATE Verification Report - ${report.inspectionId}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 30px; margin: 0; }
        .container { max-width: 900px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 32px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #334155; padding-bottom: 20px; }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: bold; font-size: 14px; }
        .badge-EXCEPTION { background: #7f1d1d; color: #fecaca; border: 1px solid #ef4444; }
        .badge-UNCERTAIN { background: #78350f; color: #fef3c7; border: 1px solid #f59e0b; }
        .badge-ACCEPT { background: #064e3b; color: #a7f3d0; border: 1px solid #10b981; }
        .section { margin-top: 24px; padding: 20px; background: #0f172a; border-radius: 8px; border: 1px solid #334155; }
        .claim-card { margin-top: 16px; padding: 16px; border-radius: 8px; border-left: 5px solid; background: #1e293b; }
        .claim-VERIFIED { border-color: #ef4444; }
        .claim-CHALLENGED { border-color: #f59e0b; }
        .claim-REJECTED { border-color: #10b981; }
        .role-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 12px; font-size: 12px; }
        .role-box { padding: 12px; border-radius: 6px; background: #0f172a; border: 1px solid #334155; }
        .crop-img { width: 100%; max-width: 220px; border-radius: 6px; border: 1px solid #475569; margin-top: 8px; }
        .hash { font-family: monospace; font-size: 11px; color: #94a3b8; word-break: break-all; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div>
            <h1 style="margin: 0 0 6px 0; font-size: 24px;">Receiving Manager — DEBATE Evidence Report</h1>
            <p style="margin: 0; color: #94a3b8; font-size: 13px;">Audit ID: ${report.inspectionId} • Generated: ${report.timestamp}</p>
          </div>
          <div>
            <span class="badge badge-${report.finalVerdict}">${report.finalVerdict}</span>
          </div>
        </div>

        <div class="section">
          <h3 style="margin-top: 0; color: #38bdf8;">1. Purchase Order Reference</h3>
          <p><strong>PO Number:</strong> ${report.poNumber} | <strong>Vendor:</strong> ${report.vendor}</p>
          <p><strong>Expected SKU:</strong> ${report.expectedSku} | <strong>Expected Qty:</strong> ${report.expectedQuantity}</p>
          <p><strong>Decision Rationale:</strong> ${report.decisionRationale}</p>
          <p><strong>Recommended Action:</strong> <code>${report.recommendedAction}</code></p>
        </div>

        <div class="section">
          <h3 style="margin-top: 0; color: #38bdf8;">2. Security & Cryptographic Proof</h3>
          <p><strong>Master Image SHA-256:</strong> <span class="hash">${report.securityAudit.cleanImageSha256}</span></p>
          <p><strong>Raw Upload SHA-256:</strong> <span class="hash">${report.securityAudit.rawImageSha256}</span></p>
          <p><strong>EXIF Metadata Stripped:</strong> ${report.securityAudit.metadataStripped ? 'YES (Sanitized)' : 'NO'}</p>
          <p><strong>Blind Verifier Isolation:</strong> STRICT ISOLATION ENFORCED (Zero Claim/PO Context Delivered)</p>
        </div>

        <div class="section">
          <h3 style="margin-top: 0; color: #38bdf8;">3. Debated Claims & Adversarial Verification</h3>
          ${report.debatedClaims.map(claim => `
            <div class="claim-card claim-${claim.status}">
              <div style="display: flex; justify-content: space-between;">
                <strong>${claim.claimId}: ${claim.claimTitle}</strong>
                <span class="badge badge-${claim.status}">${claim.status}</span>
              </div>
              <p style="font-size: 13px; color: #cbd5e1; margin: 8px 0;"><strong>Rationale:</strong> ${claim.classificationRationale}</p>

              <div class="role-grid">
                <div class="role-box">
                  <strong style="color: #f87171;">Prosecutor (Defect Advocate)</strong>
                  <p style="margin: 6px 0;">Confidence: <strong>${(claim.prosecutor.confidence * 100).toFixed(0)}%</strong></p>
                  <ul style="padding-left: 16px; margin: 0;">
                    ${claim.prosecutor.arguments.map(a => `<li>${a}</li>`).join('')}
                  </ul>
                </div>

                <div class="role-box">
                  <strong style="color: #38bdf8;">Defender (Counter-Analysis)</strong>
                  <p style="margin: 6px 0;">Stance: <strong>${claim.defender.stance}</strong></p>
                  <ul style="padding-left: 16px; margin: 0;">
                    ${claim.defender.arguments.map(a => `<li>${a}</li>`).join('')}
                  </ul>
                </div>

                <div class="role-box">
                  <strong style="color: #a78bfa;">Blind Verifier (Crop Only)</strong>
                  <p style="margin: 6px 0;">Confidence: <strong>${(claim.blindVerifier.observationalConfidence * 100).toFixed(0)}%</strong></p>
                  <ul style="padding-left: 16px; margin: 0;">
                    ${claim.blindVerifier.observations.map(o => `<li>${o}</li>`).join('')}
                  </ul>
                  ${claim.evidence && claim.evidence.cropBase64 ? `
                    <img class="crop-img" src="${claim.evidence.cropBase64}" alt="Blind Crop ROI" />
                    <div class="hash" style="margin-top: 4px;">Crop SHA-256: ${claim.evidence.cropHash.slice(0, 16)}...</div>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// SPA wildcard fallback
if (fs.existsSync(clientDistPath)) {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Start Express Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[DEBATE ENGINE] Server running securely on http://localhost:${PORT}`);
  });
}

module.exports = app;

