export type TenantId = 'org_demo_alpha' | 'org_demo_bravo';

export type DamageGrade = 'none' | 'crushing' | 'water' | 'tears' | 'uncertain';

export type QualityFlag =
  | 'wrong_colour'
  | 'wrong_variant'
  | 'missing_components'
  | 'obvious_defect';

export type CheckVerdict = 'PASS' | 'FAIL' | 'UNCERTAIN';

export type ReceivingStatus =
  | 'MATCHED'
  | 'SHORT_RECEIVED'
  | 'OVER_RECEIVED'
  | 'WRONG_PRODUCT'
  | 'DAMAGED'
  | 'QUALITY_DISCREPANCY'
  | 'UNCERTAIN'
  | 'PENDING_REVIEW';

export type DispositionAction =
  | 'ACCEPT_TO_PREP'
  | 'HOLD_QUARANTINE_RECOVERY'
  | 'ACCEPT_WITH_SHORTAGE'
  | 'HOLD_SURPLUS'
  | 'SUPERVISOR_REVIEW';

export interface PurchaseOrderLine {
  id: string;
  poNumber: string;
  poLine: number;
  orgId: TenantId;
  supplier: string;
  sku: string;
  asin: string;
  productTitle: string;
  specColour: string;
  specVariant: string;
  specComponents: string;
  cartonsOrdered: number;
  unitsPerCartonOrdered: number;
  qtyOrdered: number;
  status: 'PENDING' | 'RECEIVING' | 'COMPLETED' | 'FLAGGED';
  updatedAt?: string;
}

export interface OperatorOverride {
  originalStatus: ReceivingStatus;
  newStatus: ReceivingStatus;
  reason: string;
  operatorId: string;
  timestamp: string;
}

export interface IndividualCheck {
  id: string;
  name: string;
  verdict: CheckVerdict;
  expected: string;
  actual: string;
  details?: string;
}

export interface ComparisonResult {
  status: ReceivingStatus;
  discrepancyType: string | null;
  expectedQty: number;
  receivedQty: number;
  qtyDifference: number; // receivedQty - expectedQty
  isSkuMatched: boolean;
  cartonDamage: DamageGrade;
  unitDamage: DamageGrade;
  qualityFlags: QualityFlag[];
  disposition: DispositionAction;
  summaryExplanation: string;
  checks: IndividualCheck[];
}

export interface ReceivingRecord {
  recordId: string; // e.g. RCV-0001
  unitId: string;   // e.g. UNIT-0001 (Cross-pod join key)
  orgId: TenantId;
  poNumber: string;
  poLine: number;
  supplier: string;
  sku: string;
  asin: string;
  productTitle: string;
  specColour: string;
  specVariant: string;
  specComponents: string;
  
  // Ordered expectations
  cartonsOrdered: number;
  unitsPerCartonOrdered: number;
  qtyOrdered: number;
  
  // Actual received
  cartonsReceived: number;
  unitsPerCartonCounted: number;
  qtyReceived: number;
  receivedSku: string;
  
  // Inspection findings
  identityMatch: 'yes' | 'no' | 'uncertain';
  cartonDamage: DamageGrade;
  unitDamage: DamageGrade;
  qualityFlags: QualityFlag[];
  photoRefs: string[];
  
  // Metadata & Audit
  operatorId: string;
  capturedAt: string;
  status: ReceivingStatus;
  qtyDifference: number;
  disposition: DispositionAction;
  notes?: string;
  operatorOverride?: OperatorOverride;
  contentHash: string; // SHA-256 evidence anchor
}

export interface CrossPodEvidenceContract {
  stage: '01_RECEIVING';
  version: '2.0.0';
  recordId: string;
  unitId: string;
  orgId: TenantId;
  poRef: {
    poNumber: string;
    poLine: number;
    supplier: string;
  };
  product: {
    skuExpected: string;
    skuReceived: string;
    asin: string;
    title: string;
    identityMatch: 'yes' | 'no' | 'uncertain';
  };
  quantity: {
    cartonsOrdered: number;
    cartonsReceived: number;
    unitsPerCartonOrdered: number;
    unitsPerCartonCounted: number;
    qtyOrdered: number;
    qtyReceived: number;
    qtyDifference: number;
  };
  condition: {
    cartonDamage: DamageGrade;
    unitDamage: DamageGrade;
    qualityFlags: QualityFlag[];
  };
  verdict: {
    finalStatus: ReceivingStatus;
    disposition: DispositionAction;
    isOverridden: boolean;
    overrideDetails?: OperatorOverride;
  };
  evidence: {
    photoRefs: string[];
    operatorId: string;
    capturedAt: string;
    contentHash: string;
  };
}
