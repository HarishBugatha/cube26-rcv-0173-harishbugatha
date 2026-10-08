import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/*
 * Upload payload size (working copy + JPEG evidence), NDJSON progress streaming (?stream=1)
 * and the vision-run latency changes (Defender concurrent with the Blind Verifier, per-call effort).
 * The vision path uses the real provider with a test-double HTTP client.
 */

const require = createRequire(import.meta.url);
const crypto = require('crypto');
const sharp = require('sharp');
const { runDebatePipeline } = require('../server/debateEngine.js');
const { createVisionProvider } = require('../server/visionProvider.js');
const { sanitizeImageMetadata } = require('../server/security.js');
const app = require('../server/server.js');

const MB4 = 4 * 1024 * 1024;
const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const ALPHA = { 'X-Org-Id': 'org_demo_alpha' };
const NO_MODEL_REASON = 'No vision model is configured (ANTHROPIC_API_KEY is not set).';

const PO = {
  poNumber: 'PO-STR-1',
  vendor: 'Test Supplier',
  expectedSku: 'SKU-GW-4410',
  productName: 'Industrial Gateway',
  expectedQuantity: 4,
  expectedVariant: 'Steel Blue / 4-Port',
  expectedComponents: [],
  carrierTracking: '',
  notes: '',
};

const ok = (obj: any) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });
const prosecution = {
  image_usable: true, unusable_reason: '', items_count_determinable: true, items_detected: 3,
  sku_label_readable: true, detected_sku: 'SKU-GW-4410', variant_determinable: true,
  detected_variant: 'Steel Blue / 4-Port', packaging_status: 'CRUSHED', components_determinable: true, missing_components: [],
  findings: [
    { check: 'QUANTITY', bbox: [0.2, 0.1, 0.9, 0.8], description: 'Only 3 units.', confidence: 0.9 },
    { check: 'PACKAGING', bbox: [0, 0, 0.5, 0.5], description: 'Corner crush.', confidence: 0.9 },
  ],
  overall_confidence: 0.9,
};
const blindObs = {
  observations: ['A tray with an empty slot.'], visible_text: '', units_count_determinable: true, units_visible: 3,
  empty_slots_visible: 1, damage: 'CRUSHING', anomaly_present: 'YES', confidence: 0.9,
};

/** Test-double SDK client. Records calls; the Defender answers only after `defenderDelayMs`. */
function makeClient(defenderDelayMs = 0) {
  const calls: { role: string; params: any; defenderPending: boolean }[] = [];
  let defenderPending = false;
  return {
    calls,
    beta: {
      messages: {
        create: async (p: any) => {
          const role = p.system.startsWith('You are the Prosecutor') ? 'prosecutor' : p.system.startsWith('You are the Defender') ? 'defender' : 'blind';
          calls.push({ role, params: p, defenderPending });
          if (role === 'prosecutor') return ok(prosecution);
          if (role === 'blind') return ok(blindObs);
          defenderPending = true;
          await new Promise((r) => setTimeout(r, defenderDelayMs));
          defenderPending = false;
          const text = p.messages[0].content.find((b: any) => b.type === 'text').text as string;
          const ids = [...text.matchAll(/- (CLM-[A-Z]+-\d+)/g)].map((m) => m[1]);
          return ok({ responses: ids.map((id) => ({ claim_id: id, stance: 'CONCEDE_DEFECT', arguments: ['none'], plausibility: 0.1 })) });
        },
      },
    },
  };
}

let phoneJpeg: Buffer; // 4032×3024 noisy JPEG, ~7 MB, like a phone photo
let server: Server;
let base: string;

beforeAll(async () => {
  phoneJpeg = await sharp({ create: { width: 4032, height: 3024, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 30 } } })
    .jpeg({ quality: 90 })
    .toBuffer();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60000);
afterAll(() => {
  app.locals.visionProvider = null;
  server?.close();
});

function uploadForm(image: Buffer, type = 'image/jpeg') {
  const form = new FormData();
  form.append('photo', new Blob([image], { type }), 'dock.jpg');
  form.append('poNumber', PO.poNumber);
  form.append('expectedSku', PO.expectedSku);
  form.append('expectedQuantity', String(PO.expectedQuantity));
  form.append('expectedVariant', PO.expectedVariant);
  return form;
}

async function readNdjson(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8');
  expect(res.headers.get('cache-control')).toBe('no-cache');
  expect(res.headers.get('x-accel-buffering')).toBe('no');
  const events = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  events.forEach((e) => expect(typeof e.t).toBe('number'));
  // Exactly one terminal line, and it is the last one
  expect(events.filter((e) => e.type === 'report' || e.type === 'error')).toHaveLength(1);
  return { events, terminal: events[events.length - 1] };
}

const indexOf = (events: any[], match: any) =>
  events.findIndex((e) => Object.entries(match).every(([k, v]) => e[k] === v));

describe('Upload payload size', () => {
  it('a 4032×3024 phone JPEG yields a report under 4 MB (pipeline, no vision provider)', async () => {
    const s = await sanitizeImageMetadata(phoneJpeg, 'jpeg');
    expect(Math.max(s.width, s.height)).toBe(2048);
    expect(s.rawHash).toBe(sha256(phoneJpeg));
    expect(s.cleanHash).toBe(sha256(s.cleanBuffer));
    const report = await runDebatePipeline(PO, s.cleanBuffer, s.cleanHash, s.rawHash, null, {});
    expect(JSON.stringify(report).length).toBeLessThan(MB4);
    expect(report.annotatedImageBase64.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(report.debatedClaims[0].evidence.cropBase64.startsWith('data:image/jpeg;base64,')).toBe(true);
    // The evidence graph no longer duplicates the crop image
    report.evidenceGraph.nodes.forEach((n: any) => expect(n.data?.cropBase64).toBeUndefined());
  }, 60000);

  it('a 4032×3024 phone JPEG yields a response under 4 MB (HTTP route)', async () => {
    app.locals.visionProvider = null;
    const res = await fetch(`${base}/api/verify/custom`, { method: 'POST', headers: ALPHA, body: uploadForm(phoneJpeg) });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text.length).toBeLessThan(MB4);
    const { report } = JSON.parse(text);
    expect(report.securityAudit.rawImageSha256).toBe(sha256(phoneJpeg));
  }, 60000);
});

describe('Vision run: latency changes keep the result and isolation', () => {
  it('Defender runs concurrently with the Blind Verifier; cropHash is the hash of the exact bytes sent; per-call effort', async () => {
    const s = await sanitizeImageMetadata(phoneJpeg, 'jpeg');
    const client = makeClient(500);
    const report = await runDebatePipeline(PO, s.cleanBuffer, s.cleanHash, s.rawHash, null, {
      visionProvider: createVisionProvider({ client, timeoutMs: 5000 }),
    });
    const blindCalls = client.calls.filter((c) => c.role === 'blind');
    expect(blindCalls.length).toBeGreaterThan(0);
    expect(blindCalls.some((c) => c.defenderPending)).toBe(true);
    // Result is classified only after both: the Defender's concession is in every claim
    expect(report.debatedClaims.find((c: any) => c.claimType === 'QUANTITY_SHORTAGE').status).toBe('VERIFIED');
    expect(report.finalVerdict).toBe('EXCEPTION');

    const sentHashes = blindCalls.map((c) => sha256(Buffer.from(c.params.messages[0].content[0].source.data, 'base64')));
    const blindClaims = report.debatedClaims.filter((c: any) => !c.blindVerifier.notRun && c.blindVerifier.promptDelivered);
    expect(sentHashes.sort()).toEqual(blindClaims.map((c: any) => c.evidence.cropHash).sort());

    for (const c of client.calls) {
      expect(c.params.messages[0].content[0].source.media_type).toBe('image/jpeg');
      expect(c.params.output_config.effort).toBe(c.role === 'blind' ? 'low' : 'medium');
    }
  }, 60000);
});

describe('NDJSON streaming (?stream=1)', () => {
  it('vision run: stage order, one claim event per finding, report last', async () => {
    const client = makeClient();
    app.locals.visionProvider = createVisionProvider({ client, timeoutMs: 5000 });
    const small = await sharp({ create: { width: 480, height: 360, channels: 3, background: '#9b7b52' } }).jpeg().toBuffer();
    const res = await fetch(`${base}/api/verify/custom?stream=1`, { method: 'POST', headers: ALPHA, body: uploadForm(small) });
    const { events, terminal } = await readNdjson(res);
    app.locals.visionProvider = null;

    expect(terminal.type).toBe('report');
    const report = terminal.report;
    expect(report.verification.mode).toBe('VISION_MODEL');

    const preStart = indexOf(events, { stage: 'PREPROCESS', status: 'started' });
    const preDone = indexOf(events, { stage: 'PREPROCESS', status: 'done' });
    const prosStart = indexOf(events, { stage: 'PROSECUTOR', status: 'started', mode: 'VISION_MODEL' });
    const prosDone = indexOf(events, { stage: 'PROSECUTOR', status: 'done', mode: 'VISION_MODEL' });
    const defDone = indexOf(events, { stage: 'DEFENDER', status: 'done' });
    const blindDone = events.map((e, i) => (e.stage === 'BLIND_VERIFIER' && e.status === 'done' ? i : -1)).filter((i) => i >= 0);
    const reportDone = indexOf(events, { stage: 'REPORT', status: 'done' });
    expect(preStart).toBe(0);
    expect(preStart).toBeLessThan(preDone);
    expect(preDone).toBeLessThan(prosStart);
    expect(prosStart).toBeLessThan(prosDone);
    expect(blindDone.length).toBeGreaterThan(0);
    blindDone.forEach((i) => expect(i).toBeGreaterThan(prosDone));
    expect(defDone).toBeGreaterThan(prosDone);
    expect(events[preDone]).toMatchObject({ imageSha256: report.securityAudit.cleanImageSha256, width: 480, height: 360 });
    expect(events[prosDone].claims.map((c: any) => c.claimId).sort()).toEqual(report.debatedClaims.map((c: any) => c.claimId).sort());
    expect(events[defDone].responses[0]).toEqual(expect.objectContaining({ stance: 'CONCEDE_DEFECT', plausibility: 0.1 }));
    expect(events[blindDone[0]]).toMatchObject({ anomaly: 'YES', confidence: 0.9 });
    expect(typeof events[blindDone[0]].confirmsClaim).toBe('boolean');

    const claims = events.filter((e) => e.type === 'claim');
    expect(claims.map((c) => c.claimId)).toEqual(report.debatedClaims.map((c: any) => c.claimId));
    claims.forEach((c, i) => expect(c).toMatchObject({ status: report.debatedClaims[i].status, rationale: report.debatedClaims[i].classificationRationale }));
    expect(Math.min(...claims.map((c) => events.indexOf(c)))).toBeGreaterThan(Math.max(defDone, ...blindDone));
    expect(events[reportDone]).toMatchObject({ finalVerdict: report.finalVerdict });
    expect(reportDone).toBe(events.length - 2);
  });

  it('no vision model: PROSECUTOR failed (mode NONE) with the reason; no role pretends to have run', async () => {
    app.locals.visionProvider = null;
    const small = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#fff' } }).png().toBuffer();
    const res = await fetch(`${base}/api/verify/custom?stream=1`, { method: 'POST', headers: ALPHA, body: uploadForm(small, 'image/png') });
    const { events, terminal } = await readNdjson(res);
    expect(terminal.type).toBe('report');
    expect(terminal.report.finalVerdict).toBe('UNCERTAIN');
    const stages = events.filter((e) => e.type === 'stage').map((e) => `${e.stage}:${e.status}`);
    expect(stages).toEqual(['PREPROCESS:started', 'PREPROCESS:done', 'PROSECUTOR:failed', 'REPORT:done']);
    expect(events.find((e) => e.stage === 'PROSECUTOR')).toMatchObject({ mode: 'NONE', reason: NO_MODEL_REASON });
    expect(events.filter((e) => e.type === 'claim')).toHaveLength(terminal.report.debatedClaims.length);
  });

  it('scenario: same stages with mode SCENARIO_FIXTURE', async () => {
    const res = await fetch(`${base}/api/verify/scenario/scenario-6-crushed-packaging?stream=1`, { method: 'POST', headers: ALPHA });
    const { events, terminal } = await readNdjson(res);
    expect(terminal.type).toBe('report');
    const report = terminal.report;
    expect(report.scenarioId).toBe('scenario-6-crushed-packaging');
    const prosDone = indexOf(events, { stage: 'PROSECUTOR', status: 'done', mode: 'SCENARIO_FIXTURE' });
    expect(indexOf(events, { stage: 'PREPROCESS', status: 'done' })).toBeLessThan(indexOf(events, { stage: 'PROSECUTOR', status: 'started', mode: 'SCENARIO_FIXTURE' }));
    const blindDone = events.findIndex((e) => e.stage === 'BLIND_VERIFIER' && e.status === 'done');
    expect(prosDone).toBeGreaterThan(-1);
    expect(blindDone).toBeGreaterThan(prosDone);
    expect(events.filter((e) => e.type === 'claim')).toHaveLength(report.debatedClaims.length);
    expect(indexOf(events, { stage: 'REPORT', status: 'done', finalVerdict: report.finalVerdict })).toBe(events.length - 2);
  });

  it('invalid input with ?stream=1 is a plain JSON 400', async () => {
    const res = await fetch(`${base}/api/verify/custom?stream=1`, {
      method: 'POST',
      headers: { ...ALPHA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}` }),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect((await res.json()).success).toBe(false);
    const sc = await fetch(`${base}/api/verify/scenario/scenario-1-correct?stream=1`, {
      method: 'POST',
      headers: { ...ALPHA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ po: { expectedQuantity: -1 } }),
    });
    expect(sc.status).toBe(400);
    expect(sc.headers.get('content-type')).toMatch(/^application\/json/);
  });
});
