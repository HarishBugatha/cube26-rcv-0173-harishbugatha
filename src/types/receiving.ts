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
    cropHashes?: string[];
    debateVerdict?: PRDVerdict;
  };
}

// -------------------------------------------------------------
// PRD-3 DEBATE ARCHITECTURE TYPES
// -------------------------------------------------------------

export type ClaimStatus = 'VERIFIED' | 'CHALLENGED' | 'REJECTED';
export type PRDVerdict = 'ACCEPT' | 'EXCEPTION' | 'UNCERTAIN';

export interface ProsecutorRole {
  role: 'PROSECUTOR';
  thesis: string;
  defectType: string;
  severity: string;
  evidenceFocus: string;
  confidence: number;
  arguments: string[];
}

export interface DefenderRole {
  role: 'DEFENDER';
  stance: string;
  arguments: string[];
  defensePlausibility: number;
  concession?: string | null;
}

export interface BlindVerifierRole {
  role: 'BLIND_VERIFIER';
  protocol: 'STRICT_ISOLATION';
  promptDelivered: string;
  inputCropHash: string;
  inputCropDimensions: string;
  cropDataUrl?: string;
  observations: string[];
  detectedPhysicalFeatures: string[];
  observationalConfidence: number;
  independentVerdict?: string | null;
}

export interface CropPixelCoords {
  left: number;
  top: number;
  width: number;
  height: number;
  imageWidth?: number;
  imageHeight?: number;
}

export interface ClaimEvidence {
  cropBase64?: string;
  cropHash: string;
  pixelCoords: CropPixelCoords;
  masterImageHash: string;
}

export interface DebatedClaim {
  claimId: string;
  claimTitle: string;
  claimType: string;
  severity: string;
  poExpected: string;
  physicalObserved: string;
  bbox: [number, number, number, number];
  status: ClaimStatus;
  classificationRationale: string;
  prosecutor: ProsecutorRole;
  defender: DefenderRole;
  blindVerifier: BlindVerifierRole;
  evidence: ClaimEvidence;
  metrics: {
    durationMs: number;
    prosecutorConfidence: number;
    defenderPlausibility: number;
    blindConfidence: number;
  };
}

export interface EvidenceGraphNode {
  id: string;
  type: 'VERDICT' | 'CLAIM' | 'PROSECUTOR' | 'DEFENDER' | 'BLIND_VERIFIER' | 'IMAGE_CROP' | 'IMAGE_HASH';
  label: string;
  status?: string;
  severity?: string;
  confidence?: number;
  plausibility?: number;
  sha256?: string;
  description?: string;
  data?: any;
}

export interface EvidenceGraphEdge {
  from: string;
  to: string;
  label?: string;
  status?: string;
}

export interface EvidenceGraph {
  nodes: EvidenceGraphNode[];
  edges: EvidenceGraphEdge[];
  masterImageHash: string;
  rawImageHash?: string;
}

export interface SecurityAuditSummary {
  rawImageSha256: string;
  cleanImageSha256: string;
  metadataStripped: boolean;
  isolationProtocolEnforced: boolean;
  textSanitizationApplied: boolean;
}

export interface DebateInspectionReport {
  inspectionId: string;
  timestamp: string;
  scenarioId?: string;
  isCustomUpload?: boolean;
  poNumber: string;
  vendor: string;
  expectedSku: string;
  expectedQuantity: number;
  finalVerdict: PRDVerdict;
  recommendedAction: string;
  decisionRationale: string;
  claimsSummary: {
    total: number;
    verified: number;
    challenged: number;
    rejected: number;
  };
  debatedClaims: DebatedClaim[];
  evidenceGraph: EvidenceGraph;
  securityAudit: SecurityAuditSummary;
  annotatedImageBase64: string;
  metrics: {
    totalDurationMs: number;
    claimCount: number;
  };
}

export interface PRDScenarioPo {
  poNumber: string;
  vendor: string;
  expectedSku: string;
  productName: string;
  expectedQuantity: number;
  expectedVariant: string;
  expectedComponents: string[];
  carrierTracking: string;
  notes: string;
}

export interface PRDScenario {
  id: string;
  name: string;
  category: string;
  description: string;
  expectedVerdict: PRDVerdict;
  po: PRDScenarioPo;
  imageDataUrl?: string;
  sha256?: string;
  visualMetadata?: {
    itemsDetected: number;
    detectedSku: string;
    detectedVariant: string;
    packagingStatus: string;
    missingComponents: string[];
  };
}
