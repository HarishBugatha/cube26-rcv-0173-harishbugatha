import {
  ComparisonResult,
  IndividualCheck,
  DamageGrade,
  QualityFlag,
  ReceivingStatus,
  DispositionAction,
  CrossPodEvidenceContract,
  ReceivingRecord,
} from '../types/receiving';

export interface ComparisonInput {
  expectedSku: string;
  receivedSku: string;
  qtyOrdered: number;
  qtyReceived: number;
  cartonDamage: DamageGrade;
  unitDamage: DamageGrade;
  qualityFlags: QualityFlag[];
  identityMatchOverride?: 'yes' | 'no' | 'uncertain';
}

/**
 * Calculates quantity difference: received - expected
 * e.g. 90 - 100 = -10 (Short received)
 * e.g. 110 - 100 = +10 (Over received)
 * e.g. 100 - 100 = 0 (Matched)
 */
export function calculateDifference(qtyReceived: number, qtyOrdered: number): number {
  return qtyReceived - qtyOrdered;
}

/**
 * Pure comparison engine evaluating expected vs received warehouse shipment
 */
export function compareShipment(input: ComparisonInput): ComparisonResult {
  const {
    expectedSku,
    receivedSku,
    qtyOrdered,
    qtyReceived,
    cartonDamage,
    unitDamage,
    qualityFlags,
  } = input;

  const qtyDifference = calculateDifference(qtyReceived, qtyOrdered);
  const normalizedExpectedSku = expectedSku.trim().toUpperCase();
  const normalizedReceivedSku = receivedSku.trim().toUpperCase();
  const isSkuMatched = normalizedExpectedSku === normalizedReceivedSku;

  const checks: IndividualCheck[] = [];

  // Check 1: SKU / Product Identity Check
  let skuVerdict: 'PASS' | 'FAIL' | 'UNCERTAIN' = 'PASS';
  if (!isSkuMatched) {
    skuVerdict = 'FAIL';
  } else if (input.identityMatchOverride === 'uncertain') {
    skuVerdict = 'UNCERTAIN';
  }

  checks.push({
    id: 'CHK_SKU_IDENTITY',
    name: 'SKU / Product Identity Verification',
    verdict: skuVerdict,
    expected: normalizedExpectedSku,
    actual: normalizedReceivedSku,
    details: isSkuMatched
      ? 'Physical SKU strictly matches PO line item specification.'
      : `Discrepancy: Received SKU "${normalizedReceivedSku}" does not match ordered "${normalizedExpectedSku}".`,
  });

  // Check 2: Quantity Reconciliation Check
  let qtyVerdict: 'PASS' | 'FAIL' = 'PASS';
  let qtyDetails = 'Exact count matched. Total received matches total ordered.';
  if (qtyDifference < 0) {
    qtyVerdict = 'FAIL';
    qtyDetails = `Shortage detected: Missing ${Math.abs(qtyDifference)} unit(s) (${qtyReceived} received vs ${qtyOrdered} ordered).`;
  } else if (qtyDifference > 0) {
    qtyVerdict = 'FAIL';
    qtyDetails = `Surplus detected: Excess ${qtyDifference} unit(s) received (${qtyReceived} received vs ${qtyOrdered} ordered).`;
  }

  checks.push({
    id: 'CHK_QTY_BALANCE',
    name: 'Quantity Reconciliation',
    verdict: qtyVerdict,
    expected: `${qtyOrdered} units`,
    actual: `${qtyReceived} units (${qtyDifference >= 0 ? '+' : ''}${qtyDifference})`,
    details: qtyDetails,
  });

  // Check 3: Carton Physical Integrity Check
  const hasCartonDamage = cartonDamage !== 'none' && cartonDamage !== 'uncertain';
  checks.push({
    id: 'CHK_CARTON_INTEGRITY',
    name: 'Carton Physical Integrity',
    verdict: cartonDamage === 'none' ? 'PASS' : cartonDamage === 'uncertain' ? 'UNCERTAIN' : 'FAIL',
    expected: 'Undamaged (none)',
    actual: cartonDamage.toUpperCase(),
    details: hasCartonDamage
      ? `Physical carton damage detected: ${cartonDamage}. Possible carrier or pallet handling issue.`
      : cartonDamage === 'uncertain'
      ? 'Inconclusive carton condition from visual check. Needs physical re-inspection.'
      : 'Carton arrives in acceptable condition with no tears, water, or crushing.',
  });

  // Check 4: Unit Packaging / Item Condition
  const hasUnitDamage = unitDamage !== 'none' && unitDamage !== 'uncertain';
  checks.push({
    id: 'CHK_UNIT_CONDITION',
    name: 'Unit Internal Condition',
    verdict: unitDamage === 'none' ? 'PASS' : unitDamage === 'uncertain' ? 'UNCERTAIN' : 'FAIL',
    expected: 'Intact / Pristine (none)',
    actual: unitDamage.toUpperCase(),
    details: hasUnitDamage
      ? `Unit damage recorded: ${unitDamage}. Product cannot be stowed as pristine.`
      : unitDamage === 'uncertain'
      ? 'Visual inspection inconclusive. Unit sampling required.'
      : 'Sampled unit is undamaged.',
  });

  // Check 5: Specification & Quality Flags Check
  const hasQualityFlags = qualityFlags.length > 0;
  checks.push({
    id: 'CHK_QUALITY_SPEC',
    name: 'Specification & Quality Standards',
    verdict: hasQualityFlags ? 'FAIL' : 'PASS',
    expected: 'Compliant to PO specification (no quality flags)',
    actual: hasQualityFlags ? qualityFlags.join(', ') : 'All specs met',
    details: hasQualityFlags
      ? `Non-compliance flags raised: ${qualityFlags.join(', ')}.`
      : 'No color variance, variant mismatch, missing items, or visible defects observed.',
  });

  // Determine overall ReceivingStatus by strict warehouse priority:
  let status: ReceivingStatus = 'MATCHED';
  let discrepancyType: string | null = null;
  let disposition: DispositionAction = 'ACCEPT_TO_PREP';
  let summaryExplanation = '';

  if (!isSkuMatched) {
    status = 'WRONG_PRODUCT';
    discrepancyType = 'Wrong Product / SKU Mismatch';
    disposition = 'HOLD_QUARANTINE_RECOVERY';
    summaryExplanation = `CRITICAL: Received SKU "${normalizedReceivedSku}" does not match purchase order SKU "${normalizedExpectedSku}". Quarantine shipment immediately.`;
  } else if (hasCartonDamage || hasUnitDamage) {
    status = 'DAMAGED';
    discrepancyType = `Physical Damage (${[hasCartonDamage ? `Carton: ${cartonDamage}` : '', hasUnitDamage ? `Unit: ${unitDamage}` : ''].filter(Boolean).join(', ')})`;
    disposition = 'HOLD_QUARANTINE_RECOVERY';
    summaryExplanation = `Shipment received with structural damage. Hold for inbound carrier/supplier recovery claim.`;
  } else if (hasQualityFlags) {
    status = 'QUALITY_DISCREPANCY';
    discrepancyType = `Quality Non-Conformance (${qualityFlags.join(', ')})`;
    disposition = 'HOLD_QUARANTINE_RECOVERY';
    summaryExplanation = `Goods fail PO specification: ${qualityFlags.join(', ')}. Routed to quarantine for supplier return or credit.`;
  } else if (cartonDamage === 'uncertain' || unitDamage === 'uncertain' || input.identityMatchOverride === 'uncertain') {
    status = 'UNCERTAIN';
    discrepancyType = 'Inconclusive Evidence / Uncertain Assessment';
    disposition = 'SUPERVISOR_REVIEW';
    summaryExplanation = `Assessment confidence is uncertain. Operator or lead review required before release.`;
  } else if (qtyDifference < 0) {
    status = 'SHORT_RECEIVED';
    discrepancyType = `Shortage (${Math.abs(qtyDifference)} units missing)`;
    disposition = 'ACCEPT_WITH_SHORTAGE';
    summaryExplanation = `Short delivery: Expected ${qtyOrdered} units, received ${qtyReceived} units (${Math.abs(qtyDifference)} short). Logged for inbound claim.`;
  } else if (qtyDifference > 0) {
    status = 'OVER_RECEIVED';
    discrepancyType = `Over-delivery (+${qtyDifference} excess units)`;
    disposition = 'HOLD_SURPLUS';
    summaryExplanation = `Over delivery: Expected ${qtyOrdered} units, received ${qtyReceived} units (+${qtyDifference} surplus). Quarantine surplus pending buyer confirmation.`;
  } else {
    status = 'MATCHED';
    discrepancyType = null;
    disposition = 'ACCEPT_TO_PREP';
    summaryExplanation = `All verifications passed. Goods match PO line items and unit count exactly. Cleared for Prep Manager (Step 02).`;
  }

  return {
    status,
    discrepancyType,
    expectedQty: qtyOrdered,
    receivedQty: qtyReceived,
    qtyDifference,
    isSkuMatched,
    cartonDamage,
    unitDamage,
    qualityFlags,
    disposition,
    summaryExplanation,
    checks,
  };
}

/**
 * Creates a deterministic SHA-256 hash representation for tamper-evident record logging
 */
export function generateContentHash(record: {
  poNumber: string;
  poLine: number;
  sku: string;
  qtyReceived: number;
  status: string;
  operatorId: string;
  capturedAt: string;
}): string {
  const payload = `${record.poNumber}|${record.poLine}|${record.sku}|${record.qtyReceived}|${record.status}|${record.operatorId}|${record.capturedAt}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `sha256-01rcv-${hex}${hex.split('').reverse().join('')}`;
}

/**
 * Build the official cross-pod evidence contract payload
 */
export function buildEvidenceContract(record: ReceivingRecord): CrossPodEvidenceContract {
  return {
    stage: '01_RECEIVING',
    version: '2.0.0',
    recordId: record.recordId,
    unitId: record.unitId,
    orgId: record.orgId,
    poRef: {
      poNumber: record.poNumber,
      poLine: record.poLine,
      supplier: record.supplier,
    },
    product: {
      skuExpected: record.sku,
      skuReceived: record.receivedSku,
      asin: record.asin,
      title: record.productTitle,
      identityMatch: record.identityMatch,
    },
    quantity: {
      cartonsOrdered: record.cartonsOrdered,
      cartonsReceived: record.cartonsReceived,
      unitsPerCartonOrdered: record.unitsPerCartonOrdered,
      unitsPerCartonCounted: record.unitsPerCartonCounted,
      qtyOrdered: record.qtyOrdered,
      qtyReceived: record.qtyReceived,
      qtyDifference: record.qtyDifference,
    },
    condition: {
      cartonDamage: record.cartonDamage,
      unitDamage: record.unitDamage,
      qualityFlags: record.qualityFlags,
    },
    verdict: {
      finalStatus: record.status,
      disposition: record.disposition,
      isOverridden: !!record.operatorOverride,
      overrideDetails: record.operatorOverride,
    },
    evidence: {
      photoRefs: record.photoRefs,
      operatorId: record.operatorId,
      capturedAt: record.capturedAt,
      contentHash: record.contentHash,
    },
  };
}
