import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { buildRecordFromInspection, recordIdForInspection } from '../src/services/inspectionRecord';
import { calculateDifference } from '../src/services/comparisonEngine';
import { addReceivingRecord, getRecordById, initializeData, verifyIntegrity } from '../src/services/dataService';
import { DebateInspectionReport, PRDScenarioPo } from '../src/types/receiving';

const require = createRequire(import.meta.url);
const { runDebatePipeline } = require('../server/debateEngine.js');
const { SCENARIOS } = require('../server/scenarios.js');

const EXPECTED_VERDICTS: Record<string, string> = {
  'scenario-1-correct': 'ACCEPT',
  'scenario-2-short-quantity': 'EXCEPTION',
  'scenario-3-extra-quantity': 'EXCEPTION',
  'scenario-4-wrong-sku': 'EXCEPTION',
  'scenario-5-wrong-variant': 'EXCEPTION',
  'scenario-6-crushed-packaging': 'EXCEPTION',
  'scenario-7-water-damage': 'EXCEPTION',
  'scenario-8-torn-packaging': 'EXCEPTION',
  'scenario-9-missing-component': 'EXCEPTION',
  'scenario-10-ambiguous': 'UNCERTAIN',
};

const ctx = (i: number) => ({
  tenantId: 'org_demo_alpha' as const,
  operatorId: 'op_test',
  capturedAt: '2026-10-06T10:00:00.000Z',
  unitId: `UNIT-T${i}`,
  imageSha256: 'a'.repeat(64),
});

async function inspect(id: string) {
  const scenario = SCENARIOS.find((s: any) => s.id === id);
  const report: DebateInspectionReport = await runDebatePipeline(scenario);
  return { scenario, report, po: scenario.po as PRDScenarioPo };
}

describe('Inspection → receiving record: one source of truth', () => {
  it('every report exposes the observed features its claims were generated from', async () => {
    for (const id of Object.keys(EXPECTED_VERDICTS)) {
      const { scenario, report } = await inspect(id);
      expect(report.observedFeatures).toBeDefined();
      expect(report.observedFeatures!.source).toBe('SCENARIO_METADATA');
      expect(report.observedFeatures!.itemsDetected).toBe(scenario.visualMetadata.itemsDetected);
      expect(report.observedFeatures!.expectedQuantity).toBe(scenario.po.expectedQuantity);
    }
  });

  it('all 10 scenarios: verdict, quantities and difference agree across report, graph and record', async () => {
    let i = 0;
    for (const [id, verdict] of Object.entries(EXPECTED_VERDICTS)) {
      const { report, po } = await inspect(id);
      expect(report.finalVerdict, id).toBe(verdict);

      const record = buildRecordFromInspection(report, po, ctx(i++));
      const observed = report.observedFeatures!;

      // Quantities: PO → report → record
      expect(record.qtyOrdered, id).toBe(po.expectedQuantity);
      expect(record.qtyOrdered, id).toBe(Number(report.expectedQuantity));
      expect(record.qtyReceived, id).toBe(observed.itemsDetected);
      expect(record.cartonsReceived * record.unitsPerCartonCounted, id).toBe(record.qtyReceived);
      expect(record.qtyDifference, id).toBe(calculateDifference(record.qtyReceived, record.qtyOrdered));

      // Quantity finding text uses the same numbers as the record
      const qtyClaim = report.debatedClaims.find((c) => c.claimType === 'QUANTITY_SHORTAGE' || c.claimType === 'QUANTITY_OVERAGE');
      if (record.qtyDifference !== 0) {
        expect(qtyClaim, id).toBeDefined();
        expect(qtyClaim!.poExpected).toContain(`${record.qtyOrdered} Units`);
        expect(qtyClaim!.physicalObserved).toContain(`${record.qtyReceived} Units`);
      } else {
        expect(qtyClaim, id).toBeUndefined();
      }

      // Evidence graph carries exactly the report's claims and statuses
      const claimNodes = report.evidenceGraph.nodes.filter((n) => n.type === 'CLAIM');
      expect(claimNodes.length, id).toBe(report.debatedClaims.length);
      claimNodes.forEach((node, idx) => {
        const claim = report.debatedClaims[idx];
        expect(node.status).toBe(claim.status);
        expect(node.data.observed).toBe(claim.physicalObserved);
        expect(node.data.expected).toBe(claim.poExpected);
      });
      expect(report.evidenceGraph.nodes.find((n) => n.type === 'VERDICT')?.status).toBe(report.finalVerdict);

      // Verdict family is reflected in the record status
      if (verdict === 'ACCEPT') expect(record.status, id).toBe('MATCHED');
      if (verdict === 'UNCERTAIN') expect(record.status, id).toBe('UNCERTAIN');
      if (verdict === 'EXCEPTION') expect(['MATCHED', 'UNCERTAIN']).not.toContain(record.status);

      // Record is linked to the inspection deterministically
      expect(record.recordId).toBe(recordIdForInspection(report.inspectionId));
      expect(record.notes).toContain(report.inspectionId);
    }
  });

  it('short scenario: 12 expected, 9 received, difference -3, missing component preserved', async () => {
    const { report, po } = await inspect('scenario-2-short-quantity');
    const record = buildRecordFromInspection(report, po, ctx(100));

    expect(record.qtyOrdered).toBe(12);
    expect(record.qtyReceived).toBe(9);
    expect(record.qtyDifference).toBe(-3);
    expect(record.qualityFlags).toContain('missing_components');

    const verifiedTypes = report.debatedClaims.filter((c) => c.status === 'VERIFIED').map((c) => c.claimType);
    expect(verifiedTypes).toEqual(expect.arrayContaining(['QUANTITY_SHORTAGE', 'MISSING_COMPONENT']));
    // Shortage is the primary status; the quality issue is kept alongside it
    expect(record.status).toBe('SHORT_RECEIVED');
    expect(record.discrepancies).toEqual(['SHORT_RECEIVED', 'QUALITY_DISCREPANCY']);
    // Quality defect still requires quarantine
    expect(record.disposition).toBe('HOLD_QUARANTINE_RECOVERY');

    // Stored record (what the dashboard reads) keeps the same values and passes integrity verification
    initializeData();
    const stored = addReceivingRecord('org_demo_alpha', record);
    const fetched = getRecordById('org_demo_alpha', stored.recordId)!;
    expect(fetched.qtyReceived).toBe(9);
    expect(fetched.qtyDifference).toBe(-3);
    expect(fetched.qualityFlags).toContain('missing_components');
    expect(fetched.status).toBe('SHORT_RECEIVED');
    expect(fetched.unitId).toMatch(/^UNIT-\d{4}$/);
    expect(verifyIntegrity('org_demo_alpha').ok).toBe(true);
  });

  it('missing-component scenario: flag recorded, status QUALITY_DISCREPANCY, quantity unchanged', async () => {
    const { report, po } = await inspect('scenario-9-missing-component');
    const record = buildRecordFromInspection(report, po, ctx(101));
    expect(report.debatedClaims.some((c) => c.claimType === 'MISSING_COMPONENT' && c.status === 'VERIFIED')).toBe(true);
    expect(record.qualityFlags).toEqual(['missing_components']);
    expect(record.qtyDifference).toBe(0);
    expect(record.status).toBe('QUALITY_DISCREPANCY');
  });

  it('wrong SKU, damage and variant findings map to the matching record fields', async () => {
    const wrongSku = await inspect('scenario-4-wrong-sku');
    const r4 = buildRecordFromInspection(wrongSku.report, wrongSku.po, ctx(102));
    expect(r4.identityMatch).toBe('no');
    expect(r4.receivedSku).toBe(wrongSku.report.observedFeatures!.detectedSku);
    expect(r4.status).toBe('WRONG_PRODUCT');

    const water = await inspect('scenario-7-water-damage');
    expect(buildRecordFromInspection(water.report, water.po, ctx(103)).cartonDamage).toBe('water');

    const variant = await inspect('scenario-5-wrong-variant');
    expect(buildRecordFromInspection(variant.report, variant.po, ctx(104)).qualityFlags).toContain('wrong_variant');
  });

  it('challenged (uncertain) findings are recorded as uncertain, never as defects', async () => {
    const { report, po } = await inspect('scenario-10-ambiguous');
    const record = buildRecordFromInspection(report, po, ctx(105));
    expect(record.identityMatch).toBe('uncertain');
    expect(record.receivedSku).toBe(report.expectedSku);
    expect(record.qualityFlags).toEqual([]);
    expect(record.status).toBe('UNCERTAIN');
    expect(record.disposition).toBe('SUPERVISOR_REVIEW');
  });
});
