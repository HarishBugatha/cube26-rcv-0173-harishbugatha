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
import { sha256Hex, canonicalJson } from './sha256';

export interface ComparisonInput {
  expectedSku: string;
  receivedSku: string;
  qtyOrdered: number;
  qtyReceived: number;
  cartonDamage: DamageGrade;
  unitDamage: DamageGrade;
  qualityFlags: QualityFlag[];
  identityMatchOverride?: 'yes' | 'no' | 'uncertain';
  /** Evidence left a finding unresolved (e.g. a CHALLENGED inspection finding); never MATCHED. */
  uncertain?: boolean;
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
  // NaN / negative / fractional counts compare as neither short nor over, so they would silently
  // read as MATCHED; they are UNCERTAIN instead (live previews call this with partial input, so no throw).
  const isCount = (n: number) => Number.isSafeInteger(n) && n >= 0;
  const qtyValid = isCount(qtyReceived) && isCount(qtyOrdered);
  let qtyVerdict: 'PASS' | 'FAIL' | 'UNCERTAIN' = 'PASS';
  let qtyDetails = 'Exact count matched. Total received matches total ordered.';
  if (!qtyValid) {
    qtyVerdict = 'UNCERTAIN';
    qtyDetails = `Quantities are not valid whole-unit counts (${qtyReceived} received vs ${qtyOrdered} ordered). Recount required.`;
  } else if (qtyDifference < 0) {
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

  // Collect every discrepancy that is present (nothing is hidden behind another).
  // Order = priority of the primary status:
  //   wrong product > quantity (short / over) > damage > quality > uncertain
  // Quantity outranks damage/quality so a shortage or surplus is never masked by a
  // generic quality flag; damage and quality facts stay in `discrepancies`,
  // cartonDamage/unitDamage and qualityFlags.
  const isUncertain =
    !qtyValid || !!input.uncertain || cartonDamage === 'uncertain' || unitDamage === 'uncertain' || input.identityMatchOverride === 'uncertain';
  const discrepancies: ReceivingStatus[] = [];
  if (!isSkuMatched) discrepancies.push('WRONG_PRODUCT');
  if (qtyValid && qtyDifference < 0) discrepancies.push('SHORT_RECEIVED');
  if (qtyValid && qtyDifference > 0) discrepancies.push('OVER_RECEIVED');
  if (hasCartonDamage || hasUnitDamage) discrepancies.push('DAMAGED');
  if (hasQualityFlags) discrepancies.push('QUALITY_DISCREPANCY');
  if (isUncertain) discrepancies.push('UNCERTAIN');

  const status: ReceivingStatus = discrepancies[0] || 'MATCHED';

  const describe: Record<string, string> = {
    WRONG_PRODUCT: 'Wrong Product / SKU Mismatch',
    SHORT_RECEIVED: `Shortage (${Math.abs(qtyDifference)} units missing)`,
    OVER_RECEIVED: `Over-delivery (+${qtyDifference} excess units)`,
    DAMAGED: `Physical Damage (${[hasCartonDamage ? `Carton: ${cartonDamage}` : '', hasUnitDamage ? `Unit: ${unitDamage}` : ''].filter(Boolean).join(', ')})`,
    QUALITY_DISCREPANCY: `Quality Non-Conformance (${qualityFlags.join(', ')})`,
    UNCERTAIN: 'Inconclusive Evidence / Uncertain Assessment',
  };
  const discrepancyType: string | null = discrepancies.length ? discrepancies.map((d) => describe[d]).join(' + ') : null;

  // Disposition = most protective action required by any discrepancy present
  const needsQuarantine = discrepancies.some((d) => d === 'WRONG_PRODUCT' || d === 'DAMAGED' || d === 'QUALITY_DISCREPANCY');
  let disposition: DispositionAction = 'ACCEPT_TO_PREP';
  if (needsQuarantine) disposition = 'HOLD_QUARANTINE_RECOVERY';
  else if (isUncertain) disposition = 'SUPERVISOR_REVIEW';
  else if (qtyDifference < 0) disposition = 'ACCEPT_WITH_SHORTAGE';
  else if (qtyDifference > 0) disposition = 'HOLD_SURPLUS';

  const sentences: Record<string, string> = {
    WRONG_PRODUCT: `CRITICAL: Received SKU "${normalizedReceivedSku}" does not match purchase order SKU "${normalizedExpectedSku}". Quarantine shipment immediately.`,
    SHORT_RECEIVED: `Short delivery: Expected ${qtyOrdered} units, received ${qtyReceived} units (${Math.abs(qtyDifference)} short). Logged for inbound claim.`,
    OVER_RECEIVED: `Over delivery: Expected ${qtyOrdered} units, received ${qtyReceived} units (+${qtyDifference} surplus). Quarantine surplus pending buyer confirmation.`,
    DAMAGED: 'Shipment received with structural damage. Hold for inbound carrier/supplier recovery claim.',
    QUALITY_DISCREPANCY: `Goods fail PO specification: ${qualityFlags.join(', ')}. Routed to quarantine for supplier return or credit.`,
    UNCERTAIN: 'Assessment confidence is uncertain. Operator or lead review required before release.',
  };
  const summaryExplanation = discrepancies.length
    ? discrepancies.map((d) => sentences[d]).join(' ')
    : 'All verifications passed. Goods match PO line items and unit count exactly. Cleared for Prep Manager (Step 02).';

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
    discrepancies,
  };
}

/** Prefix identifying a Stage-01 receiving-record content hash; followed by 64 hex chars of SHA-256. */
export const CONTENT_HASH_PREFIX = 'sha256-01rcv-';

/**
 * SHA-256 content hash of a receiving record (or any subset of its fields).
 * The hash covers the canonical JSON of every field except `contentHash`
 * itself, so any change to the stored content produces a different hash.
 * Detecting that change is done by integrity verification against the
 * audit hash chain (see dataService.verifyIntegrity).
 */
export function generateContentHash(record: object): string {
  const { contentHash: _ignored, ...content } = record as Record<string, unknown>;
  return `${CONTENT_HASH_PREFIX}${sha256Hex(canonicalJson(content))}`;
}

/** All discrepancies on a record (falls back to its primary status for older records). */
export function recordDiscrepancies(record: Pick<ReceivingRecord, 'status' | 'discrepancies'>): ReceivingStatus[] {
  if (record.discrepancies && record.discrepancies.length > 0) return record.discrepancies;
  return record.status === 'MATCHED' ? [] : [record.status];
}

/** True when the record has this discrepancy as its primary status or as an additional one. */
export function recordHasStatus(record: Pick<ReceivingRecord, 'status' | 'discrepancies'>, status: ReceivingStatus): boolean {
  return record.status === status || recordDiscrepancies(record).includes(status);
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
      discrepancies: recordDiscrepancies(record),
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
