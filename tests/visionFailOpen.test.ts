import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import {
  buildPendingRecordFromInspection,
  buildRecordFromInspection,
  isVisuallyVerified,
} from '../src/services/inspectionRecord';
import { addReceivingRecord, initializeData, verifyIntegrity } from '../src/services/dataService';
import { buildEvidenceContract } from '../src/services/comparisonEngine';
import { DebateInspectionReport } from '../src/types/receiving';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { runDebatePipeline } = require('../server/debateEngine.js');
const { createVisionProvider, BLIND_VERIFIER_TASK } = require('../server/visionProvider.js');
const { sanitizeImageMetadata } = require('../server/security.js');

/*
 * These tests exercise the real vision provider (prompts, schemas, timeout, response
 * validation) and the real pipeline. Only the HTTP client is replaced by a test double,
 * which returns scripted Messages API responses so failure modes can be reproduced.
 */

const PO = {
  poNumber: 'PO-VIS-7781',
  vendor: 'Test Supplier',
  expectedSku: 'SKU-GW-4410',
  productName: 'Industrial Gateway',
  expectedQuantity: 4,
  expectedVariant: 'Steel Blue / 4-Port',
  expectedComponents: ['Gateway Unit', 'Power Adapter'],
  carrierTracking: '',
  notes: '',
};

type Handler = (params: any) => any;

/** Test double for the SDK client: routes each call to a handler by role (system prompt). */
function makeClient(handlers: { prosecutor?: Handler; defender?: Handler; blind?: Handler }) {
  const calls: { role: string; params: any }[] = [];
  const roleOf = (system: string) =>
    system.startsWith('You are the Prosecutor') ? 'prosecutor' : system.startsWith('You are the Defender') ? 'defender' : 'blind';
  return {
    calls,
    beta: {
      messages: {
        create: async (params: any) => {
          const role = roleOf(params.system);
          calls.push({ role, params });
          const handler = (handlers as any)[role];
          if (!handler) throw new Error(`no handler for ${role}`);
          return handler(params);
        },
      },
    },
  };
}

const ok = (obj: any) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });

const prosecution = (overrides: any = {}) => ({
  image_usable: true,
  unusable_reason: '',
  items_count_determinable: true,
  items_detected: 4,
  sku_label_readable: true,
  detected_sku: 'SKU-GW-4410',
  variant_determinable: true,
  detected_variant: 'Steel Blue / 4-Port',
  packaging_status: 'INTACT',
  missing_components: [],
  findings: [],
  overall_confidence: 0.9,
  ...overrides,
});

const defendAll = (params: any) => {
  const text = params.messages[0].content.find((b: any) => b.type === 'text').text as string;
  const ids = [...text.matchAll(/- (CLM-[A-Z]+-\d+)/g)].map((m) => m[1]);
  return ok({
    responses: ids.map((id) => ({
      claim_id: id,
      stance: id === 'CLM-NOM-01' ? 'SUPPORT_CLEAN' : 'CONCEDE_DEFECT',
      arguments: ['No innocent explanation visible.'],
      plausibility: 0.1,
    })),
  });
};

const blind = (anomaly: 'YES' | 'NO' | 'UNCLEAR', confidence = 0.9) => () =>
  ok({
    observations: [anomaly === 'YES' ? 'Two empty cavities are visible in the tray.' : 'Intact units in a foam tray.'],
    visible_text: '',
    units_count_determinable: true,
    units_visible: 3,
    empty_slots_visible: anomaly === 'YES' ? 1 : 0,
    damage: 'NONE',
    anomaly_present: anomaly,
    confidence,
  });

let image: { cleanBuffer: Buffer; cleanHash: string; rawHash: string };

async function inspect(client: any, timeoutMs = 2000): Promise<DebateInspectionReport> {
  const provider = createVisionProvider({ client, timeoutMs, model: 'claude-opus-5-5' });
  return runDebatePipeline(PO, image.cleanBuffer, image.cleanHash, image.rawHash, null, { visionProvider: provider });
}

const expectFailOpen = (report: DebateInspectionReport) => {
  expect(report.finalVerdict).toBe('UNCERTAIN');
  expect(report.finalVerdict).not.toBe('ACCEPT');
  expect(report.verification?.status).toBe('INCOMPLETE');
  expect(isVisuallyVerified(report, PO)).toBe(false);
};

beforeAll(async () => {
  const png = await sharp({ create: { width: 480, height: 360, channels: 3, background: '#9b7b52' } }).png().toBuffer();
  image = await sanitizeImageMetadata(png);
});

describe('Vision model: configuration', () => {
  it('missing model configuration → no provider → UNCERTAIN, verification INCOMPLETE (NOT_CONFIGURED)', async () => {
    expect(createVisionProvider({ apiKey: '' })).toBeNull();
    const report = await runDebatePipeline(PO, image.cleanBuffer, image.cleanHash, image.rawHash, null, { visionProvider: null });
    expectFailOpen(report);
    expect(report.verification!.reasons[0]).toMatchObject({ stage: 'CONFIGURATION', kind: 'NOT_CONFIGURED' });
  });
});

describe('Vision model: fail open (Rule 3)', () => {
  it('model timeout → UNCERTAIN with the timeout reason preserved', async () => {
    const client = makeClient({ prosecutor: () => new Promise(() => {}) });
    const report = await inspect(client, 50);
    expectFailOpen(report);
    expect(report.verification!.reasons[0]).toMatchObject({ stage: 'PROSECUTOR', kind: 'TIMEOUT' });
    expect(report.verification!.reasons[0].reason).toMatch(/timed out after 50 ms/);
    expect(report.debatedClaims[0].claimType).toBe('VISUAL_VERIFICATION_UNAVAILABLE');
  });

  it('model error → UNCERTAIN with the error preserved', async () => {
    const client = makeClient({
      prosecutor: () => {
        throw new Error('upstream exploded');
      },
    });
    const report = await inspect(client);
    expectFailOpen(report);
    expect(report.verification!.reasons[0]).toMatchObject({ stage: 'PROSECUTOR', kind: 'API_ERROR' });
    expect(report.verification!.reasons[0].reason).toContain('upstream exploded');
  });

  it('incomplete model responses → UNCERTAIN (missing fields, non-JSON, truncated, refused)', async () => {
    const cases: [Handler, string][] = [
      [() => ok({ image_usable: true, findings: [] }), 'INCOMPLETE_RESPONSE'],
      [() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'looks fine to me' }] }), 'INCOMPLETE_RESPONSE'],
      [() => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"image_usable": tr' }] }), 'INCOMPLETE_RESPONSE'],
      [() => ({ stop_reason: 'refusal', content: [] }), 'REFUSED'],
      [() => ok(prosecution({ overall_confidence: 7 })), 'INCOMPLETE_RESPONSE'],
    ];
    for (const [handler, kind] of cases) {
      const report = await inspect(makeClient({ prosecutor: handler }));
      expectFailOpen(report);
      expect(report.verification!.reasons[0].kind).toBe(kind);
    }
  });

  it('verifier failure (Blind Verifier error) → finding CHALLENGED, verdict UNCERTAIN, never ACCEPT', async () => {
    const client = makeClient({
      prosecutor: () => ok(prosecution()),
      defender: defendAll,
      blind: () => {
        throw new Error('blind verifier unavailable');
      },
    });
    const report = await inspect(client);
    expectFailOpen(report);
    expect(report.verification!.reasons.some((r) => r.stage === 'BLIND_VERIFIER' && r.reason.includes('blind verifier unavailable'))).toBe(true);
    expect(report.debatedClaims.every((c) => c.status === 'CHALLENGED')).toBe(true);
    expect(report.debatedClaims[0].classificationRationale).toMatch(/Verification incomplete/);
  });

  it('Defender failure → findings CHALLENGED, verdict UNCERTAIN', async () => {
    const client = makeClient({
      prosecutor: () => ok(prosecution()),
      defender: () => ok({ responses: [] }), // missing responses = incomplete
      blind: blind('NO'),
    });
    const report = await inspect(client);
    expectFailOpen(report);
    expect(report.verification!.reasons[0]).toMatchObject({ stage: 'DEFENDER', kind: 'INCOMPLETE_RESPONSE' });
  });

  it('photo not usable → UNCERTAIN with the model-given reason', async () => {
    const client = makeClient({ prosecutor: () => ok(prosecution({ image_usable: false, unusable_reason: 'Image is completely dark' })) });
    const report = await inspect(client);
    expectFailOpen(report);
    expect(report.verification!.reasons[0].reason).toContain('Image is completely dark');
  });

  it('a failed inspection is still recorded, as PENDING_REVIEW with the reason and no invented count', async () => {
    const report = await inspect(makeClient({ prosecutor: () => new Promise(() => {}) }), 50);
    expect(() => buildRecordFromInspection(report, PO, { tenantId: 'org_demo_alpha', operatorId: 'op', capturedAt: '2026-10-06T00:00:00Z' })).toThrow();
    const pending = buildPendingRecordFromInspection(report, PO, { tenantId: 'org_demo_alpha', operatorId: 'op', capturedAt: '2026-10-06T00:00:00Z' });
    expect(pending.status).toBe('PENDING_REVIEW');
    expect(pending.disposition).toBe('SUPERVISOR_REVIEW');
    expect(pending.qtyReceived).toBeNull();
    expect(pending.qtyDifference).toBeNull();
    expect(pending.pendingReason).toMatch(/PROSECUTOR: .*timed out/);

    initializeData();
    const stored = addReceivingRecord('org_demo_alpha', pending);
    expect(stored.status).toBe('PENDING_REVIEW');
    expect(stored.unitId).toMatch(/^UNIT-\d{4}$/);
    expect(verifyIntegrity('org_demo_alpha').ok).toBe(true);
    const contract = buildEvidenceContract(stored);
    expect(contract.quantity.qtyReceived).toBeNull();
    expect(contract.verdict.finalStatus).toBe('PENDING_REVIEW');
  });
});

describe('Vision model: successful inspections use the existing rule engine', () => {
  it('everything matches and the Blind Verifier sees no anomaly → ACCEPT, recordable as MATCHED', async () => {
    const client = makeClient({ prosecutor: () => ok(prosecution()), defender: defendAll, blind: blind('NO') });
    const report = await inspect(client);
    expect(report.finalVerdict).toBe('ACCEPT');
    expect(report.verification).toMatchObject({ status: 'COMPLETE', mode: 'VISION_MODEL', model: 'claude-opus-5-5', reasons: [] });
    expect(report.observedFeatures).toMatchObject({ source: 'VISION_MODEL', itemsDetected: 4 });
    expect(report.debatedClaims).toHaveLength(1);
    expect(report.debatedClaims[0]).toMatchObject({ claimType: 'NOMINAL_COMPLIANCE', status: 'REJECTED' });
    expect(isVisuallyVerified(report, PO)).toBe(true);
    const record = buildRecordFromInspection(report, PO, { tenantId: 'org_demo_alpha', operatorId: 'op', capturedAt: '2026-10-06T00:00:00Z' });
    expect(record.status).toBe('MATCHED');
    // Evidence graph is built from the same claims
    expect(report.evidenceGraph.nodes.find((n: any) => n.type === 'VERDICT')?.status).toBe('ACCEPT');
    expect(report.evidenceGraph.nodes.filter((n: any) => n.type === 'BLIND_VERIFIER')).toHaveLength(1);
  });

  it('shortage confirmed independently by the Blind Verifier → VERIFIED → EXCEPTION, recorded as SHORT_RECEIVED', async () => {
    const client = makeClient({
      prosecutor: () =>
        ok(prosecution({
          items_detected: 3,
          findings: [{ check: 'QUANTITY', bbox: [0.2, 0.1, 0.9, 0.8], description: 'Only 3 units in the 4-slot tray.', confidence: 0.92 }],
        })),
      defender: defendAll,
      blind: blind('YES', 0.9),
    });
    const report = await inspect(client);
    expect(report.finalVerdict).toBe('EXCEPTION');
    const qty = report.debatedClaims.find((c) => c.claimType === 'QUANTITY_SHORTAGE')!;
    expect(qty.status).toBe('VERIFIED');
    expect(qty.bbox).toEqual([0.2, 0.1, 0.9, 0.8]);
    expect(qty.prosecutor.arguments[0]).toBe('Only 3 units in the 4-slot tray.');
    const record = buildRecordFromInspection(report, PO, { tenantId: 'org_demo_alpha', operatorId: 'op', capturedAt: '2026-10-06T00:00:00Z' });
    expect(record).toMatchObject({ status: 'SHORT_RECEIVED', qtyReceived: 3, qtyDifference: -1 });
  });

  it('Blind Verifier does not confirm the Prosecutor\'s finding → CHALLENGED → UNCERTAIN (no automatic pass or fail)', async () => {
    const client = makeClient({
      prosecutor: () =>
        ok(prosecution({ packaging_status: 'CRUSHED', findings: [{ check: 'PACKAGING', bbox: [0, 0, 0.5, 0.5], description: 'Corner crush', confidence: 0.9 }] })),
      defender: defendAll,
      blind: blind('NO', 0.95),
    });
    const report = await inspect(client);
    expect(report.finalVerdict).toBe('UNCERTAIN');
    const crush = report.debatedClaims.find((c) => c.claimType === 'PACKAGING_CRUSH')!;
    expect(crush.status).toBe('CHALLENGED');
    expect(crush.classificationRationale).toMatch(/did not independently confirm/);
  });

  it('low-confidence or unclear Blind Verifier on the nominal check → UNCERTAIN, not ACCEPT', async () => {
    for (const verdict of [blind('UNCLEAR', 0.9), blind('NO', 0.5), blind('YES', 0.9)]) {
      const report = await inspect(makeClient({ prosecutor: () => ok(prosecution()), defender: defendAll, blind: verdict }));
      expect(report.finalVerdict).toBe('UNCERTAIN');
    }
  });

  it('facts the photo does not show → explicit CHALLENGED findings → UNCERTAIN, recorded as pending', async () => {
    const client = makeClient({
      prosecutor: () => ok(prosecution({ items_count_determinable: false, items_detected: 0, sku_label_readable: false, detected_sku: '' })),
      defender: defendAll,
      blind: blind('NO'),
    });
    const report = await inspect(client);
    expect(report.finalVerdict).toBe('UNCERTAIN');
    expect(report.verification!.status).toBe('COMPLETE'); // the model ran; the evidence is insufficient
    const types = report.debatedClaims.filter((c) => c.status === 'CHALLENGED').map((c) => c.claimType);
    expect(types).toEqual(expect.arrayContaining(['QUANTITY_UNDETERMINED', 'AMBIGUOUS_LABEL']));
    expect(report.observedFeatures).toMatchObject({ itemsDetected: null, detectedSku: null });
    expect(isVisuallyVerified(report, PO)).toBe(false);
  });
});

describe('Blind Verifier isolation', () => {
  it('receives exactly one crop and the fixed task — no PO values, claim text or other roles\' reasoning', async () => {
    const client = makeClient({
      prosecutor: () =>
        ok(prosecution({
          items_detected: 3,
          findings: [{ check: 'QUANTITY', bbox: [0.2, 0.1, 0.9, 0.8], description: 'PROSECUTOR-SECRET-REASONING', confidence: 0.92 }],
        })),
      defender: (params: any) => {
        const res = defendAll(params);
        const body = JSON.parse(res.content[0].text);
        body.responses.forEach((r: any) => (r.arguments = ['DEFENDER-SECRET-REASONING']));
        return ok(body);
      },
      blind: blind('YES'),
    });
    const report = await inspect(client);

    const blindCalls = client.calls.filter((c) => c.role === 'blind');
    expect(blindCalls).toHaveLength(report.debatedClaims.length);
    for (const { params } of blindCalls) {
      const content = params.messages[0].content;
      expect(params.messages).toHaveLength(1);
      expect(content.filter((b: any) => b.type === 'image')).toHaveLength(1);
      const texts = content.filter((b: any) => b.type === 'text').map((b: any) => b.text);
      expect(texts).toEqual([BLIND_VERIFIER_TASK]);
      const serialised = JSON.stringify({ system: params.system, text: texts });
      for (const leak of [PO.poNumber, PO.expectedSku, PO.productName, PO.expectedVariant, '4 Units', 'Short Quantity', 'PROSECUTOR-SECRET-REASONING', 'DEFENDER-SECRET-REASONING', 'CLM-']) {
        expect(serialised).not.toContain(leak);
      }
    }
    // The Prosecutor does receive the PO (it compares against it); the Defender sees the findings
    const prosecutorText = JSON.stringify(client.calls.find((c) => c.role === 'prosecutor')!.params.messages);
    expect(prosecutorText).toContain(PO.expectedSku);
    // The stored isolation prompt is the exact task that was sent
    report.debatedClaims.forEach((c) => expect(c.blindVerifier.promptDelivered).toBe(BLIND_VERIFIER_TASK));
  });
});
