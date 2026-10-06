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
  /** Every discrepancy the record had before the override (set by dataService). */
  originalDiscrepancies?: ReceivingStatus[];
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
  /** Every discrepancy present, in priority order; status is the first (or MATCHED when empty). */
  discrepancies: ReceivingStatus[];
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
  
  // Actual received (null on a PENDING_REVIEW record whose verification did not complete:
  // the count is unknown and is not invented)
  cartonsReceived: number | null;
  unitsPerCartonCounted: number | null;
  qtyReceived: number | null;
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
  /** All discrepancies found (e.g. SHORT_RECEIVED + QUALITY_DISCREPANCY); status is the primary one. */
  discrepancies?: ReceivingStatus[];
  qtyDifference: number | null;
  disposition: DispositionAction;
  notes?: string;
  /** Why the record is PENDING_REVIEW (verification not completed), shown to the operator. */
  pendingReason?: string;
  operatorOverride?: OperatorOverride;
  contentHash: string; // SHA-256 evidence anchor
}

/**
 * One entry in a tenant's append-only audit hash chain.
 * entryHash = SHA-256(canonical JSON of every other field), and prevHash is the
 * previous entry's entryHash, so altering any earlier entry breaks every later link.
 */
export interface AuditChainEntry {
  index: number;
  orgId: TenantId;
  eventType: 'RECORD_CREATED' | 'OPERATOR_OVERRIDE';
  recordId: string;
  contentHash: string;
  prevHash: string;
  entryHash: string;
  override?: OperatorOverride;
}

export interface IntegrityFailure {
  kind:
    | 'ENTRY_HASH_MISMATCH'
    | 'BROKEN_LINK'
    | 'RECORD_CONTENT_MISMATCH'
    | 'RECORD_NOT_IN_CHAIN'
    | 'RECORD_MISSING'
    | 'STORAGE_UNREADABLE';
  index?: number;
  recordId?: string;
  detail: string;
}

export interface IntegrityReport {
  ok: boolean;
  orgId: TenantId;
  entriesChecked: number;
  recordsChecked: number;
  headHash: string;
  failures: IntegrityFailure[];
  checkedAt: string;
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
    /** null = not counted (pending record; verification did not complete) */
    cartonsReceived: number | null;
    unitsPerCartonOrdered: number;
    unitsPerCartonCounted: number | null;
    qtyOrdered: number;
    qtyReceived: number | null;
    qtyDifference: number | null;
  };
  condition: {
    cartonDamage: DamageGrade;
    unitDamage: DamageGrade;
    qualityFlags: QualityFlag[];
  };
  verdict: {
    finalStatus: ReceivingStatus;
    discrepancies: ReceivingStatus[];
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

export interface VerificationIssue {
  stage: string; // PROSECUTOR | DEFENDER | BLIND_VERIFIER | CONFIGURATION | PIPELINE
  kind: string; // TIMEOUT | API_ERROR | INCOMPLETE_RESPONSE | REFUSED | NOT_CONFIGURED | INSUFFICIENT_EVIDENCE | PIPELINE_ERROR
  reason: string;
}

export interface VerificationStatus {
  status: 'COMPLETE' | 'INCOMPLETE';
  mode: 'SCENARIO_FIXTURE' | 'VISION_MODEL' | 'NONE';
  model?: string;
  reasons: VerificationIssue[];
}

/** Physical features the DEBATE engine generated its claims from (server/debateEngine.js resolveObservedFeatures). */
export interface ObservedFeatures {
  /**
   * SCENARIO_METADATA = scripted test fixture; VISION_MODEL = reported by the vision model
   * (null values = not determinable from the photo); NONE = nothing observed.
   */
  source: 'SCENARIO_METADATA' | 'VISION_MODEL' | 'NONE';
  expectedQuantity: number;
  itemsDetected: number | null;
  detectedSku: string | null;
  detectedVariant: string | null;
  packagingStatus: string | null;
  missingComponents: string[];
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
  observedFeatures?: ObservedFeatures;
  /** Whether visual verification completed; INCOMPLETE results are UNCERTAIN and recorded as pending. */
  verification?: VerificationStatus;
  /** Organisation that owns this report on the server (report cache tenant check). */
  orgId?: TenantId;
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
