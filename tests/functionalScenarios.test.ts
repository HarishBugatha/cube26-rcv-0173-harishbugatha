import { describe, it, expect } from 'vitest';
import { compareShipment, calculateDifference } from '../src/services/comparisonEngine';
import { validateReceivingForm } from '../src/services/validation';
import { initializeData, getPOLinesByTenant } from '../src/services/dataService';

describe('Receiving Manager — 13 Functional Scenarios', () => {
  // Scenario 1: Correct shipment
  it('Scenario 1: Correct shipment -> MATCHED (Expected: 100, Received: 100, SKU matches)', () => {
    const expectedQty = 100;
    const receivedQty = 100;
    const expectedSku = 'SKU-001';
    const receivedSku = 'SKU-001';

    const diff = calculateDifference(receivedQty, expectedQty);
    expect(diff).toBe(0);

    const result = compareShipment({
      expectedSku,
      receivedSku,
      qtyOrdered: expectedQty,
      qtyReceived: receivedQty,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('MATCHED');
    expect(result.qtyDifference).toBe(0);
    expect(result.isSkuMatched).toBe(true);
    expect(result.disposition).toBe('ACCEPT_TO_PREP');
  });

  // Scenario 2: Short shipment
  it('Scenario 2: Short shipment -> SHORT_RECEIVED (Expected: 100, Received: 90, Difference: -10)', () => {
    const expectedQty = 100;
    const receivedQty = 90;

    const diff = calculateDifference(receivedQty, expectedQty);
    expect(diff).toBe(-10);

    const result = compareShipment({
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      qtyOrdered: expectedQty,
      qtyReceived: receivedQty,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('SHORT_RECEIVED');
    expect(result.qtyDifference).toBe(-10);
    expect(result.disposition).toBe('ACCEPT_WITH_SHORTAGE');
    expect(result.discrepancyType).toContain('Shortage');
  });

  // Scenario 3: Over shipment
  it('Scenario 3: Over shipment -> OVER_RECEIVED (Expected: 100, Received: 110, Difference: +10)', () => {
    const expectedQty = 100;
    const receivedQty = 110;

    const diff = calculateDifference(receivedQty, expectedQty);
    expect(diff).toBe(10);

    const result = compareShipment({
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      qtyOrdered: expectedQty,
      qtyReceived: receivedQty,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('OVER_RECEIVED');
    expect(result.qtyDifference).toBe(10);
    expect(result.disposition).toBe('HOLD_SURPLUS');
    expect(result.discrepancyType).toContain('Over-delivery');
  });

  // Scenario 4: Wrong SKU
  it('Scenario 4: Wrong SKU -> WRONG_PRODUCT (Expected: SKU-001, Received: SKU-002)', () => {
    const expectedSku = 'SKU-001';
    const receivedSku = 'SKU-002';

    const result = compareShipment({
      expectedSku,
      receivedSku,
      qtyOrdered: 100,
      qtyReceived: 100,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('WRONG_PRODUCT');
    expect(result.isSkuMatched).toBe(false);
    expect(result.disposition).toBe('HOLD_QUARANTINE_RECOVERY');
    expect(result.discrepancyType).toBe('Wrong Product / SKU Mismatch');
  });

  // Scenario 5: Zero received
  it('Scenario 5: Zero received -> SHORT_RECEIVED (Expected: 100, Received: 0, Difference: -100)', () => {
    const expectedQty = 100;
    const receivedQty = 0;

    const diff = calculateDifference(receivedQty, expectedQty);
    expect(diff).toBe(-100);

    const result = compareShipment({
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      qtyOrdered: expectedQty,
      qtyReceived: receivedQty,
      cartonDamage: 'none',
      unitDamage: 'none',
      qualityFlags: [],
    });

    expect(result.status).toBe('SHORT_RECEIVED');
    expect(result.qtyDifference).toBe(-100);
    expect(result.disposition).toBe('ACCEPT_WITH_SHORTAGE');
  });

  // Scenario 6: Missing purchase order
  it('Scenario 6: Missing purchase order -> validation error', () => {
    const validationEmptyPO = validateReceivingForm({
      poNumber: '',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      cartonsReceived: 10,
      unitsPerCartonCounted: 10,
      operatorId: 'op_warehouse_01',
    });
    expect(validationEmptyPO.isValid).toBe(false);
    expect(validationEmptyPO.errors.poNumber).toBeDefined();

    const validationMissingLine = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: '',
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      cartonsReceived: 10,
      unitsPerCartonCounted: 10,
      operatorId: 'op_warehouse_01',
    });
    expect(validationMissingLine.isValid).toBe(false);
    expect(validationMissingLine.errors.poLine).toBeDefined();
  });

  // Scenario 7: Missing product/SKU
  it('Scenario 7: Missing product/SKU -> validation error', () => {
    const validationMissingReceivedSku = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: '',
      cartonsReceived: 10,
      unitsPerCartonCounted: 10,
      operatorId: 'op_warehouse_01',
    });
    expect(validationMissingReceivedSku.isValid).toBe(false);
    expect(validationMissingReceivedSku.errors.receivedSku).toBeDefined();

    const validationMissingExpectedSku = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: '',
      receivedSku: 'SKU-001',
      cartonsReceived: 10,
      unitsPerCartonCounted: 10,
      operatorId: 'op_warehouse_01',
    });
    expect(validationMissingExpectedSku.isValid).toBe(false);
    expect(validationMissingExpectedSku.errors.expectedSku).toBeDefined();
  });

  // Scenario 8: Missing received quantity
  it('Scenario 8: Missing received quantity -> validation error', () => {
    const validationMissingCartons = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      cartonsReceived: '',
      unitsPerCartonCounted: 10,
      operatorId: 'op_warehouse_01',
    });
    expect(validationMissingCartons.isValid).toBe(false);
    expect(validationMissingCartons.errors.cartonsReceived).toBeDefined();

    const validationMissingUnits = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      cartonsReceived: 10,
      unitsPerCartonCounted: '',
      operatorId: 'op_warehouse_01',
    });
    expect(validationMissingUnits.isValid).toBe(false);
    expect(validationMissingUnits.errors.unitsPerCartonCounted).toBeDefined();

    const validationMissingDirect = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      directQtyReceived: '',
      operatorId: 'op_warehouse_01',
    });
    expect(validationMissingDirect.isValid).toBe(false);
    expect(validationMissingDirect.errors.directQtyReceived).toBeDefined();
  });

  // Scenario 9: Negative quantity
  it('Scenario 9: Negative quantity -> validation error', () => {
    const validationNegativeCartons = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      cartonsReceived: -5,
      unitsPerCartonCounted: 10,
      operatorId: 'op_warehouse_01',
    });
    expect(validationNegativeCartons.isValid).toBe(false);
    expect(validationNegativeCartons.errors.cartonsReceived).toBe('Carton count cannot be negative.');

    const validationNegativeUnits = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      cartonsReceived: 5,
      unitsPerCartonCounted: -10,
      operatorId: 'op_warehouse_01',
    });
    expect(validationNegativeUnits.isValid).toBe(false);
    expect(validationNegativeUnits.errors.unitsPerCartonCounted).toBe('Units per carton cannot be negative.');

    const validationNegativeDirect = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      directQtyReceived: -50,
      operatorId: 'op_warehouse_01',
    });
    expect(validationNegativeDirect.isValid).toBe(false);
    expect(validationNegativeDirect.errors.directQtyReceived).toBe('Received quantity cannot be negative.');
  });

  // Scenario 10: Non-numeric quantity
  it('Scenario 10: Non-numeric quantity -> validation error', () => {
    const validationNaN = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      cartonsReceived: NaN,
      unitsPerCartonCounted: 10,
      operatorId: 'op_warehouse_01',
    });
    expect(validationNaN.isValid).toBe(false);
    expect(validationNaN.errors.cartonsReceived).toBe('Cartons received must be a valid numeric quantity.');

    const validationString = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      cartonsReceived: 'invalid_qty' as any,
      unitsPerCartonCounted: 10,
      operatorId: 'op_warehouse_01',
    });
    expect(validationString.isValid).toBe(false);
    expect(validationString.errors.cartonsReceived).toBe('Cartons received must be a valid numeric quantity.');

    const validationDirectNaN = validateReceivingForm({
      poNumber: 'PO-1001',
      poLine: 1,
      expectedSku: 'SKU-001',
      receivedSku: 'SKU-001',
      directQtyReceived: 'abc' as any,
      operatorId: 'op_warehouse_01',
    });
    expect(validationDirectNaN.isValid).toBe(false);
    expect(validationDirectNaN.errors.directQtyReceived).toBe('Received quantity must be a valid numeric quantity.');
  });

  // Scenario 11: Partial receiving
  it('Scenario 11: Partial receiving -> accurately computes quantity difference', () => {
    const expectedQty = 100;
    const partialDeliveries = [
      { receivedQty: 25, expectedDiff: -75 },
      { receivedQty: 40, expectedDiff: -60 },
      { receivedQty: 85, expectedDiff: -15 },
    ];

    partialDeliveries.forEach(({ receivedQty, expectedDiff }) => {
      const diff = calculateDifference(receivedQty, expectedQty);
      expect(diff).toBe(expectedDiff);

      const result = compareShipment({
        expectedSku: 'SKU-PARTIAL-01',
        receivedSku: 'SKU-PARTIAL-01',
        qtyOrdered: expectedQty,
        qtyReceived: receivedQty,
        cartonDamage: 'none',
        unitDamage: 'none',
        qualityFlags: [],
      });

      expect(result.status).toBe('SHORT_RECEIVED');
      expect(result.qtyDifference).toBe(expectedDiff);
      expect(result.disposition).toBe('ACCEPT_WITH_SHORTAGE');
      expect(result.discrepancyType).toBe(`Shortage (${Math.abs(expectedDiff)} units missing)`);
    });
  });

  // Scenario 12: Multiple purchase orders
  it('Scenario 12: Multiple purchase orders -> selecting a PO displays correct supplier/product/expected info', () => {
    initializeData();
    const alphaPOLines = getPOLinesByTenant('org_demo_alpha');
    expect(alphaPOLines.length).toBeGreaterThan(1);

    // Pick two distinct POs
    const poA = alphaPOLines.find((p) => p.poNumber === 'PO-7026' && p.poLine === 1);
    const poB = alphaPOLines.find((p) => p.poNumber === 'PO-7026' && p.poLine === 2);

    expect(poA).toBeDefined();
    expect(poB).toBeDefined();

    // Verify PO A details
    expect(poA?.poNumber).toBe('PO-7026');
    expect(poA?.poLine).toBe(1);
    expect(poA?.sku).toBe('SKU-TOWEL-BLU');
    expect(poA?.productTitle).toBe('Cotton Bath Towel (Dock Ready)');
    expect(poA?.qtyOrdered).toBe(72);
    expect(poA?.supplier).toBe('Supplier East (DUMMY)');

    // Verify PO B details
    expect(poB?.poNumber).toBe('PO-7026');
    expect(poB?.poLine).toBe(2);
    expect(poB?.sku).toBe('SKU-CANDLE-3');
    expect(poB?.productTitle).toBe('Soy Candle Trio Set');
    expect(poB?.qtyOrdered).toBe(48);
    expect(poB?.supplier).toBe('Supplier East (DUMMY)');

    // Ensure PO A and PO B differ in SKU and expected count
    expect(poA?.sku).not.toBe(poB?.sku);
    expect(poA?.qtyOrdered).not.toBe(poB?.qtyOrdered);
  });

  // Scenario 13: Multiple suppliers
  it('Scenario 13: Multiple suppliers -> supplier info remains associated with the correct PO', () => {
    initializeData();
    const allPOLines = [
      ...getPOLinesByTenant('org_demo_alpha'),
      ...getPOLinesByTenant('org_demo_bravo'),
    ];

    // Find specific POs
    const po7026 = allPOLines.find((p) => p.poNumber === 'PO-7026');
    const po8001 = allPOLines.find((p) => p.poNumber === 'PO-8001');

    expect(po7026).toBeDefined();
    expect(po8001).toBeDefined();

    // Verify correct supplier associations
    expect(po7026?.supplier).toBe('Supplier East (DUMMY)');
    expect(po8001?.supplier).toBe('Supplier Coastal (DUMMY)');

    // Ensure suppliers are distinct and never crossed or swapped
    expect(po7026?.supplier).not.toBe(po8001?.supplier);

    // Filter by supplier and verify all returned lines match only that supplier
    const eastLines = allPOLines.filter((p) => p.supplier === 'Supplier East (DUMMY)');
    const coastalLines = allPOLines.filter((p) => p.supplier === 'Supplier Coastal (DUMMY)');

    expect(eastLines.length).toBeGreaterThan(0);
    expect(coastalLines.length).toBeGreaterThan(0);

    eastLines.forEach((line) => {
      expect(line.supplier).toBe('Supplier East (DUMMY)');
    });

    coastalLines.forEach((line) => {
      expect(line.supplier).toBe('Supplier Coastal (DUMMY)');
    });
  });
});
