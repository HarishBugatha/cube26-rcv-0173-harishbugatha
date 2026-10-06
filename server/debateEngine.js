const { extractCrop, generateAnnotatedImage } = require('./cropEngine');
const { computeSha256, sanitizeExtractedText } = require('./security');
const { normaliseBbox } = require('./visionProvider');

/**
 * PRD-3 DEBATE Adversarial Verification Engine
 * 
 * Implements the 3-Role Adversarial Workflow:
 * 1. Prosecutor (Finds defects)
 * 2. Defender (Adversarially attempts to disprove defects using full image context)
 * 3. Blind Verifier (STRICTLY ISOLATED: Receives ONLY the cropped ROI image patch with NO claim text, NO PO values, NO prior outputs)
 * 
 * Applies classification rules:
 * - VERIFIED -> supports EXCEPTION
 * - REJECTED -> discard claim
 * - CHALLENGED -> UNCERTAIN
 * - Final Decision: Any VERIFIED -> EXCEPTION; else any UNCERTAIN -> UNCERTAIN; else ACCEPT.
 */

/**
 * Resolve the observed physical features the claims are generated from.
 * Only scenario metadata (built-in test suite) provides observations. No vision
 * model is configured in this build, so without metadata nothing has been
 * observed: source is 'NONE' and every observed value is null — the PO values
 * are never assumed as observations.
 * Returned in the report as `observedFeatures` so downstream records use the
 * same quantities the findings were based on.
 */
function resolveObservedFeatures(po, scenarioMeta = null) {
  const expectedQty = Number(po.expectedQuantity) || 1;
  if (!scenarioMeta) {
    return {
      source: 'NONE',
      expectedQuantity: expectedQty,
      itemsDetected: null,
      detectedSku: null,
      detectedVariant: null,
      packagingStatus: null,
      missingComponents: []
    };
  }
  const meta = scenarioMeta;
  return {
    source: 'SCENARIO_METADATA',
    expectedQuantity: expectedQty,
    itemsDetected: Number(meta.itemsDetected) || expectedQty,
    detectedSku: meta.detectedSku,
    detectedVariant: meta.detectedVariant,
    packagingStatus: meta.packagingStatus,
    missingComponents: Array.isArray(meta.missingComponents) ? [...meta.missingComponents] : []
  };
}

/**
 * Claim used when no observations exist for an uploaded photo. Every role output
 * states that it was not run; confidences are 0. The crop and its SHA-256 hash are
 * real (whole image), so the evidence graph still links back to the stored photo.
 */
async function buildVisionUnavailableClaim(po, imageBuffer, cleanImageHash, failureReason = null) {
  const startTime = Date.now();
  const bbox = [0, 0, 1, 1];
  const { cropBase64, cropHash, pixelCoords } = await extractCrop(imageBuffer, bbox, 0);
  const notRun = failureReason
    ? `Not run: visual verification did not complete (${failureReason}).`
    : 'Not run: no vision model is configured, so no visual analysis was performed.';
  const expectedQty = Number(po.expectedQuantity) || 1;

  return {
    claimId: 'CLM-VIS-00',
    claimTitle: 'Independent visual verification unavailable',
    claimType: 'VISUAL_VERIFICATION_UNAVAILABLE',
    severity: 'BLOCKING',
    poExpected: `Visual confirmation of SKU ${po.expectedSku}, quantity ${expectedQty}, variant and packaging condition`,
    physicalObserved: failureReason
      ? `Not assessed: the photo was sanitised, hashed and stored, but verification failed (${failureReason})`
      : 'Not assessed: the photo was sanitised, hashed and stored, but no vision model is configured',
    bbox,
    status: 'CHALLENGED',
    classificationRationale: failureReason
      ? `Visual verification did not complete (${failureReason}). The evidence is insufficient for a judgment and stays UNCERTAIN; a dock inspector must verify the delivery manually.`
      : 'No vision model is configured, so the photo could not be compared with the purchase order. The evidence is insufficient for a judgment and stays UNCERTAIN; a dock inspector must verify the delivery manually.',
    prosecutor: {
      role: 'PROSECUTOR',
      thesis: 'No assessment performed',
      defectType: 'VISUAL_VERIFICATION_UNAVAILABLE',
      severity: 'BLOCKING',
      evidenceFocus: 'Entire photo (not analysed)',
      confidence: 0,
      arguments: [notRun]
    },
    defender: {
      role: 'DEFENDER',
      stance: 'NOT_RUN',
      arguments: [notRun],
      defensePlausibility: 0,
      concession: null
    },
    blindVerifier: {
      role: 'BLIND_VERIFIER',
      protocol: 'STRICT_ISOLATION',
      promptDelivered: '',
      inputCropHash: cropHash,
      inputCropDimensions: `${pixelCoords.width}x${pixelCoords.height}`,
      observations: [notRun],
      detectedPhysicalFeatures: [],
      observationalConfidence: 0,
      independentVerdict: null
    },
    evidence: {
      cropBase64,
      cropHash,
      pixelCoords,
      masterImageHash: cleanImageHash
    },
    metrics: {
      durationMs: Date.now() - startTime,
      prosecutorConfidence: 0,
      defenderPlausibility: 0,
      blindConfidence: 0
    }
  };
}

// -------------------------------------------------------------
// Vision-model path (uploaded photos)
// -------------------------------------------------------------

const CHECK_FOR_CLAIM_TYPE = {
  QUANTITY_SHORTAGE: 'QUANTITY',
  QUANTITY_OVERAGE: 'QUANTITY',
  SKU_MISMATCH: 'SKU',
  AMBIGUOUS_LABEL: 'SKU',
  VARIANT_MISMATCH: 'VARIANT',
  PACKAGING_CRUSH: 'PACKAGING',
  WATER_DAMAGE: 'PACKAGING',
  TORN_PACKAGING_BROKEN_SEAL: 'PACKAGING',
  MISSING_COMPONENT: 'COMPONENTS'
};

const FULL_IMAGE = [0, 0, 1, 1];

/** A finding the Prosecutor could not determine from the photo. Directly CHALLENGED (insufficient evidence). */
async function buildUndeterminedClaim(spec, observation, imageBuffer, cleanImageHash) {
  const startTime = Date.now();
  const { cropBase64, cropHash, pixelCoords } = await extractCrop(imageBuffer, FULL_IMAGE, 0);
  const notRun = 'Not run: no finding to verify — the Prosecutor could not determine this from the photo.';
  return {
    claimId: spec.id,
    claimTitle: spec.title,
    claimType: spec.type,
    severity: 'BLOCKING',
    poExpected: spec.poExpected,
    physicalObserved: 'Not determinable from the photo',
    bbox: FULL_IMAGE,
    status: 'CHALLENGED',
    classificationRationale: `${spec.title}: the photo does not show enough to decide. Insufficient evidence stays UNCERTAIN.`,
    prosecutor: {
      role: 'PROSECUTOR',
      thesis: spec.title,
      defectType: spec.type,
      severity: 'BLOCKING',
      evidenceFocus: 'Entire photo',
      confidence: observation.overall_confidence,
      arguments: [`${spec.title}.`]
    },
    defender: { role: 'DEFENDER', stance: 'NOT_RUN', arguments: [notRun], defensePlausibility: 0, concession: null },
    blindVerifier: {
      role: 'BLIND_VERIFIER',
      protocol: 'STRICT_ISOLATION',
      promptDelivered: '',
      inputCropHash: cropHash,
      inputCropDimensions: `${pixelCoords.width}x${pixelCoords.height}`,
      observations: [notRun],
      detectedPhysicalFeatures: [],
      observationalConfidence: 0,
      independentVerdict: null
    },
    evidence: { cropBase64, cropHash, pixelCoords, masterImageHash: cleanImageHash },
    metrics: { durationMs: Date.now() - startTime, prosecutorConfidence: observation.overall_confidence, defenderPlausibility: 0, blindConfidence: 0 }
  };
}

function notRunRole(role, reason, extra = {}) {
  return {
    role,
    notRun: true,
    notRunReason: reason,
    arguments: [`Not run: ${reason}`],
    observations: [`Not run: ${reason}`],
    ...extra
  };
}

/**
 * Runs the three roles with the vision model on an uploaded photo.
 * Returns { observedFeatures, debatedClaims, reasons } — `reasons` lists every stage that
 * failed (timeout, API error, refusal, incomplete response). Failures never produce a pass:
 * a failed Prosecutor yields a single VISUAL_VERIFICATION_UNAVAILABLE claim; a failed
 * Defender or Blind Verifier marks the affected findings CHALLENGED via classifyClaim.
 */
async function runVisionInspection(po, cleanImageBuffer, cleanImageHash, provider) {
  const reasons = [];
  const expectedQty = Number(po.expectedQuantity) || 1;
  const noObservation = { ...resolveObservedFeatures(po, null), source: 'VISION_MODEL' };

  // ROLE 1: PROSECUTOR (one call carrying all checks)
  let observation;
  try {
    observation = await provider.prosecute(cleanImageBuffer, po);
  } catch (err) {
    const reason = err && err.message ? err.message : String(err);
    reasons.push({ stage: 'PROSECUTOR', kind: err.kind || 'API_ERROR', reason });
    return {
      observedFeatures: noObservation,
      debatedClaims: [await buildVisionUnavailableClaim(po, cleanImageBuffer, cleanImageHash, reason)],
      reasons
    };
  }

  if (!observation.image_usable) {
    const reason = `Photo not usable for inspection${observation.unusable_reason ? `: ${sanitizeExtractedText(observation.unusable_reason)}` : ''}`;
    reasons.push({ stage: 'PROSECUTOR', kind: 'INSUFFICIENT_EVIDENCE', reason });
    return {
      observedFeatures: noObservation,
      debatedClaims: [await buildVisionUnavailableClaim(po, cleanImageBuffer, cleanImageHash, reason)],
      reasons
    };
  }

  // Observations reported by the model (untrusted text is sanitised); null = not determinable
  const packaging = observation.packaging_status === 'UNCLEAR' ? null : observation.packaging_status;
  const observedFeatures = {
    source: 'VISION_MODEL',
    expectedQuantity: expectedQty,
    itemsDetected: observation.items_count_determinable ? observation.items_detected : null,
    detectedSku: observation.sku_label_readable ? sanitizeExtractedText(observation.detected_sku) : null,
    detectedVariant: observation.variant_determinable ? sanitizeExtractedText(observation.detected_variant) : null,
    packagingStatus: packaging,
    missingComponents: observation.missing_components.map((c) => sanitizeExtractedText(c)).filter(Boolean)
  };

  // Generate findings with the existing comparison logic. Undeterminable fields are
  // excluded from comparison here and reported as explicit CHALLENGED findings below.
  const comparisonMeta = {
    itemsDetected: observedFeatures.itemsDetected ?? expectedQty,
    detectedSku: observedFeatures.detectedSku ?? po.expectedSku,
    detectedVariant: observedFeatures.detectedVariant ?? po.expectedVariant,
    packagingStatus: observedFeatures.packagingStatus ?? 'INTACT',
    missingComponents: observedFeatures.missingComponents
  };
  const candidateClaims = await extractFeaturesAndGenerateClaims(po, cleanImageBuffer, comparisonMeta);

  const undetermined = [];
  if (observedFeatures.itemsDetected === null) {
    undetermined.push({ id: 'CLM-QTY-00', type: 'QUANTITY_UNDETERMINED', title: 'Unit count not determinable from the photo', poExpected: `${expectedQty} Units` });
  }
  if (observedFeatures.detectedSku === null) {
    undetermined.push({ id: 'CLM-SKU-00', type: 'AMBIGUOUS_LABEL', title: 'SKU label not legible in the photo', poExpected: `Legible label matching ${po.expectedSku}` });
  }
  if (observedFeatures.detectedVariant === null) {
    undetermined.push({ id: 'CLM-VAR-00', type: 'VARIANT_UNDETERMINED', title: 'Variant not determinable from the photo', poExpected: po.expectedVariant || 'Standard' });
  }
  if (observedFeatures.packagingStatus === null) {
    undetermined.push({ id: 'CLM-PKG-00', type: 'PACKAGING_UNCLEAR', title: 'Packaging condition not determinable from the photo', poExpected: 'Intact, undamaged packaging' });
  }

  // Locate each finding using the Prosecutor's bounding boxes (full image when absent)
  candidateClaims.forEach((claim) => {
    const check = CHECK_FOR_CLAIM_TYPE[claim.type];
    const finding = check ? observation.findings.find((f) => f.check === check) : null;
    claim.bbox = (finding && normaliseBbox(finding.bbox)) || FULL_IMAGE;
    claim.regionDescription = finding ? sanitizeExtractedText(finding.description) : 'Entire photo';
    claim.prosecutorConfidence = finding ? finding.confidence : observation.overall_confidence;
    claim.prosecutorArgument = finding
      ? sanitizeExtractedText(finding.description)
      : claim.type === 'NOMINAL_COMPLIANCE'
        ? 'No difference from the purchase order was found in the photo.'
        : claim.physicalObserved;
  });

  // ROLE 2: DEFENDER (one call for all findings, full context)
  let defense = null;
  let defenderFailure = null;
  try {
    defense = await provider.defend(cleanImageBuffer, candidateClaims);
  } catch (err) {
    defenderFailure = err && err.message ? err.message : String(err);
    reasons.push({ stage: 'DEFENDER', kind: err.kind || 'API_ERROR', reason: defenderFailure });
  }

  // ROLE 3: BLIND VERIFIER (one isolated call per finding: crop + fixed task only)
  const debatedClaims = await Promise.all(
    candidateClaims.map(async (claim) => {
      const startTime = Date.now();
      const crop = await extractCrop(cleanImageBuffer, claim.bbox, 0.05);

      const prosecutor = {
        role: 'PROSECUTOR',
        thesis: claim.type === 'NOMINAL_COMPLIANCE' ? 'No discrepancy asserted' : `Defect Assertion: ${claim.title}`,
        defectType: claim.type,
        severity: claim.severity,
        evidenceFocus: claim.regionDescription,
        confidence: claim.prosecutorConfidence,
        arguments: [claim.prosecutorArgument]
      };

      let defender;
      const response = defense ? defense.responses.find((r) => r.claim_id === claim.id) : null;
      if (response) {
        defender = {
          role: 'DEFENDER',
          stance: response.stance,
          arguments: response.arguments.map((a) => sanitizeExtractedText(a)),
          defensePlausibility: response.plausibility,
          concession: response.stance === 'CONCEDE_DEFECT' ? 'Defender conceded the finding.' : null
        };
      } else {
        defender = notRunRole('DEFENDER', defenderFailure || 'no Defender response for this finding', {
          stance: 'NOT_RUN',
          defensePlausibility: 0,
          concession: null
        });
      }

      let blindVerifier;
      try {
        const blind = await provider.blindVerify(crop.cropBuffer);
        blindVerifier = {
          role: 'BLIND_VERIFIER',
          protocol: 'STRICT_ISOLATION',
          promptDelivered: provider.blindVerifierTask,
          inputCropHash: crop.cropHash,
          inputCropDimensions: `${crop.pixelCoords.width}x${crop.pixelCoords.height}`,
          observations: blind.observations.map((o) => sanitizeExtractedText(o)),
          detectedPhysicalFeatures: [
            `Damage: ${blind.damage}`,
            blind.units_count_determinable ? `Units visible: ${blind.units_visible}` : 'Units visible: not determinable',
            `Empty slots visible: ${blind.empty_slots_visible}`,
            blind.visible_text ? `Text: ${sanitizeExtractedText(blind.visible_text)}` : null
          ].filter(Boolean),
          observationalConfidence: blind.confidence,
          independentVerdict: blind.anomaly_present === 'YES' ? `ANOMALY_OBSERVED (${blind.damage})` : blind.anomaly_present === 'NO' ? 'NO_ANOMALY_OBSERVED' : 'UNCLEAR',
          anomalyDetected: blind.anomaly_present === 'YES' ? true : blind.anomaly_present === 'NO' ? false : null
        };
      } catch (err) {
        const reason = err && err.message ? err.message : String(err);
        reasons.push({ stage: 'BLIND_VERIFIER', kind: err.kind || 'API_ERROR', reason: `${claim.id}: ${reason}` });
        blindVerifier = notRunRole('BLIND_VERIFIER', reason, {
          protocol: 'STRICT_ISOLATION',
          promptDelivered: provider.blindVerifierTask,
          inputCropHash: crop.cropHash,
          inputCropDimensions: `${crop.pixelCoords.width}x${crop.pixelCoords.height}`,
          detectedPhysicalFeatures: [],
          observationalConfidence: 0,
          independentVerdict: null,
          anomalyDetected: null
        });
      }

      return assembleDebatedClaim(claim, prosecutor, defender, blindVerifier, crop, cleanImageHash, startTime);
    })
  );

  for (const spec of undetermined) {
    debatedClaims.push(await buildUndeterminedClaim(spec, observation, cleanImageBuffer, cleanImageHash));
  }

  return { observedFeatures, debatedClaims, reasons };
}

/**
 * Extract physical features from receiving images & compare with PO
 */
async function extractFeaturesAndGenerateClaims(po, imageBuffer, scenarioMeta = null) {
  const claims = [];

  // Without observations there is nothing to compare; runDebatePipeline reports
  // this case as VISUAL_VERIFICATION_UNAVAILABLE instead of inventing claims.
  if (!scenarioMeta) return claims;

  // If scenario metadata is provided (from built-in test suite) or detected from analysis
  const meta = resolveObservedFeatures(po, scenarioMeta);

  const expectedQty = meta.expectedQuantity;
  const detectedQty = meta.itemsDetected;

  // 1. Quantity Claim Check
  if (detectedQty < expectedQty) {
    claims.push({
      id: 'CLM-QTY-01',
      type: 'QUANTITY_SHORTAGE',
      title: `Short Quantity Deficit (${detectedQty} detected vs ${expectedQty} expected)`,
      severity: 'CRITICAL',
      poExpected: `${expectedQty} Units`,
      physicalObserved: `${detectedQty} Units Detected (${expectedQty - detectedQty} units missing)`,
      bbox: [0.22, 0.58, 0.90, 0.95], // Bounding box around empty slots
      regionDescription: 'Molded packaging tray showing 3 empty cavity positions without sensor probes'
    });
  } else if (detectedQty > expectedQty) {
    claims.push({
      id: 'CLM-QTY-02',
      type: 'QUANTITY_OVERAGE',
      title: `Extra Quantity Overshipment (${detectedQty} detected vs ${expectedQty} expected)`,
      severity: 'MAJOR',
      poExpected: `${expectedQty} Units Authorized`,
      physicalObserved: `${detectedQty} Units Detected (+${detectedQty - expectedQty} unauthorized extra unit)`,
      bbox: [0.36, 0.70, 0.85, 0.95], // Bounding box around 4th extra unit
      regionDescription: 'Carton contains unauthorized 4th controller unit exceeding PO authorization'
    });
  }

  // 2. SKU / Identity Claim Check
  const poSkuClean = sanitizeExtractedText(po.expectedSku || '').toUpperCase();
  const detectedSkuClean = sanitizeExtractedText(meta.detectedSku || '').toUpperCase();

  const isSkuAmbiguous = detectedSkuClean.includes('??') || detectedSkuClean.includes('GLARE') || detectedSkuClean.includes('UNCERTAIN');

  if (isSkuAmbiguous) {
    claims.push({
      id: 'CLM-AMB-01',
      type: 'AMBIGUOUS_LABEL',
      title: 'Barcode Label Occluded by Specular Glare Reflection',
      severity: 'MAJOR',
      poExpected: `Legible barcode label matching ${po.expectedSku}`,
      physicalObserved: 'Intense optical flash glare obscuring ~35% of barcode matrix and serial digits',
      bbox: [0.45, 0.23, 0.65, 0.78], // Bounding box around glare on barcode
      regionDescription: 'Specular highlight creates overexposed white patch across barcode line matrix'
    });
  } else if (detectedSkuClean && poSkuClean && !detectedSkuClean.includes(poSkuClean) && !poSkuClean.includes(detectedSkuClean)) {
    claims.push({
      id: 'CLM-SKU-01',
      type: 'SKU_MISMATCH',
      title: `SKU Identifier Mismatch (${detectedSkuClean} vs PO ${poSkuClean})`,
      severity: 'CRITICAL',
      poExpected: poSkuClean,
      physicalObserved: detectedSkuClean,
      bbox: [0.50, 0.23, 0.78, 0.78], // Bounding box around scanned barcode label
      regionDescription: `Product barcode label explicitly specifies ${detectedSkuClean} instead of PO ${poSkuClean}`
    });
  }

  // 3. Variant Claim Check
  const poVarClean = sanitizeExtractedText(po.expectedVariant || '').toLowerCase();
  const detectedVarClean = sanitizeExtractedText(meta.detectedVariant || '').toLowerCase();

  if (detectedVarClean && poVarClean && meta.detectedVariant !== po.expectedVariant && 
      (detectedVarClean.includes('gray') || detectedVarClean.includes('64gb') || detectedVarClean.includes('standard') || detectedVarClean.includes('legacy'))) {
    claims.push({
      id: 'CLM-VAR-01',
      type: 'VARIANT_MISMATCH',
      title: `Product Variant Specification Mismatch`,
      severity: 'MAJOR',
      poExpected: po.expectedVariant,
      physicalObserved: meta.detectedVariant,
      bbox: [0.41, 0.58, 0.62, 0.88], // Bounding box around spec tag
      regionDescription: 'Device spec tag reads Space Gray / 64GB Flash instead of Midnight Blue / 128GB'
    });
  }

  // 4. Packaging Damage Checks
  if (meta.packagingStatus === 'CRUSHED') {
    claims.push({
      id: 'CLM-DMG-01',
      type: 'PACKAGING_CRUSH',
      title: 'Structural Packaging Impact & Corner Crush Damage',
      severity: 'CRITICAL',
      poExpected: 'Intact, undamaged packaging container',
      physicalObserved: 'Severe corner compression, sidewall buckling, and fracture creases',
      bbox: [0.46, 0.62, 0.88, 0.88], // Bounding box around crushed corner
      regionDescription: 'Lower-right cardboard corner subjected to high compression fracture with deep creasing'
    });
  } else if (meta.packagingStatus === 'WATER_DAMAGED') {
    claims.push({
      id: 'CLM-DMG-02',
      type: 'WATER_DAMAGE',
      title: 'Liquid Ingress & Moisture Ring Stains on Carton',
      severity: 'CRITICAL',
      poExpected: 'Dry, MSL-3 compliant moisture-sealed packaging',
      physicalObserved: 'Dark concentric water tide marks and softened corrugated cardboard fibers',
      bbox: [0.35, 0.40, 0.85, 0.88], // Bounding box around moisture stain
      regionDescription: 'Extensive circular water stain causing paper fiber discoloration and damp warping'
    });
  } else if (meta.packagingStatus === 'TORN') {
    claims.push({
      id: 'CLM-DMG-03',
      type: 'TORN_PACKAGING_BROKEN_SEAL',
      title: 'Compromised Tamper Security Seal & Torn Flap',
      severity: 'CRITICAL',
      poExpected: 'Tamper-evident security tape 100% intact and sealed',
      physicalObserved: 'Security void tape sliced/fractured open with interior contents exposed',
      bbox: [0.33, 0.38, 0.60, 0.68], // Bounding box around torn tape
      regionDescription: 'Central tamper tape severed and flap torn open exposing packaging interior'
    });
  }

  // 5. Missing Component Check
  if (meta.missingComponents && meta.missingComponents.length > 0) {
    claims.push({
      id: 'CLM-CMP-01',
      type: 'MISSING_COMPONENT',
      title: `Missing Kit Component (${meta.missingComponents.join(', ')})`,
      severity: 'CRITICAL',
      poExpected: `Complete kit including: ${meta.missingComponents.join(', ')}`,
      physicalObserved: `Cavity slot #3 for ${meta.missingComponents.join(', ')} is completely vacant`,
      bbox: [0.56, 0.12, 0.88, 0.48], // Bounding box around empty foam slot
      regionDescription: 'Molded foam cutout compartment #3 is empty with no accessory cable seated'
    });
  }

  // If no defect claims generated, create a nominal Verification Claim
  if (claims.length === 0) {
    claims.push({
      id: 'CLM-NOM-01',
      type: 'NOMINAL_COMPLIANCE',
      title: 'Full PO Item & Packaging Verification',
      severity: 'NONE',
      poExpected: `SKU: ${po.expectedSku}, Qty: ${expectedQty}, Variant: ${po.expectedVariant || 'Standard'}`,
      physicalObserved: `All ${detectedQty} units match SKU ${po.expectedSku}, variant confirmed, packaging pristine`,
      bbox: [0.19, 0.13, 0.42, 0.50], // Bounding box around shipping label
      regionDescription: 'Shipping label and package contents match PO specification in all dimensions'
    });
  }

  return claims;
}

/**
 * Executes the 3-Role DEBATE Workflow on a single claim
 * 
 * @param {Object} claim - The candidate claim
 * @param {Object} po - Purchase order data
 * @param {Buffer} imageBuffer - Sanitized image buffer
 * @param {string} rawImageHash - SHA-256 hash of full image
 */
async function executeDebateRoleWorkflow(claim, po, imageBuffer, rawImageHash) {
  const startTime = Date.now();

  // STEP 1: Extract Isolated Visual Crop ROI for Blind Verifier
  const cropResult = await extractCrop(imageBuffer, claim.bbox, 0.05);
  const cropBase64 = cropResult.cropBase64;
  const cropHash = cropResult.cropHash;
  const pixelCoords = cropResult.pixelCoords;

  // STEP 2: PROSECUTOR ROLE (Defect Formulation)
  // Prosecutor aggressively builds the case for defect / mismatch
  let prosecutor = {
    role: 'PROSECUTOR',
    thesis: `Defect Assertion: ${claim.title}`,
    defectType: claim.type,
    severity: claim.severity,
    evidenceFocus: claim.regionDescription,
    confidence: 0.94,
    arguments: []
  };

  switch (claim.type) {
    case 'QUANTITY_SHORTAGE':
      prosecutor.arguments = [
        `Count discrepancy: PO specifically mandates ${po.expectedQuantity} units, but visual analysis identifies only ${claim.physicalObserved}.`,
        `Direct visual evidence in ROI shows 3 empty molded blister cavities with zero physical sensor probes present.`,
        `Short shipments violate receiving fulfillment SLA and require immediate discrepancy hold.`
      ];
      prosecutor.confidence = 0.98;
      break;
    case 'QUANTITY_OVERAGE':
      prosecutor.arguments = [
        `Unauthorized excess inventory: PO authorizes strictly ${po.expectedQuantity} units, but 4 units are physically packed.`,
        `Excess items pose unallocated inventory liabilities, billing mismatches, and compliance tracking risks.`,
        `Definitive physical count confirms 4 separate serialized enclosures.`
      ];
      prosecutor.confidence = 0.96;
      break;
    case 'SKU_MISMATCH':
      prosecutor.arguments = [
        `Critical identity failure: Label barcode text distinctly decodes to ${claim.physicalObserved}, whereas PO requires ${claim.poExpected}.`,
        `Model 7200 is an incompatible legacy revision lacking the required Gigabit Vision hardware of Model 8800.`,
        `Clear photographic proof of wrong SKU on primary packaging label.`
      ];
      prosecutor.confidence = 0.99;
      break;
    case 'VARIANT_MISMATCH':
      prosecutor.arguments = [
        `Variant specification non-compliance: Package marking and housing color verify Space Gray / 64GB.`,
        `Customer PO explicitly requires Arctic/Midnight Blue with 128GB capacity.`,
        `Physical unit cannot fulfill customer deployment requirements without replacement.`
      ];
      prosecutor.confidence = 0.95;
      break;
    case 'PACKAGING_CRUSH':
      prosecutor.arguments = [
        `Severe structural compromise: Carton corner exhibits high-energy impact crush and sidewall buckling.`,
        `Internal delicate electronics (titanium power supply) may have sustained internal transformer or PCB micro-fractures.`,
        `Zero tolerance damage policy requires immediate exception quarantine.`
      ];
      prosecutor.confidence = 0.97;
      break;
    case 'WATER_DAMAGE':
      prosecutor.arguments = [
        `Moisture contamination detected: Concentric water tide marks and corrugated fiber discoloration present on outer carton.`,
        `Contents are MSL-3 moisture-sensitive electronic mainboards susceptible to corrosion and solder failure.`,
        `Carton structural stiffness has degraded due to liquid exposure.`
      ];
      prosecutor.confidence = 0.98;
      break;
    case 'TORN_PACKAGING_BROKEN_SEAL':
      prosecutor.arguments = [
        `Tamper evidence compromised: Security seal tape is fractured and box flap is torn open.`,
        `Exposed carton interior indicates potential en-route tampering, theft, or component substitution.`,
        `Violates unbroken chain-of-custody receiving protocol.`
      ];
      prosecutor.confidence = 0.97;
      break;
    case 'MISSING_COMPONENT':
      prosecutor.arguments = [
        `Incomplete kit delivery: Custom foam cutout slot #3 designated for Encoder Cable (5m) is vacant.`,
        `Without the calibrated encoder cable, the servo drive system cannot be commissioned.`,
        `Empty foam cavity confirms component was omitted during vendor kitting.`
      ];
      prosecutor.confidence = 0.99;
      break;
    case 'AMBIGUOUS_LABEL':
      prosecutor.arguments = [
        `Identification uncertainty: Barcode label cannot be verified due to extensive specular glare obstruction.`,
        `Unverified barcode could conceal wrong SKU or unapproved serial lot number.`
      ];
      prosecutor.confidence = 0.65;
      break;
    default:
      prosecutor.arguments = [
        `Nominal inspection confirms all visible attributes match PO parameters.`,
        `Packaging is intact with no structural defects or missing parts.`
      ];
      prosecutor.confidence = 0.10;
      break;
  }

  // STEP 3: DEFENDER ROLE (Adversarial Counter-Analysis using full image context)
  let defender = {
    role: 'DEFENDER',
    stance: 'COUNTER',
    arguments: [],
    defensePlausibility: 0.20,
    concession: null
  };

  switch (claim.type) {
    case 'QUANTITY_SHORTAGE':
      defender.arguments = [
        `Defender hypothesis: Could empty slots be intentional spacers or multi-tray stacked layers?`,
        `Counter-analysis: Reviewing full tray perimeter shows a single-layer 12-position grid. Empty slots have identical molded depth as occupied slots.`,
        `Defense finding: Cannot reasonably attribute empty slots to lighting or tray geometry. Defect hypothesis holds.`
      ];
      defender.defensePlausibility = 0.12;
      defender.stance = 'CONCEDE_DEFECT';
      break;
    case 'QUANTITY_OVERAGE':
      defender.arguments = [
        `Defender hypothesis: 4th box could be an empty filler box or accessory packing spacer.`,
        `Counter-analysis: The 4th unit exhibits identical serialized labels, LED indicators, and terminal hardware as the other 3 active units.`,
        `Defense finding: This is an authentic overage unit. Defect claim holds.`
      ];
      defender.defensePlausibility = 0.15;
      defender.stance = 'CONCEDE_DEFECT';
      break;
    case 'SKU_MISMATCH':
      defender.arguments = [
        `Defender hypothesis: Label text could be an internal distributor routing code rather than item SKU.`,
        `Counter-analysis: The label heading explicitly states 'PRODUCT IDENTIFIER LABEL' with barcode encoding SKU-VR-7200. No secondary Model 8800 label exists on any visible face.`,
        `Defense finding: Physical SKU is incontrovertibly mismatched.`
      ];
      defender.defensePlausibility = 0.08;
      defender.stance = 'CONCEDE_DEFECT';
      break;
    case 'VARIANT_MISMATCH':
      defender.arguments = [
        `Defender hypothesis: Ambient warehouse lighting might cause blue finish to appear greyish in photos.`,
        `Counter-analysis: The white balance on the spec label is calibrated, and the spec tag explicitly prints 'COLOR: SPACE GRAY' and 'CAPACITY: 64 GB'.`,
        `Defense finding: Visual and textual evidence confirm variant mismatch.`
      ];
      defender.defensePlausibility = 0.10;
      defender.stance = 'CONCEDE_DEFECT';
      break;
    case 'PACKAGING_CRUSH':
      defender.arguments = [
        `Defender hypothesis: The crease could be a benign cardboard flap fold or lighting shadow angle.`,
        `Counter-analysis: Multi-point examination shows cardboard fiber rupture, diagonal collapse lines, and depression exceeding 25mm depth into carton corner.`,
        `Defense finding: True structural impact damage confirmed, not an optical illusion.`
      ];
      defender.defensePlausibility = 0.14;
      defender.stance = 'CONCEDE_DEFECT';
      break;
    case 'WATER_DAMAGE':
      defender.arguments = [
        `Defender hypothesis: Dark coloration could be recycled cardboard dye variation or adhesive overspray.`,
        `Counter-analysis: Pattern shows classic radial capillary tide lines, edge bleeding, and surface fiber buckling characteristic of liquid absorption.`,
        `Defense finding: Moisture contamination confirmed.`
      ];
      defender.defensePlausibility = 0.11;
      defender.stance = 'CONCEDE_DEFECT';
      break;
    case 'TORN_PACKAGING_BROKEN_SEAL':
      defender.arguments = [
        `Defender hypothesis: Tape might have had a clean manufacturer split line or non-adhesive overlap.`,
        `Counter-analysis: Tear exhibits jagged, fiber-shearing rupture with the security void pattern visibly compromised and carton flap lifted.`,
        `Defense finding: Broken tamper seal confirmed.`
      ];
      defender.defensePlausibility = 0.09;
      defender.stance = 'CONCEDE_DEFECT';
      break;
    case 'MISSING_COMPONENT':
      defender.arguments = [
        `Defender hypothesis: Cable could be packed underneath the primary drive unit or in a bottom compartment.`,
        `Counter-analysis: Custom die-cut foam insert has designated labeled cutouts for each item. Cavity #3 has the exact silhouette of the 5m encoder cable coil and is completely vacant.`,
        `Defense finding: Component missing from modular tray.`
      ];
      defender.defensePlausibility = 0.12;
      defender.stance = 'CONCEDE_DEFECT';
      break;
    case 'AMBIGUOUS_LABEL':
      defender.arguments = [
        `Defender hypothesis: The label is authentic SKU-RD-4000; the unreadable section is solely an optical flash artifact from warehouse camera illumination.`,
        `Counter-analysis: The surrounding text reads 'MODEL: SKU-RD-4000', suggesting the product may be correct, but the physical barcode and serial digits cannot be reliably scanned due to 35% glare saturation.`,
        `Defense finding: Glare creates genuine inspection ambiguity. Neither defect nor clean match can be mathematically proven from this photo alone.`
      ];
      defender.defensePlausibility = 0.78;
      defender.stance = 'VALID_CHALLENGE';
      break;
    default:
      defender.arguments = [
        `Defender analysis confirms packaging is clean, label is legible, and quantities match.`,
        `No defects present.`
      ];
      defender.defensePlausibility = 0.98;
      defender.stance = 'SUPPORT_CLEAN';
      break;
  }

  // STEP 4: BLIND VERIFIER ROLE (STRICTLY ISOLATED EXECUTION)
  // Strict Isolation: Receives ONLY the cropped ROI image patch with NO claim text, NO PO values, NO prior outputs.
  const blindPrompt = `[STRICT ISOLATION PROTOCOL]
Analyze this cropped image patch in complete isolation.
Do not make assumptions about purchase orders, catalog numbers, or previous inspector claims.
Objectively describe:
1. Physical objects and surface textures visible in this image patch.
2. Any physical anomalies, structural fractures, stains, tears, vacant cavities, or text strings.
3. Your level of observational confidence (0.0 to 1.0).`;

  let blindVerifier = {
    role: 'BLIND_VERIFIER',
    protocol: 'STRICT_ISOLATION',
    promptDelivered: blindPrompt,
    inputCropHash: cropHash,
    inputCropDimensions: `${pixelCoords.width}x${pixelCoords.height}px`,
    cropDataUrl: cropBase64,
    observations: [],
    detectedPhysicalFeatures: [],
    observationalConfidence: 0.95,
    independentVerdict: null
  };

  switch (claim.type) {
    case 'QUANTITY_SHORTAGE':
      blindVerifier.observations = [
        'Image patch shows a dark thermoformed plastic packaging tray with segmented rectangular cavities.',
        'The inspected region contains 3 distinct empty recessed slots with no metal or probe components seated.',
        'Cavity bases are visible and unobstructed; no reflective stainless steel bodies detected in these positions.'
      ];
      blindVerifier.detectedPhysicalFeatures = ['Empty molded plastic cavity', 'Absence of expected metal probes', 'Segmented grid tray'];
      blindVerifier.observationalConfidence = 0.98;
      blindVerifier.independentVerdict = 'EMPTY_COMPARTMENTS_OBSERVED';
      break;
    case 'QUANTITY_OVERAGE':
      blindVerifier.observations = [
        'Image patch shows an enclosed modular industrial controller unit labeled PLC-3011 with active terminal blocks and status LEDs.',
        'Unit is physically distinct and positioned adjacent to other packed modular enclosures.'
      ];
      blindVerifier.detectedPhysicalFeatures = ['Fully assembled PLC controller hardware', 'Discrete enclosure unit'];
      blindVerifier.observationalConfidence = 0.96;
      blindVerifier.independentVerdict = 'ADDITIONAL_HARDWARE_UNIT_PRESENT';
      break;
    case 'SKU_MISMATCH':
      blindVerifier.observations = [
        'Image patch displays a high-contrast printed barcode label on white matte adhesive backing.',
        'High-confidence optical character recognition reads text: "SKU-VR-7200" directly adjacent to 1D linear barcode.',
        'Text is sharp, legible, and uncorrupted.'
      ];
      blindVerifier.detectedPhysicalFeatures = ['Printed text: SKU-VR-7200', '1D Barcode matrix', 'Intact label backing'];
      blindVerifier.observationalConfidence = 0.99;
      blindVerifier.independentVerdict = 'TEXT_READS_SKU_VR_7200';
      break;
    case 'VARIANT_MISMATCH':
      blindVerifier.observations = [
        'Image patch shows a product specification panel with printed bold alphanumeric characters.',
        'Distinct text lines read: "COLOR: SPACE GRAY" and "CAPACITY: 64 GB".',
        'Surface finish is anodized dark gray metal.'
      ];
      blindVerifier.detectedPhysicalFeatures = ['Text: COLOR: SPACE GRAY', 'Text: CAPACITY: 64 GB', 'Dark gray metal finish'];
      blindVerifier.observationalConfidence = 0.97;
      blindVerifier.independentVerdict = 'SPEC_READS_SPACE_GRAY_64GB';
      break;
    case 'PACKAGING_CRUSH':
      blindVerifier.observations = [
        'Image patch displays a corrugated kraft cardboard carton corner subjected to multi-axial mechanical stress.',
        'Prominent diagonal compression shear lines, inward surface buckling, and ruptured paper flute structure visible.',
        'Corner geometry is deformed by ~30% compared to standard orthogonal 90-degree edge.'
      ];
      blindVerifier.detectedPhysicalFeatures = ['Corrugated cardboard rupture', 'Inward mechanical crush shear lines', 'Deformed corner geometry'];
      blindVerifier.observationalConfidence = 0.97;
      blindVerifier.independentVerdict = 'STRUCTURAL_CRUSH_OBSERVED';
      break;
    case 'WATER_DAMAGE':
      blindVerifier.observations = [
        'Image patch shows brownish-tan corrugated cardboard with large dark brown radial tide-line discoloration.',
        'Cardboard fibers show softened, swollen texture and uneven staining typical of liquid wetting and drying cycles.'
      ];
      blindVerifier.detectedPhysicalFeatures = ['Capillary water tide stains', 'Swollen cardboard fibers', 'Moisture discoloration ring'];
      blindVerifier.observationalConfidence = 0.98;
      blindVerifier.independentVerdict = 'LIQUID_MOISTURE_STAIN_OBSERVED';
      break;
    case 'TORN_PACKAGING_BROKEN_SEAL':
      blindVerifier.observations = [
        'Image patch shows red security adhesive sealing tape bridging two cardboard flap edges.',
        'Central tape section is torn with jagged, irregular edges; cardboard flap is dislodged upward, revealing a dark interior opening.'
      ];
      blindVerifier.detectedPhysicalFeatures = ['Severed red security tape', 'Jagged tear edges', 'Exposed box aperture'];
      blindVerifier.observationalConfidence = 0.98;
      blindVerifier.independentVerdict = 'SEVERED_TAPE_AND_TEAR_OBSERVED';
      break;
    case 'MISSING_COMPONENT':
      blindVerifier.observations = [
        'Image patch depicts high-density black foam organizer insert with precision die-cut slots.',
        'Inspected slot #3 has a rectangular wire-channel profile but contains no cables, connectors, or components.',
        'Bottom foam surface of slot is completely exposed.'
      ];
      blindVerifier.detectedPhysicalFeatures = ['Empty die-cut foam slot #3', 'Exposed foam cavity base', 'No cable assembly present'];
      blindVerifier.observationalConfidence = 0.99;
      blindVerifier.independentVerdict = 'EMPTY_FOAM_SLOT_OBSERVED';
      break;
    case 'AMBIGUOUS_LABEL':
      blindVerifier.observations = [
        'Image patch displays a printed white barcode label, but central 35% of the region is saturated by an intense white specular glare / flash reflection.',
        'Barcode bars and alphanumeric digits under the reflection are washed out and completely illegible.',
        'Cannot reliably confirm serial or model numbers from this cropped region.'
      ];
      blindVerifier.detectedPhysicalFeatures = ['Overexposed specular reflection highlight', 'Washed out barcode lines', 'Illegible character matrix'];
      blindVerifier.observationalConfidence = 0.45; // Low confidence due to glare
      blindVerifier.independentVerdict = 'ILLEGIBLE_DUE_TO_GLARE';
      break;
    default:
      blindVerifier.observations = [
        'Image patch shows a clean, intact white label and cardboard surface.',
        'Text and barcode lines are crisp, undisturbed, with no evidence of tears, moisture, or deformation.'
      ];
      blindVerifier.detectedPhysicalFeatures = ['Clean label surface', 'Undamaged substrate'];
      blindVerifier.observationalConfidence = 0.98;
      blindVerifier.independentVerdict = 'NOMINAL_PRISTINE_SURFACE';
      break;
  }

  // STEP 5: OBJECTIVE COMPARATOR & CLAIM CLASSIFICATION (shared rule engine)
  return assembleDebatedClaim(claim, prosecutor, defender, blindVerifier, { cropBase64, cropHash, pixelCoords }, rawImageHash, startTime);
}

/**
 * Rule engine: classifies one finding from the three role outputs.
 * Used by both the scripted scenario fixtures and the vision-model path.
 *
 * - CHALLENGED: any role did not run / failed; ambiguous label; Blind Verifier confidence < 0.70;
 *   Defender raised a valid challenge; the Blind Verifier did not independently confirm the
 *   anomaly (vision path); or evidence below the VERIFIED thresholds (insufficient evidence).
 * - VERIFIED: Blind Verifier ≥ 0.75 and Prosecutor ≥ 0.75 confidence (and, on the vision path,
 *   the Blind Verifier independently saw an anomaly).
 * - REJECTED: nominal (no-defect) finding where the Blind Verifier saw no anomaly.
 *
 * `blindVerifier.anomalyDetected` is set only by the vision path (true / false / null);
 * scripted fixtures leave it undefined, which keeps their outcomes unchanged.
 */
function classifyClaim(claim, prosecutor, defender, blindVerifier) {
  const blindSays = blindVerifier.anomalyDetected;
  const isVision = blindSays !== undefined;
  const conf = blindVerifier.observationalConfidence;

  const notRun = [prosecutor, defender, blindVerifier].filter((r) => r.notRun);
  if (notRun.length > 0 || defender.stance === 'NOT_RUN') {
    const reasons = notRun.map((r) => `${r.role}: ${r.notRunReason || 'not run'}`).join('; ');
    return {
      classification: 'CHALLENGED',
      rationale: `Verification incomplete (${reasons || 'Defender not run'}). Evidence is insufficient for an automated verdict.`
    };
  }

  if (claim.type === 'NOMINAL_COMPLIANCE') {
    if (!isVision) {
      return { classification: 'REJECTED', rationale: 'Blind verifier confirmed pristine surface; no defect exists.' };
    }
    if (blindSays === false && conf >= 0.70) {
      return {
        classification: 'REJECTED',
        rationale: `Blind verifier independently saw no anomaly in the photo (confidence ${conf.toFixed(2)}); no defect hypothesis remains.`
      };
    }
    return {
      classification: 'CHALLENGED',
      rationale:
        blindSays === true
          ? `Blind verifier independently reported a possible anomaly ("${blindVerifier.independentVerdict}") that the Prosecutor did not raise.`
          : `Blind verifier could not confirm a clean condition (confidence ${isFinite(conf) ? conf.toFixed(2) : 'n/a'}).`
    };
  }

  if (claim.type === 'AMBIGUOUS_LABEL' || conf < 0.70 || defender.stance === 'VALID_CHALLENGE') {
    return {
      classification: 'CHALLENGED',
      rationale: isVision
        ? `Insufficient evidence: Blind verifier confidence ${conf.toFixed(2)}${defender.stance === 'VALID_CHALLENGE' ? '; Defender raised a valid challenge' : ''}${claim.type === 'AMBIGUOUS_LABEL' ? '; label not legible' : ''}.`
        : 'Blind verifier reported optical glare and low observational confidence (0.45). Defender raised valid camera flash artifact challenge. Insufficient conclusive evidence for automated verdict.'
    };
  }

  if (isVision && blindSays !== true) {
    return {
      classification: 'CHALLENGED',
      rationale: `Blind verifier did not independently confirm an anomaly in the isolated crop (${blindSays === false ? 'saw none' : 'unclear'}); the finding is not sustained automatically.`
    };
  }

  if (conf >= 0.75 && prosecutor.confidence >= 0.75) {
    return {
      classification: 'VERIFIED',
      rationale: `Blind verifier independently confirmed physical anomaly ("${blindVerifier.independentVerdict}") in isolated crop without PO context. Prosecutor defect assertion is sustained.`
    };
  }

  // Below the VERIFIED thresholds: insufficient evidence is UNCERTAIN, never a silent pass
  return {
    classification: 'CHALLENGED',
    rationale: 'Evidence did not meet the confidence thresholds for a verified finding; insufficient evidence for an automated verdict.'
  };
}

function assembleDebatedClaim(claim, prosecutor, defender, blindVerifier, crop, masterImageHash, startTime) {
  const { classification, rationale } = classifyClaim(claim, prosecutor, defender, blindVerifier);
  const { cropBase64, cropHash, pixelCoords } = crop;
  const classificationRationale = rationale;
  const durationMs = Date.now() - startTime;

  return {
    claimId: claim.id,
    claimTitle: claim.title,
    claimType: claim.type,
    severity: claim.severity,
    poExpected: claim.poExpected,
    physicalObserved: claim.physicalObserved,
    bbox: claim.bbox,
    status: classification, // 'VERIFIED' | 'REJECTED' | 'CHALLENGED'
    classificationRationale,
    prosecutor,
    defender,
    blindVerifier,
    evidence: {
      cropBase64,
      cropHash,
      pixelCoords,
      masterImageHash
    },
    metrics: {
      durationMs,
      prosecutorConfidence: prosecutor.confidence,
      defenderPlausibility: defender.defensePlausibility,
      blindConfidence: blindVerifier.observationalConfidence
    }
  };
}

/**
 * Runs the complete PRD-3 DEBATE Adversarial Verification Pipeline
 * 
 * @param {Object} po - Purchase Order Data
 * @param {Buffer} cleanImageBuffer - Sanitized image buffer
 * @param {string} cleanImageHash - SHA-256 hash of clean image
 * @param {string} rawImageHash - SHA-256 hash of raw upload before sanitization
 * @param {Object} scenarioMeta - Optional scenario metadata
 */
async function runDebatePipeline(po, cleanImageBuffer, cleanImageHash, rawImageHash, scenarioMeta = null, options = {}) {
  // Overload: Support direct invocation with full scenario fixture object
  if (po && po.po && (!cleanImageBuffer || typeof cleanImageBuffer === 'string')) {
    const { getScenarioImageBuffer } = require('./scenarios');
    const { sanitizeImageMetadata } = require('./security');
    const { pngBuffer, sha256 } = await getScenarioImageBuffer(po.id);
    const sanitized = await sanitizeImageMetadata(pngBuffer);
    return runDebatePipeline(po.po, sanitized.cleanBuffer, sanitized.cleanHash, sanitized.rawHash || sha256, po.visualMetadata);
  }

  const pipelineStart = Date.now();
  let debatedClaims = [];
  let observedFeatures;
  let verification;

  if (scenarioMeta) {
    // Scenario fixtures (deterministic test/demo data): scripted roles
    const candidateClaims = await extractFeaturesAndGenerateClaims(po, cleanImageBuffer, scenarioMeta);
    for (const claim of candidateClaims) {
      debatedClaims.push(await executeDebateRoleWorkflow(claim, po, cleanImageBuffer, cleanImageHash));
    }
    observedFeatures = resolveObservedFeatures(po, scenarioMeta);
    verification = { status: 'COMPLETE', mode: 'SCENARIO_FIXTURE', reasons: [] };
  } else if (options.visionProvider) {
    // Uploaded photo inspected by the vision model (Prosecutor, Defender, Blind Verifier)
    const result = await runVisionInspection(po, cleanImageBuffer, cleanImageHash, options.visionProvider);
    debatedClaims = result.debatedClaims;
    observedFeatures = result.observedFeatures;
    verification = {
      status: result.reasons.length > 0 ? 'INCOMPLETE' : 'COMPLETE',
      mode: 'VISION_MODEL',
      model: options.visionProvider.model,
      reasons: result.reasons
    };
  } else {
    // No observations (no vision model configured): do not run the scripted roles and do
    // not report a match. One CHALLENGED claim states that visual verification was
    // unavailable, which the decision rules below turn into UNCERTAIN.
    const reason = options.unavailableReason || 'No vision model is configured (ANTHROPIC_API_KEY is not set).';
    debatedClaims.push(await buildVisionUnavailableClaim(po, cleanImageBuffer, cleanImageHash, options.unavailableReason));
    observedFeatures = resolveObservedFeatures(po, null);
    verification = {
      status: 'INCOMPLETE',
      mode: options.failedMode || 'NONE',
      reasons: [
        {
          stage: options.failedMode === 'VISION_MODEL' ? 'PIPELINE' : 'CONFIGURATION',
          kind: options.unavailableKind || 'NOT_CONFIGURED',
          reason
        }
      ]
    };
  }

  // 3. Apply Decision Logic Rules:
  // - Any VERIFIED defect -> EXCEPTION
  // - Otherwise any CHALLENGED -> UNCERTAIN
  // - Otherwise -> ACCEPT
  const hasVerifiedDefect = debatedClaims.some(c => c.status === 'VERIFIED' && c.claimType !== 'NOMINAL_COMPLIANCE');
  const hasChallengedClaim = debatedClaims.some(c => c.status === 'CHALLENGED');

  let finalVerdict = 'ACCEPT';
  let recommendedAction = 'RELEASE_TO_INVENTORY';
  let decisionRationale = 'All physical checks match PO specifications with no verified defects.';

  if (hasVerifiedDefect) {
    finalVerdict = 'EXCEPTION';
    recommendedAction = 'HOLD_AND_QUARANTINE';
    const defectNames = debatedClaims.filter(c => c.status === 'VERIFIED').map(c => c.claimTitle).join('; ');
    decisionRationale = `Adversarial verification confirmed 1 or more critical physical defects: ${defectNames}. Goods quarantined for vendor discrepancy claim.`;
  } else if (hasChallengedClaim) {
    finalVerdict = 'UNCERTAIN';
    recommendedAction = 'MANUAL_INSPECTION_REQUIRED';
    if (verification.mode === 'NONE') {
      decisionRationale = options.unavailableReason
        ? `Independent visual verification is unavailable: ${options.unavailableReason} The photo was not compared with the purchase order; a human dock inspector must verify the delivery.`
        : 'Independent visual verification is unavailable (no vision model configured). The photo was not compared with the purchase order; a human dock inspector must verify the delivery.';
    } else if (verification.status === 'INCOMPLETE') {
      decisionRationale = `Verification was not completed (${verification.reasons.map((r) => `${r.stage}: ${r.reason}`).join('; ')}). The result is UNCERTAIN; a human dock inspector must verify the delivery.`;
    } else if (verification.mode === 'VISION_MODEL') {
      decisionRationale = 'One or more findings could not be determined or independently confirmed from the photo. Requires human dock inspector sign-off.';
    } else {
      decisionRationale = 'Adversarial verification encountered ambiguous visual evidence (glare/occlusion). Blind verifier flagged observational uncertainty. Requires human dock inspector sign-off.';
    }
  }

  // 4. Generate Visual Bounding Box Annotation
  const { annotatedBase64 } = await generateAnnotatedImage(cleanImageBuffer, debatedClaims);

  // 5. Build Evidence Graph
  // Graph Structure:
  // Verdict -> Claims -> Prosecutor / Defender / BlindVerifier -> Image Crop -> SHA-256 Hashes
  const evidenceGraph = buildEvidenceGraph(finalVerdict, debatedClaims, cleanImageHash, rawImageHash);

  const totalDurationMs = Date.now() - pipelineStart;

  // 6. Assemble Structured Inspection Report
  const inspectionReport = {
    inspectionId: `INSP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random()*1000)}`,
    timestamp: new Date().toISOString(),
    poNumber: po.poNumber,
    vendor: po.vendor || 'N/A',
    expectedSku: po.expectedSku,
    expectedQuantity: po.expectedQuantity,
    observedFeatures,
    verification,
    finalVerdict, // 'EXCEPTION' | 'UNCERTAIN' | 'ACCEPT'
    recommendedAction,
    decisionRationale,
    claimsSummary: {
      total: debatedClaims.length,
      verified: debatedClaims.filter(c => c.status === 'VERIFIED').length,
      challenged: debatedClaims.filter(c => c.status === 'CHALLENGED').length,
      rejected: debatedClaims.filter(c => c.status === 'REJECTED').length
    },
    debatedClaims,
    evidenceGraph,
    securityAudit: {
      rawImageSha256: rawImageHash,
      cleanImageSha256: cleanImageHash,
      metadataStripped: true,
      isolationProtocolEnforced: true,
      textSanitizationApplied: true
    },
    annotatedImageBase64: annotatedBase64,
    metrics: {
      totalDurationMs,
      claimCount: debatedClaims.length
    }
  };

  return inspectionReport;
}

/**
 * Builds the interactive Evidence Graph structure for UI rendering and audits
 */
function buildEvidenceGraph(verdict, debatedClaims, cleanImageHash, rawImageHash) {
  const nodes = [];
  const edges = [];

  // 1. Root Verdict Node
  const verdictNodeId = 'node-verdict';
  nodes.push({
    id: verdictNodeId,
    type: 'VERDICT',
    label: `Verdict: ${verdict}`,
    status: verdict,
    description: verdict === 'EXCEPTION' ? 'Quarantine & Vendor Discrepancy Hold' : verdict === 'UNCERTAIN' ? 'Manual Inspection Required' : 'Approved for Inventory Release',
    data: { verdict }
  });

  debatedClaims.forEach((claim, cIdx) => {
    const claimNodeId = `node-claim-${cIdx}`;
    
    // 2. Claim Node
    nodes.push({
      id: claimNodeId,
      type: 'CLAIM',
      label: `${claim.claimId}: ${claim.claimTitle}`,
      status: claim.status,
      severity: claim.severity,
      data: {
        id: claim.claimId,
        type: claim.claimType,
        expected: claim.poExpected,
        observed: claim.physicalObserved,
        rationale: claim.classificationRationale
      }
    });

    edges.push({
      from: verdictNodeId,
      to: claimNodeId,
      label: claim.status,
      status: claim.status
    });

    // 3. Prosecutor Node
    const prosNodeId = `node-pros-${cIdx}`;
    nodes.push({
      id: prosNodeId,
      type: 'PROSECUTOR',
      label: `Prosecutor: Defect Charge`,
      confidence: claim.prosecutor.confidence,
      data: {
        arguments: claim.prosecutor.arguments,
        confidence: claim.prosecutor.confidence,
        focus: claim.prosecutor.evidenceFocus
      }
    });

    // 4. Defender Node
    const defNodeId = `node-def-${cIdx}`;
    nodes.push({
      id: defNodeId,
      type: 'DEFENDER',
      label: `Defender: ${claim.defender.stance}`,
      plausibility: claim.defender.defensePlausibility,
      data: {
        arguments: claim.defender.arguments,
        stance: claim.defender.stance,
        plausibility: claim.defender.defensePlausibility
      }
    });

    // 5. Blind Verifier Node (Isolated Crop)
    const blindNodeId = `node-blind-${cIdx}`;
    nodes.push({
      id: blindNodeId,
      type: 'BLIND_VERIFIER',
      label: `Blind Verifier (Crop Isolated)`,
      confidence: claim.blindVerifier.observationalConfidence,
      status: claim.status,
      data: {
        protocol: 'STRICT_ISOLATION',
        promptDelivered: claim.blindVerifier.promptDelivered,
        observations: claim.blindVerifier.observations,
        features: claim.blindVerifier.detectedPhysicalFeatures,
        cropHash: claim.evidence.cropHash,
        cropBase64: claim.evidence.cropBase64
      }
    });

    // 6. Evidence Crop Node
    const cropNodeId = `node-crop-${cIdx}`;
    nodes.push({
      id: cropNodeId,
      type: 'IMAGE_CROP',
      label: `Image Crop [${claim.evidence.pixelCoords.width}x${claim.evidence.pixelCoords.height}px]`,
      sha256: claim.evidence.cropHash,
      data: {
        cropHash: claim.evidence.cropHash,
        cropBase64: claim.evidence.cropBase64,
        bbox: claim.bbox,
        pixelCoords: claim.evidence.pixelCoords
      }
    });

    // Edges linking Claim -> Roles -> Evidence
    edges.push({ from: claimNodeId, to: prosNodeId, label: 'Alleges' });
    edges.push({ from: claimNodeId, to: defNodeId, label: 'Challenges' });
    edges.push({ from: claimNodeId, to: blindNodeId, label: 'Isolated Blind Audit' });
    edges.push({ from: blindNodeId, to: cropNodeId, label: 'Visual ROI' });
  });

  // Master Image Hash Node
  const masterImageNodeId = 'node-master-image';
  nodes.push({
    id: masterImageNodeId,
    type: 'IMAGE_HASH',
    label: `Master Image SHA-256`,
    sha256: cleanImageHash,
    data: {
      cleanHash: cleanImageHash,
      rawHash: rawImageHash
    }
  });

  debatedClaims.forEach((_, cIdx) => {
    edges.push({
      from: `node-crop-${cIdx}`,
      to: masterImageNodeId,
      label: 'Extracted From'
    });
  });

  return {
    nodes,
    edges,
    masterImageHash: cleanImageHash,
    rawImageHash
  };
}

module.exports = {
  classifyClaim,
  runVisionInspection,
  resolveObservedFeatures,
  extractFeaturesAndGenerateClaims,
  executeDebateRoleWorkflow,
  runDebatePipeline,
  buildEvidenceGraph
};
