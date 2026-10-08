# Architecture: Receiving Manager (01 · Receiving), PRD-3 DEBATE

**Project:** CUBE Buildathon 2026, Commerce Context stream
**Stage:** Step 01 of 05, supplier delivery / condition on arrival
**Author:** Harish Bugatha
**Repository fork:** `cube26-rcv-0173-harishbugatha`

This document describes what the current code does. Where a design intent is not yet backed by an
implementation, that is stated explicitly.

---

## 1. Summary

| Area | Current implementation |
|---|---|
| Inspection engine | `server/debateEngine.js`: three roles (Prosecutor, Defender, Blind Verifier). For uploaded photos each role is a separate Claude API call (`server/visionProvider.js`, default `claude-opus-5-5`, JSON-schema output, per-call timeout). For the 10 scenario fixtures the roles are scripted, deterministic code. |
| Observations | Uploaded photos: reported by the vision model (`source: VISION_MODEL`; `null` = not determinable). Scenario fixtures: metadata in `server/scenarios.js`. |
| No model / model failure | Missing configuration, timeout, API error, refusal or incomplete response → `UNCERTAIN` with `verification.status: INCOMPLETE` and the reasons. Never reported as a match; recordable only as `PENDING_REVIEW`. |
| Blind Verifier isolation | Vision path: receives exactly one crop plus a fixed task text; no claim, PO values or other roles' reasoning (tested by inspecting the request). |
| Classification | `compareShipment` (`src/services/comparisonEngine.ts`): deterministic arithmetic and rules. |
| Storage | Client-side data service (`src/services/dataService.ts`), persisted to browser `localStorage`. |
| Integrity | SHA-256 content hash per record and a per-organisation hash chain, plus integrity verification. Images and crops are hashed with SHA-256 on the server. |
| UI | React 19 + Vite (`src/`), served by Express from `dist/`. |

---

## 2. Inspection pipeline (PRD-3 DEBATE)

```text
Photo + PO ─► Security preprocessing ─► Observed features ─► Candidate findings
                                              │                     │
                                     (no model / failure)             ▼
                                              │       Prosecutor / Defender / Blind Verifier
                                              │                     │
                                              ▼                     ▼
                                VISUAL_VERIFICATION_UNAVAILABLE   Classification per finding
                                   (CHALLENGED)                   VERIFIED / CHALLENGED / REJECTED
                                              └──────────┬──────────┘
                                                         ▼
                                   Verdict: EXCEPTION > UNCERTAIN > ACCEPT
                                                         ▼
                        Annotated image · evidence graph · JSON / HTML report
```

### 2.1 Security preprocessing (`server/security.js`)
- Upload checks: MIME whitelist (JPEG, PNG, WEBP, TIFF) and 15 MB limit, for both multipart uploads and the
  base64 `imageDataUrl` fallback. The real format is then checked from the decoded bytes; a file that is not
  a decodable JPEG/PNG/WEBP/TIFF is rejected with 400 (it is never passed on with its metadata intact).
- PO inputs: `expectedQuantity` must be a positive whole number and `expectedComponents` an array of at most
  50 strings (sanitised); anything else is a 400.
- Metadata stripping: the image is auto-rotated and re-encoded with Sharp, which drops EXIF/GPS metadata.
  Uploads become a JPEG working copy (quality 88) capped at 2048 px on the long edge (never enlarged); the
  scenario fixtures stay PNG. Crops and the annotated image are JPEG data URLs (quality 85); crops are capped
  at 1568 px so the Blind Verifier receives exactly the stored crop bytes.
- SHA-256 (`crypto.createHash('sha256')`): `rawHash` is the hash of the original upload bytes; `cleanHash` is
  the hash of the sanitised working copy that is inspected; `cropHash` is the hash of the exact crop bytes
  sent to the Blind Verifier.
- Progress streaming: with `?stream=1` both verify routes answer with NDJSON stage/claim events (each with
  `t` = ms since the request started) ending in one `{"type":"report"}` or `{"type":"error"}` line. Input
  validation errors are still plain JSON 400s. A client disconnect cancels pending model calls.
- PO text fields are sanitised before use (`sanitizeExtractedText`).
- Pipeline calls are wrapped in a timeout. On the scenario route a timeout or error returns an error. No pending
  record is created by the server. For uploads, a pipeline timeout/error instead returns a fail-open
  `UNCERTAIN` report (`verification.status: INCOMPLETE`, stage `PIPELINE`), which the UI can record as
  `PENDING_REVIEW`. Reports are cached per organisation and returned only to the owner (`X-Org-Id`).

### 2.2 Observed features
`resolveObservedFeatures(po, scenarioMeta)` returns the features findings are generated from. It is
also included in the report as `observedFeatures`, so records use exactly the same values.
- Scenario: `source: 'SCENARIO_METADATA'` with the scripted values.
- Upload (no vision model): `source: 'NONE'`, every observed value `null`. PO values are never assumed
  to be observations. Client-supplied `visualMeta` on the upload route is ignored.

### 2.3 Candidate findings
Generated by comparing observed features with the PO: quantity shortage/overage, ambiguous label,
SKU mismatch, variant mismatch, crushed/water-damaged/torn packaging, missing components. If nothing
differs, one `NOMINAL_COMPLIANCE` finding is created. Each finding has a normalised bounding box.

### 2.4 The three roles
For uploaded photos with a vision model configured, each role is a separate Claude call (see §1 and §2.5).
For the **scenario fixtures**, all three are deterministic code paths selected by finding type; their text
and confidence values are scripted, not generated by a model. The table below describes the fixture path.

| Role | Purpose | What the code does today |
|---|---|---|
| **Prosecutor** | States the case that the defect exists | Scripted arguments and a confidence per finding type. |
| **Defender** | Looks for innocent explanations (glare, folds, lighting) | Scripted counter-arguments, a stance (`CONCEDE_DEFECT`, `VALID_CHALLENGE`, …) and a plausibility score. |
| **Blind Verifier** | Independent check of the cropped region only | Sharp extracts the crop and computes its SHA-256; the crop and an isolation prompt (no PO, SKU or claim text) are stored with the finding. Fixtures: its observations are **selected by finding type in code** and no model receives the crop. Vision path: the crop and the fixed task are the only input to the model (tested by inspecting the request). |

### 2.5 Classification and verdict (unchanged decision rules)
- `REJECTED`: the Blind Verifier reports no defect (nominal finding).
- `CHALLENGED`: ambiguous label, Blind Verifier confidence < 0.70, or the Defender raises a valid challenge.
- `VERIFIED`: Blind Verifier confidence ≥ 0.75 and Prosecutor confidence ≥ 0.75.
- Verdict: `EXCEPTION` if any non-nominal finding is `VERIFIED`, else `UNCERTAIN` if any is `CHALLENGED`
  (or verification is `INCOMPLETE`), else `ACCEPT`.

Vision path (uploaded photos) — additional rules:
- Comparisons are strict: SKU and variant must be equal after normalising case and punctuation. A partial SKU
  read becomes `AMBIGUOUS_LABEL` (CHALLENGED); a count of 0 is a shortage. (The scenario fixtures keep their
  original substring/keyword rules, which their scripted data was written for.)
- The Blind Verifier's support is **claim-specific** and compared in code (it never sees the PO):
  - quantity: its independent unit count must agree with the Prosecutor's; a contradicting count is never
    overridden. Only when it cannot count does a shortage accept "anomaly + empty slots visible" instead;
  - SKU/variant: the crop's visible text must show the detected value and must not show the PO value;
  - packaging: it must report the same damage type;
  - missing component: an empty slot, or an anomaly that is not damage (a dent does not count).
- The nominal (no-difference) finding is `REJECTED` (→ ACCEPT) only if the Blind Verifier sees no anomaly
  (≥ 0.70), the Prosecutor is confident (≥ 0.75), the Defender supports a clean result, and the Blind
  Verifier's independent unit count does not contradict the Prosecutor's.
- Facts the photo cannot show (count, SKU, variant, packaging, kit completeness when the PO lists
  components) and Prosecutor findings that contradict its own structured result become CHALLENGED findings.
- Claim texts for real photos state only what the model reported (no fixture wording).

The no-vision finding is created directly as `CHALLENGED` (all role outputs "Not run", confidence 0),
so these same rules produce `UNCERTAIN`.

### 2.6 Evidence graph
Built by `buildEvidenceGraph`: verdict node → one node per finding → Prosecutor, Defender and Blind
Verifier nodes → image-crop node (crop SHA-256) → source-image node (sanitised and raw SHA-256). It is
a data structure for traceability; it is not itself stored immutably. Crop nodes carry the crop hash,
bbox and pixel coordinates; the crop image itself is only in `claim.evidence.cropBase64`.

---

## 3. From inspection to receiving record

`buildRecordFromInspection` (`src/services/inspectionRecord.ts`) is the single mapping:
- expected values come from the PO snapshot the inspection ran against;
- received count, SKU, etc. come from `report.observedFeatures`;
- only `VERIFIED` findings become discrepancies (`missing_components`, `wrong_variant`, carton damage,
  SKU mismatch); any `CHALLENGED` finding (or an `UNCERTAIN` verdict) adds `UNCERTAIN` and supervisor
  review, so a record never reads `MATCHED` when its report does not; `REJECTED` are ignored;
- status, difference and disposition are computed by `compareShipment`;
- inspections with no visual observations are refused (no received count is invented).

Example (short scenario): expected 12, received 9, difference −3, status `SHORT_RECEIVED`,
discrepancies `[SHORT_RECEIVED, QUALITY_DISCREPANCY]` (missing component), disposition quarantine.

---

## 4. Classification rules (`compareShipment`)

- `difference = received − expected`.
- Every discrepancy present is collected in `discrepancies`, in priority order:
  `WRONG_PRODUCT` → `SHORT_RECEIVED` / `OVER_RECEIVED` → `DAMAGED` → `QUALITY_DISCREPANCY` → `UNCERTAIN`.
- `status` is the first entry (or `MATCHED`). A quantity shortage or surplus therefore stays the primary
  status even when a quality flag or damage is also present, and those remain in `discrepancies`,
  `qualityFlags` and `cartonDamage` / `unitDamage`.
- Disposition is the most protective action required by any discrepancy:
  `HOLD_QUARANTINE_RECOVERY` (wrong product, damage, quality) → `SUPERVISOR_REVIEW` (uncertain) →
  `ACCEPT_WITH_SHORTAGE` (short) / `HOLD_SURPLUS` (over) → `ACCEPT_TO_PREP`.

---

## 5. Data, identifiers and integrity

### 5.1 Records and tenancy
- Records and PO lines are seeded from `data/receiving_sample.csv` (dummy data) and held by the data service.
- Every read and write is filtered by organisation (`org_demo_alpha`, `org_demo_bravo`); cross-tenant
  lookups return nothing (tested). This is application-level filtering, not database row-level security.

### 5.2 Unit IDs
The sample data uses `UNIT-0001`…`UNIT-0100` as the shared cross-pod join key. `addReceivingRecord`
always assigns the next number in the same format (`UNIT-0101`, …), so IDs are deterministic and unique.
Manual receipts use the matching record ID (`RCV-0101`). Recorded inspections use `RCV-<inspection id>`.

### 5.3 SHA-256 content hash
`generateContentHash(record)` = `sha256-01rcv-` + SHA-256 (hex) of the record's canonical JSON (keys
sorted, every field except `contentHash`). A synchronous SHA-256 implementation (`src/services/sha256.ts`)
is used so the same code runs in the browser and in tests; it is tested against Node's `crypto`.

### 5.4 Hash chain
One append-only chain per organisation. Each entry stores `index`, `eventType` (`RECORD_CREATED` or
`OPERATOR_OVERRIDE`), `recordId`, the record's `contentHash`, `prevHash` (the previous entry's hash, or
64 zeros for the first entry) and, for overrides, the override details. `entryHash` = SHA-256 of the
entry's canonical JSON.

### 5.5 Integrity verification
`verifyIntegrity(org)` recomputes every entry hash, checks every `prevHash` link, re-hashes every stored
record against the latest chain entry for it, and reports records missing from storage or from the chain,
and unreadable storage. The Audit Trail shows PASS/FAIL and the individual failures.

### 5.6 Persistence
Records, PO lines and chains are written to `localStorage` after every change and loaded back unchanged
on reload (not re-hashed). If stored data is tampered with, verification fails. If it cannot be parsed,
nothing is loaded, saving is blocked so the evidence is not overwritten, and the failure is reported.
Only an explicit, confirmed "Reset demo data" action discards it and re-seeds from the CSV.

### 5.7 What this does not guarantee
This is tamper **detection**, not immutability. The chain lives in the same browser storage as the
records, so someone with write access could rebuild the entire chain consistently. There is no external
anchoring, signing key or server-side copy.

---

## 6. Operator overrides
Overrides require a justification of at least 8 characters. The record keeps the original status, the
full list of original discrepancies, the new status, the operator, a timestamp and the reason. The change
is re-hashed and appended to the chain as an `OPERATOR_OVERRIDE` entry.

## 7. Cross-pod evidence contract
`buildEvidenceContract(record)` emits JSON with PO reference, product identity, quantities, condition,
verdict (primary status, all discrepancies, disposition, override details) and evidence (photo
references, operator, timestamp, content hash) for 02 Prep and 05 Recovery.

## 8. Testing
`npm test` runs 127 Vitest tests (including the vision fail-open, Blind Verifier isolation and report tenant-isolation suites): comparison rules (including combined short/over + quality cases), the
10 DEBATE scenarios, record consistency across report / graph / record, no-vision behaviour, SHA-256
against Node `crypto`, hash-chain linking, tamper and deletion detection, persistence across reloads,
unit-ID allocation, preset labels, tenancy isolation and input validation.

## 9. Known limitations
- The vision path is tested only with a test double for the API client; real-photo accuracy is unmeasured.
  Scenario outcomes reflect scripted metadata.
- No held-out evaluation set yet.
- Rule 5 (authoritative rule lookup) is not implemented (out of scope for this stage).
- Tenancy on the server is asserted by the client (`X-Org-Id`), not authenticated.
- CORS is open and there is no rate limit on the paid vision route.
- The Blind Verifier makes one call per finding (isolation: one crop per call), so a unit costs 2 + N model
  calls rather than the one call Rule 2 asks for. This is a deliberate trade-off of the PRD-3 design.
- A pipeline timeout returns the fail-open result, but role calls already in flight are only bounded by
  their own per-call timeout (they are aborted then), not cancelled immediately.
- The report cache is in memory and keeps the 200 most recent reports.
