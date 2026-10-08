import {
  DebateInspectionReport,
  DebatedClaim,
  DamageGrade,
  ObservedFeatures,
  PRDScenarioPo,
  QualityFlag,
  ReceivingRecord,
  TenantId,
} from '../types/receiving';
import { compareShipment } from './comparisonEngine';

/**
 * Converts a PRD-3 DEBATE inspection report into a receiving record.
 *
 * Single source of truth:
 * - expected values come from the purchase order the inspection ran against;
 * - observed values come from report.observedFeatures — the same features the
 *   engine generated its claims from;
 * - only VERIFIED claims become discrepancies; CHALLENGED claims become
 *   'uncertain'; REJECTED claims are ignored;
 * - status, quantity difference and disposition are computed by compareShipment,
 *   the same rule set used for CSV records and manual receiving.
 */

const DAMAGE_BY_CLAIM: Record<string, DamageGrade> = {
  PACKAGING_CRUSH: 'crushing',
  WATER_DAMAGE: 'water',
  TORN_PACKAGING_BROKEN_SEAL: 'tears',
};

const FLAG_BY_CLAIM: Record<string, QualityFlag> = {
  VARIANT_MISMATCH: 'wrong_variant',
  MISSING_COMPONENT: 'missing_components',
};

const IDENTITY_CLAIMS = new Set(['SKU_MISMATCH', 'AMBIGUOUS_LABEL', 'VARIANT_UNDETERMINED']);

// Vision-path findings that were not determinable from the photo (always CHALLENGED)
const UNCERTAIN_DAMAGE_CLAIMS = new Set(['PACKAGING_UNCLEAR']);

export interface InspectionRecordContext {
  tenantId: TenantId;
  operatorId: string;
  capturedAt: string;
  /** Leave empty to let dataService assign the next deterministic UNIT-####. */
  unitId?: string;
  imageSha256?: string;
}

/**
 * Observed features for a report. Reports without observedFeatures are treated as
 * "nothing observed" (source NONE) — PO values are never assumed to be observations.
 */
export function observedFeaturesOf(report: DebateInspectionReport, po: PRDScenarioPo): ObservedFeatures {
  const expected = Number(report.expectedQuantity ?? po.expectedQuantity) || 1;
  return (
    report.observedFeatures || {
      source: 'NONE',
      expectedQuantity: expected,
      itemsDetected: null,
      detectedSku: null,
      detectedVariant: null,
      packagingStatus: null,
      missingComponents: [],
    }
  );
}

/**
 * True only when verification completed and the engine had real observations (including a
 * unit count) to compare against the PO. Anything else is recorded as PENDING_REVIEW.
 */
export function isVisuallyVerified(report: DebateInspectionReport, po: PRDScenarioPo): boolean {
  const observed = observedFeaturesOf(report, po);
  if (report.verification && report.verification.status !== 'COMPLETE') return false;
  const count = observed.itemsDetected;
  return observed.source !== 'NONE' && typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
}

/** Human-readable reason why an inspection cannot be recorded as a verified receipt. */
export function pendingReasonFor(report: DebateInspectionReport, po: PRDScenarioPo): string {
  const reasons = report.verification?.reasons || [];
  if (reasons.length > 0) return reasons.map((r) => `${r.stage}: ${r.reason}`).join('; ');
  const observed = observedFeaturesOf(report, po);
  if (observed.source === 'NONE') return 'No visual observations (no vision model).';
  if (observed.itemsDetected === null) return 'Unit count not determinable from the photo.';
  return 'Visual verification not completed.';
}

/**
 * Rule 3 (fail open): an inspection whose verification did not complete still produces a
 * record, marked PENDING_REVIEW, with the reason preserved. Received quantities are null
 * (not counted) — nothing is inferred from the purchase order.
 */
export function buildPendingRecordFromInspection(
  report: DebateInspectionReport,
  po: PRDScenarioPo,
  ctx: InspectionRecordContext
): ReceivingRecord {
  const qtyOrdered = Number(report.expectedQuantity ?? po.expectedQuantity) || 1;
  const reason = pendingReasonFor(report, po);
  return {
    recordId: recordIdForInspection(report.inspectionId),
    unitId: ctx.unitId || '',
    orgId: ctx.tenantId,
    poNumber: report.poNumber,
    poLine: 1,
    supplier: report.vendor,
    sku: report.expectedSku,
    asin: '', // not known from a photo inspection
    productTitle: po.productName || 'Inspected product',
    specColour: po.expectedVariant || '',
    specVariant: po.expectedVariant || '',
    specComponents: (po.expectedComponents || []).join(', '),
    cartonsOrdered: 1,
    unitsPerCartonOrdered: qtyOrdered,
    qtyOrdered,
    cartonsReceived: null,
    unitsPerCartonCounted: null,
    qtyReceived: null,
    receivedSku: '',
    identityMatch: 'uncertain',
    cartonDamage: 'uncertain',
    unitDamage: 'uncertain',
    qualityFlags: [],
    photoRefs: [`evidence/${report.inspectionId}.png${ctx.imageSha256 ? `#sha256=${ctx.imageSha256}` : ''}`],
    operatorId: ctx.operatorId,
    capturedAt: ctx.capturedAt,
    status: 'PENDING_REVIEW',
    discrepancies: ['PENDING_REVIEW'],
    qtyDifference: null,
    disposition: 'SUPERVISOR_REVIEW',
    pendingReason: reason,
    notes: `PRD-3 DEBATE inspection ${report.inspectionId} [${report.finalVerdict}] · verification not completed: ${reason}`,
    contentHash: '',
  };
}

export function recordIdForInspection(inspectionId: string): string {
  return `RCV-${inspectionId.replace(/^INSP-/, '')}`;
}

export function buildRecordFromInspection(
  report: DebateInspectionReport,
  po: PRDScenarioPo,
  ctx: InspectionRecordContext
): ReceivingRecord {
  if (!isVisuallyVerified(report, po)) {
    // Recording would require inventing a received count; the delivery must be counted manually instead.
    throw new Error('Inspection has no visual observations (no vision model); it cannot be recorded as a receipt.');
  }
  const observed = observedFeaturesOf(report, po);
  const qtyOrdered = Number(report.expectedQuantity ?? po.expectedQuantity) || observed.expectedQuantity;
  const qtyReceived = observed.itemsDetected as number;

  const verified = (c: DebatedClaim) => c.status === 'VERIFIED';
  const challenged = (c: DebatedClaim) => c.status === 'CHALLENGED';
  const claims = report.debatedClaims || [];

  // Identity
  const skuMismatch = claims.some((c) => verified(c) && c.claimType === 'SKU_MISMATCH');
  const identityUncertain = claims.some((c) => challenged(c) && IDENTITY_CLAIMS.has(c.claimType));
  const identityMatch: ReceivingRecord['identityMatch'] = skuMismatch ? 'no' : identityUncertain ? 'uncertain' : 'yes';
  const receivedSku = skuMismatch ? String(observed.detectedSku) : report.expectedSku;

  // Carton condition
  let cartonDamage: DamageGrade = 'none';
  const verifiedDamage = claims.find((c) => verified(c) && DAMAGE_BY_CLAIM[c.claimType]);
  if (verifiedDamage) {
    cartonDamage = DAMAGE_BY_CLAIM[verifiedDamage.claimType];
  } else if (claims.some((c) => challenged(c) && (DAMAGE_BY_CLAIM[c.claimType] || UNCERTAIN_DAMAGE_CLAIMS.has(c.claimType)))) {
    cartonDamage = 'uncertain';
  }

  // Quality flags: every verified flag-type finding is preserved (deduplicated, stable order)
  const qualityFlags: QualityFlag[] = [];
  claims.forEach((c) => {
    const flag = FLAG_BY_CLAIM[c.claimType];
    if (flag && verified(c) && !qualityFlags.includes(flag)) qualityFlags.push(flag);
  });

  const evaluation = compareShipment({
    expectedSku: report.expectedSku,
    receivedSku,
    qtyOrdered,
    qtyReceived,
    cartonDamage,
    unitDamage: 'none',
    qualityFlags,
    identityMatchOverride: identityMatch,
    // Any CHALLENGED finding (quantity, component, variant, nominal check, …) keeps the record
    // UNCERTAIN, matching the report verdict — an unresolved finding is never recorded as MATCHED.
    uncertain: claims.some(challenged) || report.finalVerdict === 'UNCERTAIN',
  });

  const findingSummary = claims
    .map((c) => `${c.claimId}=${c.status}`)
    .join(', ');

  return {
    recordId: recordIdForInspection(report.inspectionId),
    unitId: ctx.unitId || '',
    orgId: ctx.tenantId,
    poNumber: report.poNumber,
    poLine: 1,
    supplier: report.vendor,
    sku: report.expectedSku,
    asin: '', // not known from a photo inspection
    productTitle: po.productName || 'Inspected product',
    specColour: po.expectedVariant || '',
    specVariant: po.expectedVariant || '',
    specComponents: (po.expectedComponents || []).join(', '),
    cartonsOrdered: 1,
    unitsPerCartonOrdered: qtyOrdered,
    qtyOrdered,
    cartonsReceived: 1,
    unitsPerCartonCounted: qtyReceived,
    qtyReceived,
    receivedSku,
    identityMatch,
    cartonDamage,
    unitDamage: 'none',
    qualityFlags,
    photoRefs: [
      `evidence/${report.inspectionId}.png${ctx.imageSha256 ? `#sha256=${ctx.imageSha256}` : ''}`,
    ],
    operatorId: ctx.operatorId,
    capturedAt: ctx.capturedAt,
    status: evaluation.status,
    discrepancies: evaluation.discrepancies,
    qtyDifference: evaluation.qtyDifference,
    disposition: evaluation.disposition,
    notes: `PRD-3 DEBATE inspection ${report.inspectionId} [${report.finalVerdict}] · findings: ${findingSummary} · observed source: ${observed.source}`,
    // Computed from the stored content by dataService.addReceivingRecord
    contentHash: '',
  };
}
