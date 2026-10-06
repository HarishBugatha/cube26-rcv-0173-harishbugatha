# harishbugatha · Receiving Manager (01 · Receiving) — PRD-3 DEBATE Architecture

**Participant:** Harish Bugatha  
**Repository Fork:** [cube26-rcv-0173-harishbugatha](https://github.com/HarishBugatha/cube26-rcv-0173-harishbugatha)  
**Stream:** Commerce Context · Round 2 Individual Build  
**Stage:** Step 01 of 05 — Inbound Receiving & Condition on Arrival  
**Core Specification:** PRD-3 DEBATE — Adversarial Multi-Role Verification with Strict Physical Crop Isolation  

> **Scope note:** uploaded photos are inspected by a Claude vision model when `ANTHROPIC_API_KEY` is set
> (Prosecutor, Defender and an isolated Blind Verifier as separate calls); without it, or on any model
> failure, the result is `UNCERTAIN` and recordable only as pending review. The 10 scenarios use scripted
> fixtures. The model path is tested with a test double only. See the main [`README.md`](../../README.md).

---

## Deliverables Index

| Deliverable | Description | Path / Link | Status |
|---|---|---|---|
| **Architecture Document** | Full 5-layer PRD-3 DEBATE architecture, 3-role pipeline, evidence graph, security | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) | ✅ Complete |
| **Adversarial Debate Engine** | Three logical roles (Prosecutor, Defender, Blind Verifier), deterministic rule-based code; no model calls | [`server/debateEngine.js`](../../server/debateEngine.js) | ✅ Complete |
| **Security Preprocessing** | MIME whitelist, 15MB limit, Sharp EXIF stripping, SHA-256 master hashing | [`server/security.js`](../../server/security.js) | ✅ Complete |
| **Precision Crop Engine** | Sub-pixel ROI extraction, SVG bounding box visual annotation, crop SHA-256 | [`server/cropEngine.js`](../../server/cropEngine.js) | ✅ Complete |
| **10 PRD Visual Scenarios** | Generated SVG/PNG visuals with scripted observation metadata (not a real-photo evaluation set) | [`server/scenarios.js`](../../server/scenarios.js) | ✅ Complete |
| **Interactive Evidence Graph** | Visual DAG linking Verdict ➔ Claim ➔ Roles ➔ Crop ROI ➔ SHA-256 | [`src/components/EvidenceGraph.tsx`](../../src/components/EvidenceGraph.tsx) | ✅ Complete |
| **Interactive Debate Visualizer** | Live 3-role progression display with confidence gauges and stance tags | [`src/components/DebatePipelineVisualizer.tsx`](../../src/components/DebatePipelineVisualizer.tsx) | ✅ Complete |
| **Visual Evidence Viewer** | High-res receiving photo viewer with normalized ROI bounding boxes | [`src/components/VisualEvidenceViewer.tsx`](../../src/components/VisualEvidenceViewer.tsx) | ✅ Complete |
| **Adversarial Dossier Modal** | Crop zoom, SHA-256 content hashes of the image and crop, role-by-role reasoning | [`src/components/DossierModal.tsx`](../../src/components/DossierModal.tsx) | ✅ Complete |
| **Structured Report & Export** | Exportable JSON audit contract and printable HTML receiving dossier | [`src/components/StructuredReportView.tsx`](../../src/components/StructuredReportView.tsx) | ✅ Complete |
| **Tenancy Isolation Service** | Application-level filtering by organisation for `org_demo_alpha` & `org_demo_bravo` (no database RLS) | [`src/services/dataService.ts`](../../src/services/dataService.ts) | ✅ Complete |
| **Cross-Pod Evidence Contract** | JSON contract feeding 02 Prep and 05 Recovery | [`src/components/CrossPodExportModal.tsx`](../../src/components/CrossPodExportModal.tsx) | ✅ Complete |
| **Operator Override Audit** | Captures operator overrides with mandatory reasons ("overrides are data") | [`src/components/OverrideModal.tsx`](../../src/components/OverrideModal.tsx) | ✅ Complete |
| **Integrity (hash chain)** | SHA-256 record content hashes, per-organisation hash chain, integrity verification, persisted in browser storage | [`src/services/dataService.ts`](../../src/services/dataService.ts) | ✅ Complete (tamper detection, not immutability) |
| **Unit & Integration Test Suite** | 103 tests: classification, 10 scenarios, record consistency, vision fail-open, Blind Verifier isolation, report tenant isolation, hash chain, persistence | [`tests/`](../../tests/) | ✅ 103/103 passing |

---

## 10 PRD Benchmark Scenarios Matrix

| # | Scenario Name | Category | Primary Physical Evidence | Expected Verdict |
|---|---|---|---|:---:|
| **1** | Correct Shipment | Match | 4 units, matching SKU, pristine packaging | **`ACCEPT`** |
| **2** | Short Quantity | Discrepancy | 9 units present, 3 empty cavity positions | **`EXCEPTION`** |
| **3** | Extra Quantity | Discrepancy | 4 units detected (PO authorized 3) | **`EXCEPTION`** |
| **4** | Wrong SKU | Identity Mismatch | Scanned barcode reads `SKU-VR-7200` vs `SKU-VR-8800` | **`EXCEPTION`** |
| **5** | Wrong Variant | Specification | Label reads `Space Gray / 64GB` vs `Blue / 128GB` | **`EXCEPTION`** |
| **6** | Crushed Packaging | Physical Damage | Corner impact compression fracture (>25mm depth) | **`EXCEPTION`** |
| **7** | Water Damage | Physical Damage | Concentric capillary tide marks & swollen cardboard | **`EXCEPTION`** |
| **8** | Torn Packaging | Tamper & Breach | Severed tamper security void tape & lifted flap | **`EXCEPTION`** |
| **9** | Missing Component | Incomplete Kit | Cutout slot #3 for Encoder Cable is vacant | **`EXCEPTION`** |
| **10** | Ambiguous / Glare | Low Confidence | Specular reflection occludes ~35% of barcode matrix | **`UNCERTAIN`** |

---

## Kill Condition

> If physical receiving cannot reliably reconcile SKU identity, physical counts, packaging integrity, and variant conformity at the dock before goods enter prep, or if cross-tenant leakage occurs between demo organizations, the stage must fail to supervisor quarantine.

---

## Quick Start & Verification

```bash
# 1. Install dependencies
npm install

# 2. Run automated test suites
npm test

# 3. Build production bundle
npm run build

# 4. Start the server (serves the API and the built UI on port 3001)
node server/server.js

# Optional: Vite dev server on 5173 (proxies /api to the server on 3001)
npm run dev
```
