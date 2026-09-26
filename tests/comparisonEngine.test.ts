import { describe, it, expect } from 'vitest';
import {
  calculateDifference,
  compareShipment,
  generateContentHash,
} from '../src/services/comparisonEngine';

describe('Receiving Comparison Engine', () => {
  it('correctly calculates difference: received - expected', () => {
    expect(calculateDifference(100, 100)).toBe(0);
    expect(calculateDifference(90, 100)).toBe(-10);
    expect(calculateDifference(110, 100)).toBe(10);
  });

  it('determines MATCHED status when SKU and quantity match exactly without defects', () => {
    const result = compareShipment({
      expectedSku: 'SKU-TOWEL-BLU',
      receivedSku: 'SKU-TOWEL-BLU',
      qtyOrdered: 100,
      qtyReceived: 100,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('MATCHED');
    expect(result.qtyDifference).toBe(0);
    expect(result.isSkuMatched).toBe(true);
    expect(result.disposition).toBe('ACCEPT_TO_PREP');
    expect(result.checks.every((c) => c.verdict === 'PASS')).toBe(true);
  });

  it('determines SHORT_RECEIVED status when quantity is lower than expected', () => {
    const result = compareShipment({
      expectedSku: 'SKU-TOWEL-BLU',
      receivedSku: 'SKU-TOWEL-BLU',
      qtyOrdered: 100,
      qtyReceived: 90,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('SHORT_RECEIVED');
    expect(result.qtyDifference).toBe(-10);
    expect(result.disposition).toBe('ACCEPT_WITH_SHORTAGE');
    expect(result.summaryExplanation).toContain('Short delivery');
  });

  it('determines OVER_RECEIVED status when quantity exceeds expected', () => {
    const result = compareShipment({
      expectedSku: 'SKU-CANDLE-3',
      receivedSku: 'SKU-CANDLE-3',
      qtyOrdered: 100,
      qtyReceived: 110,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('OVER_RECEIVED');
    expect(result.qtyDifference).toBe(10);
    expect(result.disposition).toBe('HOLD_SURPLUS');
  });

  it('determines WRONG_PRODUCT when received SKU does not match expected SKU', () => {
    const result = compareShipment({
      expectedSku: 'SKU-LEASH-6FT',
      receivedSku: 'SKU-LEASH-WRONG',
      qtyOrdered: 50,
      qtyReceived: 50,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('WRONG_PRODUCT');
    expect(result.isSkuMatched).toBe(false);
    expect(result.disposition).toBe('HOLD_QUARANTINE_RECOVERY');
  });

  it('determines DAMAGED when carton or unit damage is present', () => {
    const result = compareShipment({
      expectedSku: 'SKU-BOTTLE-750',
      receivedSku: 'SKU-BOTTLE-750',
      qtyOrdered: 24,
      qtyReceived: 24,
      cartonDamage: 'crushing',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('DAMAGED');
    expect(result.disposition).toBe('HOLD_QUARANTINE_RECOVERY');
  });

  it('determines QUALITY_DISCREPANCY when quality flags are present', () => {
    const result = compareShipment({
      expectedSku: 'SKU-CABLE-USBC',
      receivedSku: 'SKU-CABLE-USBC',
      qtyOrdered: 48,
      qtyReceived: 48,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: ['wrong_colour'],
    });

    expect(result.status).toBe('QUALITY_DISCREPANCY');
    expect(result.disposition).toBe('HOLD_QUARANTINE_RECOVERY');
  });

  it('treats UNCERTAIN as a first-class verdict per Engineering Rule 4', () => {
    const result = compareShipment({
      expectedSku: 'SKU-PUZZLE-500',
      receivedSku: 'SKU-PUZZLE-500',
      qtyOrdered: 48,
      qtyReceived: 48,
      cartonDamage: 'uncertain',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('UNCERTAIN');
    expect(result.disposition).toBe('SUPERVISOR_REVIEW');
  });

  it('generates consistent content hash for tamper evidence', () => {
    const hash1 = generateContentHash({
      poNumber: 'PO-7000',
      poLine: 1,
      sku: 'SKU-TOWEL-BLU',
      qtyReceived: 100,
      status: 'MATCHED',
      operatorId: 'op_eli',
      capturedAt: '2026-06-04T17:32:00Z',
    });

    const hash2 = generateContentHash({
      poNumber: 'PO-7000',
      poLine: 1,
      sku: 'SKU-TOWEL-BLU',
      qtyReceived: 100,
      status: 'MATCHED',
      operatorId: 'op_eli',
      capturedAt: '2026-06-04T17:32:00Z',
    });

    expect(hash1).toBe(hash2);
    expect(hash1.startsWith('sha256-01rcv-')).toBe(true);
  });
});
