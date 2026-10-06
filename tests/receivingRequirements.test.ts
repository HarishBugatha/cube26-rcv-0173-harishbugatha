import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { compareShipment, generateContentHash, ComparisonInput } from '../src/services/comparisonEngine';
import {
  setStorageAdapter,
  reloadFromStorage,
  resetToSampleData,
  getRecordsByTenant,
  getRecordById,
  getPOLinesByTenant,
  getAuditChain,
  addReceivingRecord,
  verifyIntegrity,
  nextUnitId,
  StorageAdapter,
  STORAGE_KEY,
} from '../src/services/dataService';
import { presetValues, presetLabel } from '../src/services/receivingPresets';
import { buildRecordFromInspection, isVisuallyVerified } from '../src/services/inspectionRecord';
import { DebateInspectionReport, ReceivingRecord } from '../src/types/receiving';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { runDebatePipeline } = require('../server/debateEngine.js');
const { sanitizeImageMetadata } = require('../server/security.js');

const base: ComparisonInput = {
  expectedSku: 'SKU-100',
  receivedSku: 'SKU-100',
  qtyOrdered: 100,
  qtyReceived: 100,
  cartonDamage: 'none',
  unitDamage: 'none',
  qualityFlags: [],
};

describe('1–7: deterministic receiving classification', () => {
  it('1. expected 100 / received 100 → MATCHED, accept to prep', () => {
    const r = compareShipment(base);
    expect(r.status).toBe('MATCHED');
    expect(r.qtyDifference).toBe(0);
    expect(r.discrepancies).toEqual([]);
    expect(r.disposition).toBe('ACCEPT_TO_PREP');
  });

  it('2. expected 100 / received 97 → SHORT_RECEIVED, difference -3', () => {
    const r = compareShipment({ ...base, qtyReceived: 97 });
    expect(r.status).toBe('SHORT_RECEIVED');
    expect(r.qtyDifference).toBe(-3);
    expect(r.discrepancies).toEqual(['SHORT_RECEIVED']);
    expect(r.disposition).toBe('ACCEPT_WITH_SHORTAGE');
  });

  it('3. expected 100 / received 103 → OVER_RECEIVED, difference +3', () => {
    const r = compareShipment({ ...base, qtyReceived: 103 });
    expect(r.status).toBe('OVER_RECEIVED');
    expect(r.qtyDifference).toBe(3);
    expect(r.discrepancies).toEqual(['OVER_RECEIVED']);
    expect(r.disposition).toBe('HOLD_SURPLUS');
  });

  it('4. correct quantity + quality defect → quality discrepancy, quantity fact still visible', () => {
    const r = compareShipment({ ...base, qualityFlags: ['missing_components'] });
    expect(r.status).toBe('QUALITY_DISCREPANCY');
    expect(r.qtyDifference).toBe(0);
    expect(r.qualityFlags).toEqual(['missing_components']);
    expect(r.checks.find((c) => c.id === 'CHK_QTY_BALANCE')?.verdict).toBe('PASS');
    expect(r.checks.find((c) => c.id === 'CHK_QUALITY_SPEC')?.verdict).toBe('FAIL');
    expect(r.disposition).toBe('HOLD_QUARANTINE_RECOVERY');
  });

  it('5. short quantity + quality defect → SHORT_RECEIVED with the quality issue kept', () => {
    const r = compareShipment({ ...base, qtyReceived: 97, qualityFlags: ['missing_components'] });
    expect(r.status).toBe('SHORT_RECEIVED');
    expect(r.qtyDifference).toBe(-3);
    expect(r.discrepancies).toEqual(['SHORT_RECEIVED', 'QUALITY_DISCREPANCY']);
    expect(r.qualityFlags).toEqual(['missing_components']);
    expect(r.discrepancyType).toContain('Shortage (3 units missing)');
    expect(r.discrepancyType).toContain('Quality Non-Conformance (missing_components)');
    expect(r.summaryExplanation).toContain('3 short');
    // Quality defect still forces quarantine; a shortage alone would be accepted with shortage
    expect(r.disposition).toBe('HOLD_QUARANTINE_RECOVERY');
  });

  it('5b. over quantity + damage → OVER_RECEIVED with damage kept; short + uncertain → supervisor review', () => {
    const over = compareShipment({ ...base, qtyReceived: 103, cartonDamage: 'crushing' });
    expect(over.status).toBe('OVER_RECEIVED');
    expect(over.discrepancies).toEqual(['OVER_RECEIVED', 'DAMAGED']);
    expect(over.disposition).toBe('HOLD_QUARANTINE_RECOVERY');

    const shortUncertain = compareShipment({ ...base, qtyReceived: 97, cartonDamage: 'uncertain' });
    expect(shortUncertain.status).toBe('SHORT_RECEIVED');
    expect(shortUncertain.discrepancies).toEqual(['SHORT_RECEIVED', 'UNCERTAIN']);
    expect(shortUncertain.disposition).toBe('SUPERVISOR_REVIEW');
  });

  it('6. wrong SKU → WRONG_PRODUCT (with any quantity difference also kept)', () => {
    const r = compareShipment({ ...base, receivedSku: 'SKU-999' });
    expect(r.status).toBe('WRONG_PRODUCT');
    expect(r.disposition).toBe('HOLD_QUARANTINE_RECOVERY');
    const withShort = compareShipment({ ...base, receivedSku: 'SKU-999', qtyReceived: 97 });
    expect(withShort.status).toBe('WRONG_PRODUCT');
    expect(withShort.discrepancies).toEqual(['WRONG_PRODUCT', 'SHORT_RECEIVED']);
  });

  it('7. wrong variant → QUALITY_DISCREPANCY with wrong_variant flag', () => {
    const r = compareShipment({ ...base, qualityFlags: ['wrong_variant'] });
    expect(r.status).toBe('QUALITY_DISCREPANCY');
    expect(r.qualityFlags).toEqual(['wrong_variant']);
    expect(r.disposition).toBe('HOLD_QUARANTINE_RECOVERY');
  });
});

describe('8: no vision model → UNCERTAIN, never an automatic visual match', () => {
  let report: DebateInspectionReport;
  const po = {
    poNumber: 'PO-UPLOAD-1',
    vendor: 'Test Vendor',
    expectedSku: 'SKU-EL-1044',
    productName: 'Test product',
    expectedQuantity: 4,
    expectedVariant: 'Standard',
    expectedComponents: [],
    carrierTracking: '',
    notes: '',
  };

  beforeAll(async () => {
    const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#8a6a42' } }).png().toBuffer();
    const { cleanBuffer, cleanHash, rawHash } = await sanitizeImageMetadata(png);
    report = await runDebatePipeline(po, cleanBuffer, cleanHash, rawHash, null);
  });

  it('final verdict is UNCERTAIN with a single CHALLENGED "visual verification unavailable" claim', () => {
    expect(report.finalVerdict).toBe('UNCERTAIN');
    expect(report.recommendedAction).toBe('MANUAL_INSPECTION_REQUIRED');
    expect(report.debatedClaims).toHaveLength(1);
    const claim = report.debatedClaims[0];
    expect(claim.claimType).toBe('VISUAL_VERIFICATION_UNAVAILABLE');
    expect(claim.status).toBe('CHALLENGED');
    expect(report.claimsSummary).toMatchObject({ verified: 0, rejected: 0, challenged: 1 });
    expect(report.decisionRationale).toMatch(/visual verification is unavailable/i);
  });

  it('reports nothing as observed and invents no role output', () => {
    expect(report.observedFeatures).toMatchObject({ source: 'NONE', itemsDetected: null, detectedSku: null });
    const claim = report.debatedClaims[0];
    expect(claim.physicalObserved).toMatch(/not assessed/i);
    expect(claim.prosecutor.confidence).toBe(0);
    expect(claim.defender.defensePlausibility).toBe(0);
    expect(claim.blindVerifier.observationalConfidence).toBe(0);
    [...claim.prosecutor.arguments, ...claim.defender.arguments, ...claim.blindVerifier.observations].forEach((t) =>
      expect(t).toMatch(/^Not run: no vision model is configured/)
    );
    // The photo itself is still hashed and cropped for evidence
    expect(claim.evidence.cropHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cannot be recorded as a receipt (no fabricated received count)', () => {
    expect(isVisuallyVerified(report, po)).toBe(false);
    expect(() =>
      buildRecordFromInspection(report, po, { tenantId: 'org_demo_alpha', operatorId: 'op', capturedAt: '2026-10-06T00:00:00Z' })
    ).toThrow(/no visual observations/);
  });
});

describe('12: Short / Over preset labels match the quantity change they apply', () => {
  it('labels for typical carton layouts', () => {
    const po1 = { sku: 'S', cartonsOrdered: 1, unitsPerCartonOrdered: 24, qtyOrdered: 24 };
    expect(presetLabel(po1, 'short')).toBe('Short (−2)');
    expect(presetLabel(po1, 'over')).toBe('Over (+24)');
    const po3 = { sku: 'S', cartonsOrdered: 3, unitsPerCartonOrdered: 24, qtyOrdered: 72 };
    expect(presetLabel(po3, 'short')).toBe('Short (−6)');
    expect(presetLabel(po3, 'over')).toBe('Over (+24)');
    const small = { sku: 'S', cartonsOrdered: 4, unitsPerCartonOrdered: 2, qtyOrdered: 8 };
    expect(presetLabel(small, 'short')).toBe('Short (−2)'); // one carton fewer
  });

  it('for every PO line in the sample data, label = applied change = comparison result', () => {
    reloadFromStorage();
    const lines = [...getPOLinesByTenant('org_demo_alpha'), ...getPOLinesByTenant('org_demo_bravo')];
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((po) => {
      for (const scenario of ['short', 'over'] as const) {
        const v = presetValues(po, scenario);
        const result = compareShipment({
          expectedSku: po.sku,
          receivedSku: v.receivedSku,
          qtyOrdered: po.qtyOrdered,
          qtyReceived: v.qtyReceived,
          cartonDamage: v.cartonDamage,
          unitDamage: v.unitDamage,
          qualityFlags: v.qualityFlags,
        });
        expect(result.qtyDifference).toBe(v.qtyDifference);
        const signed = v.qtyDifference > 0 ? `+${v.qtyDifference}` : `−${Math.abs(v.qtyDifference)}`;
        expect(presetLabel(po, scenario)).toBe(`${scenario === 'short' ? 'Short' : 'Over'} (${signed})`);
        expect(result.status).toBe(scenario === 'short' ? 'SHORT_RECEIVED' : 'OVER_RECEIVED');
      }
    });
  });
});

describe('9–10: persisted hash chain and deterministic unit IDs', () => {
  const memory = new Map<string, string>();
  const adapter: StorageAdapter = {
    getItem: (k) => (memory.has(k) ? memory.get(k)! : null),
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  };

  const newRecord = (overrides: Partial<ReceivingRecord> = {}): ReceivingRecord => {
    const template = getRecordsByTenant('org_demo_alpha')[0];
    return {
      ...template,
      recordId: `RCV-T${Math.random().toString(36).slice(2, 8)}`,
      unitId: '',
      contentHash: '',
      operatorOverride: undefined,
      ...overrides,
    };
  };

  beforeAll(() => {
    setStorageAdapter(adapter);
    memory.clear();
    reloadFromStorage(); // first load: seeds from CSV and saves
  });

  it('seeded data is saved to storage', () => {
    expect(memory.has(STORAGE_KEY)).toBe(true);
    expect(JSON.parse(memory.get(STORAGE_KEY)!).records.length).toBe(100);
  });

  it('10. unit IDs are deterministic UNIT-#### keys; sample uses UNIT-0001…0100, new receipts continue the sequence', () => {
    const all = [...getRecordsByTenant('org_demo_alpha'), ...getRecordsByTenant('org_demo_bravo')];
    const seeded = all.map((r) => r.unitId).sort();
    expect(seeded[0]).toBe('UNIT-0001');
    expect(seeded[seeded.length - 1]).toBe('UNIT-0100');
    expect(new Set(seeded).size).toBe(seeded.length);

    expect(nextUnitId()).toBe('UNIT-0101');
    expect(nextUnitId()).toBe('UNIT-0101'); // deterministic: same state → same ID

    // The service always assigns the next ID; supplied random, duplicate or malformed IDs are not stored
    const a = addReceivingRecord('org_demo_alpha', newRecord({ unitId: 'UNIT-4821' }));
    const b = addReceivingRecord('org_demo_bravo', newRecord({ unitId: 'UNIT-0001' }));
    const c = addReceivingRecord('org_demo_alpha', newRecord({ unitId: 'UNIT-LIVE' }));
    expect([a.unitId, b.unitId, c.unitId]).toEqual(['UNIT-0101', 'UNIT-0102', 'UNIT-0103']);
    expect(nextUnitId()).toBe('UNIT-0104');
  });

  it('9a. records and hash chain persist across a reload and still verify', () => {
    const rec = addReceivingRecord('org_demo_alpha', newRecord({ qtyReceived: 7 }));
    const headBefore = verifyIntegrity('org_demo_alpha').headHash;
    const chainLengthBefore = getAuditChain('org_demo_alpha').length;

    reloadFromStorage(); // simulated page reload

    const reloaded = getRecordById('org_demo_alpha', rec.recordId);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.qtyReceived).toBe(7);
    expect(reloaded!.contentHash).toBe(generateContentHash(reloaded!));
    expect(getAuditChain('org_demo_alpha').length).toBe(chainLengthBefore);
    const report = verifyIntegrity('org_demo_alpha');
    expect(report.ok).toBe(true);
    expect(report.headHash).toBe(headBefore);
    const chain = getAuditChain('org_demo_alpha');
    chain.slice(1).forEach((entry, i) => expect(entry.prevHash).toBe(chain[i].entryHash));
  });

  it('9b. modifying an earlier record in storage fails verification after reload and is not repaired', () => {
    const state = JSON.parse(memory.get(STORAGE_KEY)!);
    const victim = state.records.find((r: ReceivingRecord) => r.recordId === 'RCV-0001');
    const originalQty = victim.qtyReceived;
    victim.qtyReceived = originalQty + 50;
    memory.set(STORAGE_KEY, JSON.stringify(state));

    reloadFromStorage();
    const report = verifyIntegrity('org_demo_alpha');
    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual(expect.objectContaining({ kind: 'RECORD_CONTENT_MISMATCH', recordId: 'RCV-0001' }));
    // Loaded as found — not re-hashed or regenerated
    expect(getRecordById('org_demo_alpha', 'RCV-0001')!.qtyReceived).toBe(originalQty + 50);
    // Still failing after another reload
    reloadFromStorage();
    expect(verifyIntegrity('org_demo_alpha').ok).toBe(false);

    // Restore for the following tests
    const fixed = JSON.parse(memory.get(STORAGE_KEY)!);
    fixed.records.find((r: ReceivingRecord) => r.recordId === 'RCV-0001').qtyReceived = originalQty;
    memory.set(STORAGE_KEY, JSON.stringify(fixed));
    reloadFromStorage();
    expect(verifyIntegrity('org_demo_alpha').ok).toBe(true);
  });

  it('9c. altering an earlier chain link in storage is detected', () => {
    const state = JSON.parse(memory.get(STORAGE_KEY)!);
    state.auditChains.org_demo_alpha[3].prevHash = 'f'.repeat(64);
    memory.set(STORAGE_KEY, JSON.stringify(state));
    reloadFromStorage();
    const report = verifyIntegrity('org_demo_alpha');
    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual(expect.objectContaining({ kind: 'BROKEN_LINK', index: 3 }));
  });

  it('9d. deleting an earlier record from storage is detected', () => {
    resetToSampleData();
    const state = JSON.parse(memory.get(STORAGE_KEY)!);
    state.records = state.records.filter((r: ReceivingRecord) => r.recordId !== 'RCV-0002');
    memory.set(STORAGE_KEY, JSON.stringify(state));
    reloadFromStorage();
    expect(verifyIntegrity('org_demo_alpha').failures).toContainEqual(
      expect.objectContaining({ kind: 'RECORD_MISSING', recordId: 'RCV-0002' })
    );
  });

  it('9e. unreadable storage is reported, not silently replaced; only an explicit reset re-seeds', () => {
    memory.set(STORAGE_KEY, '{ this is not json');
    reloadFromStorage();
    const report = verifyIntegrity('org_demo_alpha');
    expect(report.ok).toBe(false);
    expect(report.failures[0].kind).toBe('STORAGE_UNREADABLE');
    expect(getRecordsByTenant('org_demo_alpha')).toHaveLength(0);
    // Saving is blocked so the corrupted evidence is not overwritten
    addReceivingRecord('org_demo_alpha', {
      ...({} as ReceivingRecord),
      recordId: 'RCV-AFTER-CORRUPTION',
      orgId: 'org_demo_alpha',
      unitId: '',
      poNumber: 'PO-X',
      poLine: 1,
      contentHash: '',
    } as ReceivingRecord);
    expect(memory.get(STORAGE_KEY)).toBe('{ this is not json');

    resetToSampleData();
    expect(verifyIntegrity('org_demo_alpha').ok).toBe(true);
    expect(getRecordsByTenant('org_demo_alpha').length).toBe(67);
  });
});
