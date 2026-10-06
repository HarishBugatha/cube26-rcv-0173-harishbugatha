const sharp = require('sharp');
const AnthropicModule = require('@anthropic-ai/sdk');

const Anthropic = AnthropicModule.default || AnthropicModule;

/**
 * Vision provider for the PRD-3 DEBATE roles, backed by the Claude API.
 *
 * Each role is one Messages API call with an image and a JSON-schema output:
 *   - Prosecutor  : full photo + PO expected values -> observed features + findings
 *   - Defender    : full photo + candidate findings -> counter-arguments per finding
 *   - Blind Verifier: ONE cropped patch + a fixed, context-free task -> independent observations
 *
 * Every call is bounded by a hard timeout. Errors, timeouts, refusals, truncation and
 * malformed/incomplete JSON are raised as VisionError so the pipeline can fail open
 * (record kept, verdict UNCERTAIN) instead of reporting a match.
 */

const DEFAULT_MODEL = 'claude-opus-5-5';
const DEFAULT_TIMEOUT_MS = 45000;
const MAX_IMAGE_EDGE = 1568;

class VisionError extends Error {
  constructor(stage, kind, message) {
    super(message);
    this.name = 'VisionError';
    this.stage = stage;
    this.kind = kind; // TIMEOUT | API_ERROR | INCOMPLETE_RESPONSE | REFUSED | NOT_CONFIGURED
  }
}

// Fixed task text sent to the Blind Verifier. It never contains PO values, claim text
// or other roles' reasoning; it is stored with each finding as proof of isolation.
const BLIND_VERIFIER_TASK =
  'You are given a single cropped image patch and no other information. ' +
  'Describe only what is physically visible in this patch: objects, surfaces, any printed text you can read, ' +
  'how many separate product units are visible, how many empty slots or cavities are visible, and any damage ' +
  '(crushing, water marks, tears). Say whether anything looks abnormal. If the patch is too blurry, dark, ' +
  'occluded or glared to judge, say so and use UNCLEAR. Do not guess.';

const PROSECUTOR_SYSTEM =
  'You are the Prosecutor in a warehouse receiving inspection. You look for every way the delivered goods ' +
  'in the photo differ from the purchase order. Report only what is actually visible in the photo. ' +
  'If something cannot be determined from the photo, mark it as not determinable instead of guessing. ' +
  'Bounding boxes are normalised [ymin, xmin, ymax, xmax] with values between 0 and 1.';

const DEFENDER_SYSTEM =
  'You are the Defender in a warehouse receiving inspection. For each finding raised against the delivery, ' +
  'look at the full photo and argue any innocent explanation (glare, reflections, lighting colour casts, ' +
  'packaging folds, stacked layers, camera angle). Concede the finding when no reasonable innocent ' +
  'explanation exists. Base every argument on what is visible.';

const BLIND_SYSTEM =
  'You are an independent visual inspector. Report only what is visible in the image patch you receive.';

const CHECKS = ['QUANTITY', 'SKU', 'VARIANT', 'PACKAGING', 'COMPONENTS'];

const PROSECUTOR_SCHEMA = {
  type: 'object',
  properties: {
    image_usable: { type: 'boolean' },
    unusable_reason: { type: 'string' },
    items_count_determinable: { type: 'boolean' },
    items_detected: { type: 'integer' },
    sku_label_readable: { type: 'boolean' },
    detected_sku: { type: 'string' },
    variant_determinable: { type: 'boolean' },
    detected_variant: { type: 'string' },
    packaging_status: { type: 'string', enum: ['INTACT', 'CRUSHED', 'WATER_DAMAGED', 'TORN', 'UNCLEAR'] },
    missing_components: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          check: { type: 'string', enum: CHECKS },
          bbox: { type: 'array', items: { type: 'number' } },
          description: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['check', 'bbox', 'description', 'confidence'],
        additionalProperties: false,
      },
    },
    overall_confidence: { type: 'number' },
  },
  required: [
    'image_usable',
    'unusable_reason',
    'items_count_determinable',
    'items_detected',
    'sku_label_readable',
    'detected_sku',
    'variant_determinable',
    'detected_variant',
    'packaging_status',
    'missing_components',
    'findings',
    'overall_confidence',
  ],
  additionalProperties: false,
};

const DEFENDER_SCHEMA = {
  type: 'object',
  properties: {
    responses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim_id: { type: 'string' },
          stance: { type: 'string', enum: ['CONCEDE_DEFECT', 'VALID_CHALLENGE', 'WEAK_CHALLENGE', 'SUPPORT_CLEAN'] },
          arguments: { type: 'array', items: { type: 'string' } },
          plausibility: { type: 'number' },
        },
        required: ['claim_id', 'stance', 'arguments', 'plausibility'],
        additionalProperties: false,
      },
    },
  },
  required: ['responses'],
  additionalProperties: false,
};

const BLIND_SCHEMA = {
  type: 'object',
  properties: {
    observations: { type: 'array', items: { type: 'string' } },
    visible_text: { type: 'string' },
    units_count_determinable: { type: 'boolean' },
    units_visible: { type: 'integer' },
    empty_slots_visible: { type: 'integer' },
    damage: { type: 'string', enum: ['NONE', 'CRUSHING', 'WATER', 'TEAR', 'OTHER', 'UNCLEAR'] },
    anomaly_present: { type: 'string', enum: ['YES', 'NO', 'UNCLEAR'] },
    confidence: { type: 'number' },
  },
  required: [
    'observations',
    'visible_text',
    'units_count_determinable',
    'units_visible',
    'empty_slots_visible',
    'damage',
    'anomaly_present',
    'confidence',
  ],
  additionalProperties: false,
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isConfidence = (v) => isNum(v) && v >= 0 && v <= 1;

function assertShape(stage, ok, what) {
  if (!ok) throw new VisionError(stage, 'INCOMPLETE_RESPONSE', `Incomplete model response: ${what}`);
}

function validateProsecutor(r) {
  const s = 'PROSECUTOR';
  assertShape(s, r && typeof r === 'object', 'not an object');
  for (const k of ['image_usable', 'items_count_determinable', 'sku_label_readable', 'variant_determinable']) {
    assertShape(s, typeof r[k] === 'boolean', `${k} missing`);
  }
  assertShape(s, Number.isInteger(r.items_detected) && r.items_detected >= 0, 'items_detected invalid');
  assertShape(s, typeof r.detected_sku === 'string' && typeof r.detected_variant === 'string', 'sku/variant missing');
  assertShape(s, ['INTACT', 'CRUSHED', 'WATER_DAMAGED', 'TORN', 'UNCLEAR'].includes(r.packaging_status), 'packaging_status invalid');
  assertShape(s, Array.isArray(r.missing_components) && r.missing_components.every((c) => typeof c === 'string'), 'missing_components invalid');
  assertShape(s, Array.isArray(r.findings), 'findings missing');
  r.findings.forEach((f) => {
    assertShape(s, f && CHECKS.includes(f.check) && typeof f.description === 'string' && isConfidence(f.confidence), 'finding invalid');
  });
  assertShape(s, isConfidence(r.overall_confidence), 'overall_confidence invalid');
  return r;
}

function validateDefender(r, claimIds) {
  const s = 'DEFENDER';
  assertShape(s, r && Array.isArray(r.responses), 'responses missing');
  r.responses.forEach((x) => {
    assertShape(s, typeof x.claim_id === 'string' && Array.isArray(x.arguments) && isConfidence(x.plausibility), 'response invalid');
  });
  claimIds.forEach((id) => {
    assertShape(s, r.responses.some((x) => x.claim_id === id), `no response for ${id}`);
  });
  return r;
}

function validateBlind(r) {
  const s = 'BLIND_VERIFIER';
  assertShape(s, r && Array.isArray(r.observations) && r.observations.length > 0, 'observations missing');
  assertShape(s, ['YES', 'NO', 'UNCLEAR'].includes(r.anomaly_present), 'anomaly_present invalid');
  assertShape(s, isConfidence(r.confidence), 'confidence invalid');
  assertShape(s, typeof r.units_count_determinable === 'boolean' && Number.isInteger(r.units_visible), 'unit count invalid');
  return r;
}

/** Normalised bbox or null when the model's box is unusable. */
function normaliseBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((v) => isNum(v) && v >= 0 && v <= 1)) return null;
  const [ymin, xmin, ymax, xmax] = bbox;
  if (ymax <= ymin || xmax <= xmin) return null;
  return [ymin, xmin, ymax, xmax];
}

function describeError(stage, err, timeoutMs) {
  if (err instanceof VisionError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new VisionError(stage, 'API_ERROR', 'Vision model authentication failed (check ANTHROPIC_API_KEY).');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new VisionError(stage, 'API_ERROR', 'Vision model rate limit reached.');
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new VisionError(stage, 'TIMEOUT', `Vision model call timed out after ${timeoutMs} ms.`);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new VisionError(stage, 'API_ERROR', 'Could not connect to the vision model API.');
  }
  if (err instanceof Anthropic.APIError) {
    return new VisionError(stage, 'API_ERROR', `Vision model API error${err.status ? ` (HTTP ${err.status})` : ''}.`);
  }
  return new VisionError(stage, 'API_ERROR', `Vision model call failed: ${err && err.message ? err.message : String(err)}`);
}

async function toImageBlock(buffer) {
  // Downscale to the recommended long edge and send as PNG
  const png = await sharp(buffer)
    .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } };
}

/**
 * Create the provider, or return null when no vision model is configured.
 * `client` can be injected (tests); production uses the official SDK client.
 */
function createVisionProvider(options = {}) {
  const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.ANTHROPIC_API_KEY;
  if (!options.client && !apiKey) return null;

  const model = options.model || process.env.VISION_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(options.timeoutMs || process.env.VISION_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const client = options.client || new Anthropic({ apiKey, maxRetries: 1 });

  async function callJson(stage, system, content, schema) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new VisionError(stage, 'TIMEOUT', `Vision model call timed out after ${timeoutMs} ms.`)),
        timeoutMs
      );
    });

    let response;
    try {
      response = await Promise.race([
        client.beta.messages.create(
          {
            model,
            max_tokens: 16000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system,
            output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
            messages: [{ role: 'user', content }],
          },
          { timeout: timeoutMs }
        ),
        timeout,
      ]);
    } catch (err) {
      throw describeError(stage, err, timeoutMs);
    } finally {
      clearTimeout(timer);
    }

    if (!response || typeof response !== 'object') {
      throw new VisionError(stage, 'INCOMPLETE_RESPONSE', 'Empty response from vision model.');
    }
    if (response.stop_reason === 'refusal') {
      throw new VisionError(stage, 'REFUSED', 'The vision model declined to assess this image.');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new VisionError(stage, 'INCOMPLETE_RESPONSE', 'Vision model response was truncated.');
    }
    const text = (response.content || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      return JSON.parse(text);
    } catch {
      throw new VisionError(stage, 'INCOMPLETE_RESPONSE', 'Vision model response was not valid JSON.');
    }
  }

  return {
    model,
    timeoutMs,
    blindVerifierTask: BLIND_VERIFIER_TASK,

    /** Prosecutor: full photo + PO -> observed features and located findings. */
    async prosecute(imageBuffer, po) {
      const poText = [
        `Purchase order: ${po.poNumber}`,
        `Expected SKU: ${po.expectedSku}`,
        `Product: ${po.productName || ''}`,
        `Expected quantity (units): ${Number(po.expectedQuantity) || 1}`,
        `Expected variant / spec: ${po.expectedVariant || ''}`,
        `Expected kit components: ${(po.expectedComponents || []).join(', ') || 'none listed'}`,
      ].join('\n');
      const content = [
        await toImageBlock(imageBuffer),
        {
          type: 'text',
          text:
            `${poText}\n\nInspect the receiving photo against this purchase order. Count the product units ` +
            'visible, read the SKU / label if legible, identify the variant, assess packaging condition and list ' +
            'any expected kit components that are visibly missing. Add one finding with a bounding box for every ' +
            'difference from the purchase order. Set the *_determinable / *_readable flags to false when the photo ' +
            'does not show enough to decide (then use 0 or an empty string for the value).',
        },
      ];
      return validateProsecutor(await callJson('PROSECUTOR', PROSECUTOR_SYSTEM, content, PROSECUTOR_SCHEMA));
    },

    /** Defender: full photo + findings (no PO values beyond what the findings state). */
    async defend(imageBuffer, claims) {
      const list = claims
        .map((c) => `- ${c.id} [${c.type}]: ${c.title}. Observed: ${c.physicalObserved}`)
        .join('\n');
      const content = [
        await toImageBlock(imageBuffer),
        { type: 'text', text: `Findings raised against this delivery:\n${list}\n\nRespond to every finding by claim_id.` },
      ];
      return validateDefender(
        await callJson('DEFENDER', DEFENDER_SYSTEM, content, DEFENDER_SCHEMA),
        claims.map((c) => c.id)
      );
    },

    /** Blind Verifier: exactly one crop + the fixed task. No claim, PO or role text. */
    async blindVerify(cropBuffer) {
      const content = [await toImageBlock(cropBuffer), { type: 'text', text: BLIND_VERIFIER_TASK }];
      return validateBlind(await callJson('BLIND_VERIFIER', BLIND_SYSTEM, content, BLIND_SCHEMA));
    },
  };
}

module.exports = {
  createVisionProvider,
  normaliseBbox,
  VisionError,
  BLIND_VERIFIER_TASK,
  DEFAULT_MODEL,
};
