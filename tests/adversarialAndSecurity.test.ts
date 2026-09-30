import { describe, it, expect } from 'vitest';
import {
  calculateDifference,
  compareShipment,
  generateContentHash,
} from '../src/services/comparisonEngine';
import {
  getRecordById,
  getRecordsByTenant,
  addReceivingRecord,
  applyOperatorOverride,
  initializeData,
} from '../src/services/dataService';
import {
  validateReceivingForm,
  validateOverrideReason,
} from '../src/services/validation';
import { ReceivingRecord } from '../src/types/receiving';

describe('Adversarial & Security Attack Verification (Red Team)', () => {
  it('prevents cross-tenant exfiltration (Row-Level Security violation attempt)', () => {
    initializeData();
    const bravoRecords = getRecordsByTenant('org_demo_bravo');
    expect(bravoRecords.length).toBeGreaterThan(0);
    const targetBravoId = bravoRecords[0].recordId;

    // Attacker operating under org_demo_alpha attempts direct lookup of Bravo record
    const attackResult = getRecordById('org_demo_alpha', targetBravoId);
    expect(attackResult).toBeNull();
  });

  it('detects tamper-evident hash alterations (Integrity violation attempt)', () => {
    const originalRecord = {
      poNumber: 'PO-7000',
      poLine: 1,
      sku: 'SKU-TOWEL-BLU',
      qtyReceived: 100,
      status: 'MATCHED',
      operatorId: 'op_eli',
      capturedAt: '2026-06-04T17:32:00Z',
    };
    const validHash = generateContentHash(originalRecord);

    // Attacker modifies received quantity from 100 to 90 without supervisor authorization
    const tamperedRecord = { ...originalRecord, qtyReceived: 90 };
    const tamperedHash = generateContentHash(tamperedRecord);

    expect(tamperedHash).not.toBe(validHash);
  });

  it('rejects malicious injection strings and non-numeric inputs', () => {
    const maliciousForm: any = {
      poNumber: "'; DROP TABLE po_lines; --",
      poLine: 'invalid_line',
      expectedSku: 'SKU-TOWEL-BLU',
      receivedSku: '<script>alert("XSS")</script>',
      cartonsReceived: 'NaN',
      unitsPerCartonCounted: -100,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
      operatorId: '',
    };

    const result = validateReceivingForm(maliciousForm);
    expect(result.isValid).toBe(false);
    expect(result.errors.poLine).toBeDefined();
    expect(result.errors.cartonsReceived).toBeDefined();
    expect(result.errors.unitsPerCartonCounted).toBeDefined();
    expect(result.errors.operatorId).toBeDefined();
  });

  it('handles extreme quantities without integer overflow or NaN breakdown', () => {
    const extremeQty = 1000000000;
    const diff = calculateDifference(extremeQty, 500);
    expect(diff).toBe(999999500);
    expect(Number.isFinite(diff)).toBe(true);

    const result = compareShipment({
      expectedSku: 'SKU-BULK',
      receivedSku: 'SKU-BULK',
      qtyOrdered: 500,
      qtyReceived: extremeQty,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('OVER_RECEIVED');
    expect(result.qtyDifference).toBe(999999500);
    expect(result.disposition).toBe('HOLD_SURPLUS');
  });

  it('enforces non-repudiation on operator overrides (no silent discard)', () => {
    initializeData();
    const alphaRecords = getRecordsByTenant('org_demo_alpha');
    const target = alphaRecords[0];

    const overridePayload = {
      originalStatus: target.status,
      newStatus: 'SHORT_RECEIVED' as const,
      reason: 'Supervisor manual verification of dock shortage on pallet 4',
      operatorId: 'supervisor_chen',
      timestamp: new Date().toISOString(),
    };

    const overridden = applyOperatorOverride('org_demo_alpha', target.recordId, overridePayload);
    expect(overridden).not.toBeNull();
    expect(overridden?.operatorOverride).toBeDefined();
    expect(overridden?.operatorOverride?.originalStatus).toBe(overridePayload.originalStatus);
    expect(overridden?.operatorOverride?.newStatus).toBe('SHORT_RECEIVED');
    expect(overridden?.operatorOverride?.reason).toBe(overridePayload.reason);
    expect(overridden?.contentHash).toContain('sha256-01rcv-');
  });
});
