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
  withTimeout,
  badRequest,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES
} = require('./security');
const { SCENARIOS, getScenarioImageBuffer } = require('./scenarios');
const { runDebatePipeline } = require('./debateEngine');
const { createVisionProvider } = require('./visionProvider');

const app = express();
const PORT = process.env.PORT || 3001;

// Vision model used for uploaded photos (null when ANTHROPIC_API_KEY is not set).
// Kept on app.locals so tests can substitute a provider.
app.locals.visionProvider = createVisionProvider();

// -------------------------------------------------------------
// Tenant resolution (Engineering Rule 1)
// The requesting organisation comes from the X-Org-Id header (or ?org= for links opened
// in a new window). This is application-level scoping: there is no user authentication,
// so the client asserts its organisation; every cached report is bound to the
// organisation that created it and is only returned to that organisation.
// -------------------------------------------------------------
const KNOWN_TENANTS = new Set(['org_demo_alpha', 'org_demo_bravo']);

function resolveTenant(req) {
  const value = req.get('x-org-id') || req.query.org;
  return typeof value === 'string' && KNOWN_TENANTS.has(value) ? value : null;
}

function requireTenant(req, res, next) {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    return res.status(400).json({ success: false, error: 'A valid organisation (X-Org-Id) is required.' });
  }
  req.tenantId = tenantId;
  next();
}

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Express 5 leaves req.body undefined for body-less requests; routes expect an object
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// Serve static frontend from dist if built
const rootDistPath = path.join(__dirname, '..', 'dist');
const clientDistPath = fs.existsSync(rootDistPath) ? rootDistPath : path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}

// In-memory report cache for export / download: inspectionId -> { orgId, report }
// ponytail: FIFO cap (reports carry MB-sized base64 images); persistent store if exports must outlive it
const REPORT_CACHE_MAX = 200;
const reportCache = new Map();

function cacheReport(orgId, report) {
  report.orgId = orgId;
  reportCache.set(report.inspectionId, { orgId, report });
  if (reportCache.size > REPORT_CACHE_MAX) reportCache.delete(reportCache.keys().next().value);
}

/** expectedComponents arrives as a JSON string (multipart) or an array (JSON body). → sanitised string[] */
function parseComponents(value) {
  if (value === undefined || value === null || value === '') return [];
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      throw badRequest('expectedComponents must be a JSON array of strings.');
    }
  }
  if (!Array.isArray(list) || list.length > 50 || !list.every((c) => typeof c === 'string')) {
    throw badRequest('expectedComponents must be an array of at most 50 strings.');
  }
  return list.map((c) => sanitizeExtractedText(c).slice(0, 200)).filter(Boolean);
}

/** Positive whole-unit quantity; `fallback` when not supplied. */
function parseQuantity(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw badRequest('expectedQuantity must be a positive whole number.');
  return n;
}

/**
 * Response helper for the verify routes. With `?stream=1` the response is NDJSON progress
 * events (each with `t` = ms since the request started) ending in exactly one
 * {"type":"report"} or {"type":"error"} line. Events emitted before `open()` are buffered,
 * so input validation can still answer with a plain JSON 400. Without `?stream=1` events are
 * dropped and the report is sent as JSON, as before.
 * `signal` aborts when the client disconnects before the response finished.
 */
function verifyResponse(req, res) {
  const t0 = Date.now();
  const streaming = req.query.stream === '1';
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  let opened = false;
  const pending = [];
  const write = (line) => {
    if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(line)}\n`);
  };
  const emit = (evt) => {
    if (!streaming) return;
    const line = { ...evt, t: Date.now() - t0 };
    if (opened) write(line);
    else pending.push(line);
  };
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    emit,
    open() {
      if (!streaming || opened) return;
      res.status(200).set({
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
      });
      res.flushHeaders();
      opened = true;
      pending.splice(0).forEach(write);
    },
    sendReport(report) {
      if (!opened) return res.json({ success: true, report });
      emit({ type: 'report', report });
      res.end();
    },
    /** Returns false when the error must be answered as a normal (non-streamed) response. */
    sendError(message) {
      if (!opened) return false;
      emit({ type: 'error', error: message });
      res.end();
      return true;
    }
  };
}

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
    vision: {
      configured: !!req.app.locals.visionProvider,
      model: req.app.locals.visionProvider ? req.app.locals.visionProvider.model : null
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
app.post('/api/verify/scenario/:id', requireTenant, async (req, res) => {
  const out = verifyResponse(req, res);
  try {
    const { id } = req.params;
    const scenario = SCENARIOS.find(s => s.id === id);
    if (!scenario) {
      return res.status(404).json({ success: false, error: `Scenario ${id} not found.` });
    }

    // Merge custom PO override if user edited PO values in UI
    const userPoOverride = req.body.po || {};
    const po = {
      poNumber: sanitizeExtractedText(userPoOverride.poNumber || scenario.po.poNumber),
      vendor: sanitizeExtractedText(userPoOverride.vendor || scenario.po.vendor),
      expectedSku: sanitizeExtractedText(userPoOverride.expectedSku || scenario.po.expectedSku),
      productName: sanitizeExtractedText(userPoOverride.productName || scenario.po.productName),
      expectedQuantity: parseQuantity(userPoOverride.expectedQuantity, scenario.po.expectedQuantity),
      expectedVariant: sanitizeExtractedText(userPoOverride.expectedVariant || scenario.po.expectedVariant),
      expectedComponents: userPoOverride.expectedComponents
        ? parseComponents(userPoOverride.expectedComponents)
        : scenario.po.expectedComponents,
      carrierTracking: sanitizeExtractedText(userPoOverride.carrierTracking || scenario.po.carrierTracking),
      notes: sanitizeExtractedText(userPoOverride.notes || scenario.po.notes)
    };

    // Generate the scenario image, then sanitize it (EXIF/GPS stripping); inputs are valid from here on
    out.emit({ type: 'stage', stage: 'PREPROCESS', status: 'started' });
    const { pngBuffer } = await getScenarioImageBuffer(id);
    const { cleanBuffer, rawHash, cleanHash, width, height } = await sanitizeImageMetadata(pngBuffer);
    out.open();
    out.emit({ type: 'stage', stage: 'PREPROCESS', status: 'done', imageSha256: cleanHash, width, height });

    // Run adversarial debate pipeline with timeout guard
    const report = await withTimeout(
      runDebatePipeline(po, cleanBuffer, cleanHash, rawHash, scenario.visualMetadata, { onEvent: out.emit }),
      25000,
      'Adversarial DEBATE Pipeline'
    );

    // Attach scenario id to report and cache it for the requesting organisation
    report.scenarioId = id;
    cacheReport(req.tenantId, report);

    out.sendReport(report);
  } catch (err) {
    if (out.sendError(err.message)) return;
    if (err.statusCode === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('Error running scenario verification:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Run DEBATE Verification Workflow on Custom Uploaded Image & PO
 */
app.post('/api/verify/custom', requireTenant, upload.single('photo'), async (req, res) => {
  const out = verifyResponse(req, res);
  try {
    let imageBuffer;
    let rawMime = 'image/png';

    if (req.file) {
      try {
        validateUpload(req.file);
      } catch (e) {
        throw badRequest(e.message);
      }
      imageBuffer = req.file.buffer;
      rawMime = req.file.mimetype;
    } else if (req.body.imageDataUrl) {
      // Base64 upload fallback: same MIME whitelist and size limit as multipart uploads
      // (the decoded content's real format is then checked by sanitizeImageMetadata)
      const match = typeof req.body.imageDataUrl === 'string' && req.body.imageDataUrl.match(/^data:([\w/+.-]+);base64,(.*)$/s);
      if (!match || !ALLOWED_MIME_TYPES.includes(match[1])) {
        throw badRequest('imageDataUrl must be a base64 data URL of a JPEG, PNG, WEBP or TIFF image.');
      }
      imageBuffer = Buffer.from(match[2], 'base64');
      rawMime = match[1];
      if (imageBuffer.length > MAX_FILE_SIZE_BYTES) throw badRequest('Image exceeds max limit of 15MB.');
    } else {
      return res.status(400).json({ success: false, error: 'No receiving photo uploaded.' });
    }

    // Sanitize user-provided PO inputs to prevent prompt injection. Nothing is invented: an empty
    // field stays empty ("no requirement"), so the agent never compares the photo with made-up values.
    const expectedSku = sanitizeExtractedText(req.body.expectedSku || '');
    if (!expectedSku) throw badRequest('expectedSku is required: the SKU on the purchase order.');
    const po = {
      poNumber: sanitizeExtractedText(req.body.poNumber || ''),
      vendor: sanitizeExtractedText(req.body.vendor || ''),
      expectedSku,
      productName: sanitizeExtractedText(req.body.productName || ''),
      expectedQuantity: parseQuantity(req.body.expectedQuantity, 1),
      expectedVariant: sanitizeExtractedText(req.body.expectedVariant || ''),
      expectedComponents: parseComponents(req.body.expectedComponents),
      carrierTracking: sanitizeExtractedText(req.body.carrierTracking || ''),
      notes: sanitizeExtractedText(req.body.notes || '')
    };

    // Security: decode check, strip EXIF/GPS, cap to a <=2048 px JPEG working copy, SHA-256 hashes
    out.emit({ type: 'stage', stage: 'PREPROCESS', status: 'started' });
    const { cleanBuffer, rawHash, cleanHash, width, height } = await sanitizeImageMetadata(imageBuffer, 'jpeg');
    out.open(); // all input validation (400s) is done; streaming may start
    out.emit({ type: 'stage', stage: 'PREPROCESS', status: 'done', imageSha256: cleanHash, width, height });

    // Observations for an uploaded photo come only from the vision model. Client-supplied
    // "visualMeta" is deliberately ignored: accepting it would let a caller fabricate
    // visual verification. Without a provider the engine reports
    // VISUAL_VERIFICATION_UNAVAILABLE → UNCERTAIN.
    const visionProvider = req.app.locals.visionProvider;
    const pipelineTimeoutMs = visionProvider
      ? Number(process.env.VISION_PIPELINE_TIMEOUT_MS) || 150000
      : 25000;

    let report;
    let live = true; // events from an abandoned (timed-out) pipeline are not forwarded
    try {
      report = await withTimeout(
        runDebatePipeline(po, cleanBuffer, cleanHash, rawHash, null, {
          visionProvider,
          signal: out.signal,
          onEvent: (evt) => live && out.emit(evt)
        }),
        pipelineTimeoutMs,
        'Vision inspection pipeline'
      );
    } catch (pipelineErr) {
      live = false;
      out.abort(); // cancel model calls still running in the abandoned pipeline
      // Rule 3 — fail open: the capture is still processed and returned as an UNCERTAIN,
      // INCOMPLETE inspection with the failure reason; it is never treated as a pass.
      console.error('Vision inspection failed; returning fail-open result:', pipelineErr);
      report = await runDebatePipeline(po, cleanBuffer, cleanHash, rawHash, null, {
        unavailableReason: pipelineErr.message,
        unavailableKind: /timed out/i.test(pipelineErr.message) ? 'TIMEOUT' : 'PIPELINE_ERROR',
        failedMode: visionProvider ? 'VISION_MODEL' : 'NONE',
        onEvent: out.emit
      });
    }

    report.isCustomUpload = true;
    cacheReport(req.tenantId, report);

    out.sendReport(report);
  } catch (err) {
    if (out.sendError(err.message)) return;
    if (err.statusCode === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('Error running custom verification:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Download / Export Structured Inspection Report (JSON or HTML)
 */
app.get('/api/report/:id', requireTenant, (req, res) => {
  const { id } = req.params;
  const entry = reportCache.get(id);

  // Owner check: a report is only returned to the organisation that created it.
  // Unknown IDs and other organisations' reports get the same generic 404, so the
  // response reveals neither contents nor whether the ID exists.
  if (!entry || entry.orgId !== req.tenantId) {
    return res.status(404).json({ success: false, error: 'Report not found.' });
  }
  const report = entry.report;

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
          <h3 style="margin-top: 0; color: #38bdf8;">2. Evidence integrity &amp; verification status</h3>
          <p><strong>Sanitised image SHA-256 content hash:</strong> <span class="hash">${report.securityAudit.cleanImageSha256}</span></p>
          <p><strong>Raw upload SHA-256 content hash:</strong> <span class="hash">${report.securityAudit.rawImageSha256}</span></p>
          <p><strong>EXIF Metadata Stripped:</strong> ${report.securityAudit.metadataStripped ? 'YES (Sanitized)' : 'NO'}</p>
          <p><strong>Verification:</strong> ${report.verification ? `${report.verification.status} (${report.verification.mode}${report.verification.model ? `, ${report.verification.model}` : ''})` : 'n/a'}</p>
          ${report.verification && report.verification.reasons && report.verification.reasons.length ? `<p><strong>Not completed because:</strong> ${report.verification.reasons.map((r) => `${r.stage}: ${r.reason}`).join('; ')}</p>` : ''}
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

// JSON errors for the API (e.g. multer file-size limit → 400 instead of an HTML 500)
app.use((err, req, res, next) => {
  if (!req.path.startsWith('/api')) return next(err);
  const status = err instanceof multer.MulterError || err.type === 'entity.too.large' ? 400 : err.statusCode || 500;
  res.status(status).json({ success: false, error: err.message });
});

// Start Express Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[DEBATE ENGINE] Server running securely on http://localhost:${PORT}`);
  });
}

module.exports = app;

