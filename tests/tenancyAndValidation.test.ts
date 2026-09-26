import { describe, it, expect } from 'vitest';
import {
  getRecordsByTenant,
  getPOLinesByTenant,
  getRecordById,
  initializeData,
} from '../src/services/dataService';
import {
  validateReceivingForm,
  validateOverrideReason,
} from '../src/services/validation';

describe('Tenancy Isolation (Engineering Rule 1)', () => {
  it('strictly isolates records between org_demo_alpha and org_demo_bravo', () => {
    initializeData();

    const alphaRecords = getRecordsByTenant('org_demo_alpha');
    const bravoRecords = getRecordsByTenant('org_demo_bravo');

    expect(alphaRecords.length).toBeGreaterThan(0);
    expect(bravoRecords.length).toBeGreaterThan(0);

    // Alpha records should ONLY contain org_demo_alpha
    expect(alphaRecords.every((r) => r.orgId === 'org_demo_alpha')).toBe(true);

    // Bravo records should ONLY contain org_demo_bravo
    expect(bravoRecords.every((r) => r.orgId === 'org_demo_bravo')).toBe(true);

    // Alpha should not see Bravo record IDs
    const bravoFirstRecord = bravoRecords[0];
    const leakedRecord = getRecordById('org_demo_alpha', bravoFirstRecord.recordId);
    expect(leakedRecord).toBeNull();
  });

  it('strictly isolates PO lines between tenants', () => {
    const alphaPOs = getPOLinesByTenant('org_demo_alpha');
    const bravoPOs = getPOLinesByTenant('org_demo_bravo');

    expect(alphaPOs.every((p) => p.orgId === 'org_demo_alpha')).toBe(true);
    expect(bravoPOs.every((p) => p.orgId === 'org_demo_bravo')).toBe(true);
  });
});

describe('Input Validation & User Friendly Errors', () => {
  it('validates required fields', () => {
    const result = validateReceivingForm({
      poNumber: '',
      poLine: '',
      expectedSku: '',
      receivedSku: '',
      cartonsReceived: '',
      unitsPerCartonCounted: '',
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
      operatorId: '',
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.poNumber).toBeDefined();
    expect(result.errors.receivedSku).toBeDefined();
    expect(result.errors.cartonsReceived).toBeDefined();
    expect(result.errors.operatorId).toBeDefined();
  });

  it('rejects negative carton or unit quantities', () => {
    const result = validateReceivingForm({
      poNumber: 'PO-7000',
      poLine: 1,
      expectedSku: 'SKU-TOWEL-BLU',
      receivedSku: 'SKU-TOWEL-BLU',
      cartonsReceived: -5,
      unitsPerCartonCounted: 10,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
      operatorId: 'op_eli',
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.cartonsReceived).toContain('cannot be negative');
  });

  it('requires meaningful justification for operator overrides', () => {
    const shortReason = validateOverrideReason('ok');
    expect(shortReason.isValid).toBe(false);
    expect(shortReason.error).toBeDefined();

    const goodReason = validateOverrideReason('Supplier sent pre-approved replacement SKU');
    expect(goodReason.isValid).toBe(true);
  });
});
