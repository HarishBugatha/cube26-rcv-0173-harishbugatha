import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { buildRecordFromInspection } from '../src/services/inspectionRecord';
import { compareShipment } from '../src/services/comparisonEngine';
import { DebateInspectionReport } from '../src/types/receiving';

/*
 * Regression tests for defects found in the agent review (2026-10-08): the bugs they pin are
 * listed in the review notes. The vision path uses the real provider with a test-double HTTP client.
 */

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { runDebatePipeline } = require('../server/debateEngine.js');
const { createVisionProvider } = require('../server/visionProvider.js');
const { sanitizeImageMetadata } = require('../server/security.js');
const { extractCrop } = require('../server/cropEngine.js');
const app = require('../server/server.js');

const PO = {
  poNumber: 'PO-REG-1',
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
const prosecution = (o: any = {}) => ({
  image_usable: true, unusable_reason: '', items_count_determinable: true, items_detected: 4,
  sku_label_readable: true, detected_sku: 'SKU-GW-4410', variant_determinable: true,
  detected_variant: 'Steel Blue / 4-Port', packaging_status: 'INTACT', components_determinable: true, missing_components: [],
  findings: [], overall_confidence: 0.9, ...o,
});
const blindObs = (o: any = {}) => ({
  observations: ['Units in a tray.'], visible_text: '', units_count_determinable: true, units_visible: 4,
  empty_slots_visible: 0, damage: 'NONE', anomaly_present: 'NO', confidence: 0.9, ...o,
});
const defendAll = (params: any) => {
  const text = params.messages[0].content.find((b: any) => b.type === 'text').text as string;
  const ids = [...text.matchAll(/- (CLM-[A-Z]+-\d+)/g)].map((m) => m[1]);
  return ok({ responses: ids.map((id) => ({ claim_id: id, stance: id === 'CLM-NOM-01' ? nominalStance : 'CONCEDE_DEFECT', arguments: ['none'], plausibility: 0.1 })) });
};
let nominalStance = 'SUPPORT_CLEAN';

function client(pros: any, blind: any = blindObs()) {
  return {
    beta: {
      messages: {
        create: async (p: any) =>
          p.system.startsWith('You are the Prosecutor') ? ok(pros)
            : p.system.startsWith('You are the Defender') ? defendAll(p)
            : ok(blind),
      },
    },
  };
}

let image: any;
const inspect = (pros: any, blind?: any): Promise<DebateInspectionReport> =>
  runDebatePipeline(PO, image.cleanBuffer, image.cleanHash, image.rawHash, null, {
    visionProvider: createVisionProvider({ client: client(pros, blind), timeoutMs: 2000 }),
  });
const types = (r: DebateInspectionReport) => r.debatedClaims.map((c) => c.claimType);

beforeAll(async () => {
  const png = await sharp({ create: { width: 480, height: 360, channels: 3, background: '#9b7b52' } }).png().toBuffer();
  image = await sanitizeImageMetadata(png);
});

describe('Vision path: comparison logic', () => {
  it('an empty carton (0 units counted) is a shortage, not a match', async () => {
    const r = await inspect(prosecution({ items_detected: 0 }), blindObs({ units_visible: 0, empty_slots_visible: 4, anomaly_present: 'YES' }));
    expect(types(r)).toContain('QUANTITY_SHORTAGE');
    expect(r.finalVerdict).not.toBe('ACCEPT');
  });

  it('any variant difference is raised, not only the demo keywords', async () => {
    const r = await inspect(prosecution({ detected_variant: 'Signal Red / 8-Port' }));
    expect(types(r)).toContain('VARIANT_MISMATCH');
    expect(r.finalVerdict).not.toBe('ACCEPT');
  });

  it('a partial SKU read is ambiguous (UNCERTAIN), not a match', async () => {
    const r = await inspect(prosecution({ detected_sku: 'GW-44' }));
    expect(types(r)).toContain('AMBIGUOUS_LABEL');
    expect(r.finalVerdict).toBe('UNCERTAIN');
  });

  it('"readable" with an empty SKU string is treated as not determinable', async () => {
    const r = await inspect(prosecution({ detected_sku: '' }));
    expect(r.observedFeatures!.detectedSku).toBeNull();
    expect(r.finalVerdict).toBe('UNCERTAIN');
  });

  it('a Prosecutor finding contradicting its own structured result is surfaced, not dropped', async () => {
    const r = await inspect(prosecution({ findings: [{ check: 'PACKAGING', bbox: [0, 0, 0.5, 0.5], description: 'Dent on lid', confidence: 0.8 }] }));
    expect(types(r)).toContain('UNRECONCILED_FINDING');
    expect(r.finalVerdict).toBe('UNCERTAIN');
  });

  it('real-photo claims carry no fixture text (no invented "slot #3")', async () => {
    const r = await inspect(prosecution({ missing_components: ['Power Adapter'] }));
    const claim = r.debatedClaims.find((c) => c.claimType === 'MISSING_COMPONENT')!;
    expect(claim.physicalObserved).not.toMatch(/slot #3/i);
    expect(claim.physicalObserved).toContain('Power Adapter');
  });
});

describe('Vision path: independent corroboration', () => {
  it('ACCEPT requires the Blind Verifier\'s count to agree with the Prosecutor\'s', async () => {
    expect((await inspect(prosecution(), blindObs({ units_visible: 4 }))).finalVerdict).toBe('ACCEPT');
    expect((await inspect(prosecution(), blindObs({ units_visible: 3 }))).finalVerdict).toBe('UNCERTAIN');
  });

  it('low Prosecutor confidence never yields ACCEPT', async () => {
    expect((await inspect(prosecution({ overall_confidence: 0.3 }))).finalVerdict).toBe('UNCERTAIN');
  });

  it('a dent seen in a quantity crop does not verify a shortage (claim-specific confirmation)', async () => {
    const r = await inspect(
      prosecution({ items_detected: 3, findings: [{ check: 'QUANTITY', bbox: [0.1, 0.1, 0.9, 0.9], description: '3 units', confidence: 0.9 }] }),
      blindObs({ anomaly_present: 'YES', damage: 'CRUSHING', units_visible: 4, empty_slots_visible: 0 })
    );
    expect(r.debatedClaims.find((c) => c.claimType === 'QUANTITY_SHORTAGE')!.status).toBe('CHALLENGED');
    expect(r.finalVerdict).toBe('UNCERTAIN');
  });

  it('packaging damage is VERIFIED only when the Blind Verifier sees the same damage type', async () => {
    const pros = prosecution({ packaging_status: 'WATER_DAMAGED', findings: [{ check: 'PACKAGING', bbox: [0, 0, 0.6, 0.6], description: 'Tide marks', confidence: 0.9 }] });
    const same = await inspect(pros, blindObs({ anomaly_present: 'YES', damage: 'WATER' }));
    expect(same.debatedClaims.find((c) => c.claimType === 'WATER_DAMAGE')!.status).toBe('VERIFIED');
    const other = await inspect(pros, blindObs({ anomaly_present: 'YES', damage: 'TEAR' }));
    expect(other.debatedClaims.find((c) => c.claimType === 'WATER_DAMAGE')!.status).toBe('CHALLENGED');
  });

  it('SKU mismatch is VERIFIED when the blind crop independently reads the wrong SKU', async () => {
    const r = await inspect(
      prosecution({ detected_sku: 'SKU-GW-9900', findings: [{ check: 'SKU', bbox: [0.2, 0.2, 0.6, 0.6], description: 'Label reads SKU-GW-9900', confidence: 0.95 }] }),
      blindObs({ visible_text: 'MODEL SKU-GW-9900', anomaly_present: 'NO' })
    );
    expect(r.debatedClaims.find((c) => c.claimType === 'SKU_MISMATCH')!.status).toBe('VERIFIED');
    expect(r.finalVerdict).toBe('EXCEPTION');
  });
});

describe('Cross-check round 2 fixes', () => {
  it('SKU equal after normalisation (punctuation/case) is not a mismatch', async () => {
    const r = await inspect(prosecution({ detected_sku: 'skugw4410' }));
    expect(types(r)).not.toContain('SKU_MISMATCH');
    expect(r.finalVerdict).toBe('ACCEPT');
  });

  it('a Defender that concedes a defect on the nominal claim blocks ACCEPT', async () => {
    nominalStance = 'CONCEDE_DEFECT';
    try {
      expect((await inspect(prosecution())).finalVerdict).toBe('UNCERTAIN');
    } finally {
      nominalStance = 'SUPPORT_CLEAN';
    }
  });

  it('expected kit components that the photo cannot show → UNCERTAIN, not "kit complete"', async () => {
    const po = { ...PO, expectedComponents: ['Gateway Unit', 'Power Adapter'] };
    const r: DebateInspectionReport = await runDebatePipeline(po, image.cleanBuffer, image.cleanHash, image.rawHash, null, {
      visionProvider: createVisionProvider({ client: client(prosecution({ components_determinable: false })), timeoutMs: 2000 }),
    });
    expect(types(r)).toContain('COMPONENTS_UNDETERMINED');
    expect(r.finalVerdict).toBe('UNCERTAIN');
  });

  it('a dent does not verify a missing component', async () => {
    const r = await inspect(
      prosecution({ missing_components: ['Power Adapter'] }),
      blindObs({ anomaly_present: 'YES', damage: 'CRUSHING', empty_slots_visible: 0 })
    );
    expect(r.debatedClaims.find((c) => c.claimType === 'MISSING_COMPONENT')!.status).toBe('CHALLENGED');
  });

  it('a shortage is not VERIFIED when the independent count contradicts it', async () => {
    const r = await inspect(
      prosecution({ items_detected: 3, findings: [{ check: 'QUANTITY', bbox: [0.1, 0.1, 0.9, 0.9], description: '3 units', confidence: 0.9 }] }),
      blindObs({ anomaly_present: 'YES', empty_slots_visible: 1, units_visible: 4 })
    );
    expect(r.debatedClaims.find((c) => c.claimType === 'QUANTITY_SHORTAGE')!.status).toBe('CHALLENGED');
  });
});

describe('Records never contradict the report', () => {
  it('a CHALLENGED shortage is recorded for supervisor review, never MATCHED or plain short-accept', async () => {
    const r = await inspect(
      prosecution({ items_detected: 3, findings: [{ check: 'QUANTITY', bbox: [0.1, 0.1, 0.9, 0.9], description: '3 units', confidence: 0.9 }] }),
      blindObs({ units_visible: 4 })
    );
    const rec = buildRecordFromInspection(r, PO, { tenantId: 'org_demo_alpha', operatorId: 'op', capturedAt: '2026-10-08T00:00:00Z' });
    expect(rec.discrepancies).toContain('UNCERTAIN');
    expect(rec.disposition).toBe('SUPERVISOR_REVIEW');
  });

  it('compareShipment: uncertain input and invalid qtyOrdered are UNCERTAIN, never SHORT/OVER', () => {
    const base = { expectedSku: 'A', receivedSku: 'A', cartonDamage: 'none', unitDamage: 'none', qualityFlags: [] } as const;
    const flagged = compareShipment({ ...base, qualityFlags: [], qtyOrdered: 4, qtyReceived: 4, uncertain: true });
    expect(flagged.status).toBe('UNCERTAIN');
    const badOrder = compareShipment({ ...base, qualityFlags: [], qtyOrdered: NaN, qtyReceived: 4 });
    expect(badOrder.discrepancies).toEqual(['UNCERTAIN']);
  });

  it('an UNCERTAIN inspection (unclear nominal check) is not recorded as MATCHED', async () => {
    const r = await inspect(prosecution(), blindObs({ anomaly_present: 'UNCLEAR' }));
    expect(r.finalVerdict).toBe('UNCERTAIN');
    const rec = buildRecordFromInspection(r, PO, { tenantId: 'org_demo_alpha', operatorId: 'op', capturedAt: '2026-10-08T00:00:00Z' });
    expect(rec.status).not.toBe('MATCHED');
    expect(rec.disposition).toBe('SUPERVISOR_REVIEW');
  });

  it('invalid counts (NaN, negative, fractional) are never MATCHED', () => {
    for (const qtyReceived of [NaN, -1, 3.5]) {
      const res = compareShipment({
        expectedSku: 'A', receivedSku: 'A', qtyOrdered: 4, qtyReceived,
        cartonDamage: 'none', unitDamage: 'none', qualityFlags: [],
      });
      expect(res.status).toBe('UNCERTAIN');
      expect(res.disposition).toBe('SUPERVISOR_REVIEW');
    }
  });
});

describe('Crop engine', () => {
  it('a box at the right/bottom edge does not throw', async () => {
    const big = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: '#888' } }).png().toBuffer();
    const crop = await extractCrop(big, [0.995, 0.995, 1, 1], 0);
    expect(crop.pixelCoords.left + crop.pixelCoords.width).toBeLessThanOrEqual(1500);
    expect(crop.pixelCoords.top + crop.pixelCoords.height).toBeLessThanOrEqual(1000);
  });
});

describe('Upload route input validation (400, not 500 / not bypassed)', () => {
  let server: Server;
  let base: string;
  const post = (body: any) =>
    fetch(`${base}/api/verify/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Org-Id': 'org_demo_alpha' },
      body: JSON.stringify({ expectedSku: 'SKU-REG-1', ...body }),
    });

  beforeAll(async () => {
    app.locals.visionProvider = null;
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server?.close());

  it('base64 upload: non-image bytes and disallowed MIME types are rejected', async () => {
    const notImage = `data:image/png;base64,${Buffer.from('hello, not an image').toString('base64')}`;
    expect((await post({ imageDataUrl: notImage })).status).toBe(400);
    expect((await post({ imageDataUrl: 'data:text/html;base64,PGgxPg==' })).status).toBe(400);
    expect((await post({ imageDataUrl: 12345 })).status).toBe(400);
  });

  it('body-less POSTs are 400, not a 500 crash', async () => {
    const res = await fetch(`${base}/api/verify/custom`, { method: 'POST', headers: { 'X-Org-Id': 'org_demo_alpha' } });
    expect(res.status).toBe(400);
    const sc = await fetch(`${base}/api/verify/scenario/scenario-1-correct`, { method: 'POST', headers: { 'X-Org-Id': 'org_demo_alpha' } });
    expect(sc.status).toBe(200);
  });

  it('malformed expectedComponents and invalid quantities are 400', async () => {
    const png = (await sharp({ create: { width: 40, height: 40, channels: 3, background: '#fff' } }).png().toBuffer()).toString('base64');
    const imageDataUrl = `data:image/png;base64,${png}`;
    expect((await post({ imageDataUrl, expectedComponents: '{not json' })).status).toBe(400);
    expect((await post({ imageDataUrl, expectedComponents: JSON.stringify({ a: 1 }) })).status).toBe(400);
    expect((await post({ imageDataUrl, expectedQuantity: -3 })).status).toBe(400);
    expect((await post({ imageDataUrl, expectedQuantity: 2.5 })).status).toBe(400);
    const good = await post({ imageDataUrl, expectedQuantity: 2, expectedComponents: JSON.stringify(['Cable']) });
    expect(good.status).toBe(200);
    expect((await good.json()).report.finalVerdict).toBe('UNCERTAIN'); // no vision model configured
  });
});
