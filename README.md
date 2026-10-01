# 01 · Receiving Manager — PRD-3 DEBATE Adversarial Verification System

A production-grade, evidence-backed Receiving Verification system implementing the **PRD-3 DEBATE Adversarial Verification Workflow** for warehouse and dock intake operations.

Built for the **Cube Buildathon · 01 · Receiving Manager**.

---

## Key Features

1. **Adversarial 3-Role DEBATE Verification Pipeline**:
   - **Prosecutor**: Finds and formulates concrete physical defect allegations from PO discrepancies and image inspection.
   - **Defender**: Analyzes the complete physical context to counter/disprove defect allegations (identifying optical illusions, camera glare, reflections, harmless folds vs true crushes).
   - **Blind Verifier (Strict Isolation Protocol)**: Receives **ONLY the cropped Region of Interest (ROI) image patch** with **ZERO PO context, zero claim text, and zero prosecutor thesis leaked**.
2. **Deterministic Claim Classification**:
   - `VERIFIED` $\to$ Sustained defect evidence $\to$ Supports `EXCEPTION`
   - `CHALLENGED` $\to$ Visual ambiguity / glare / conflict $\to$ Triggers `UNCERTAIN`
   - `REJECTED` $\to$ Discarded non-defect claim $\to$ Supports `ACCEPT`
3. **Strict Decision Logic**:
   - Any verified defect $\to$ **`EXCEPTION`** (Quarantine & Vendor Discrepancy Hold)
   - Otherwise any challenged claim $\to$ **`UNCERTAIN`** (Manual Dock Inspector Review Required)
   - Otherwise $\to$ **`ACCEPT`** (Approved for Inventory Release)
4. **Interactive Evidence Graph**:
   - Fully connected directed graph linking:
     $$\text{Verdict} \longrightarrow \text{Claim} \longrightarrow \text{Counter-argument} \longrightarrow \text{Blind Verification} \longrightarrow \text{Image Crop ROI} \longrightarrow \text{SHA-256 Hash}$$
5. **Clickable Adversarial Dossier Inspection**:
   - Every claim and FAIL node is clickable to open a deep-dive dossier with side-by-side PO vs. observed evidence, crop zoom magnifier, and cryptographic checksums.
6. **10 PRD Test Scenarios Built-in**:
   1. Correct Shipment (`ACCEPT`)
   2. Short Quantity (-3 units) (`EXCEPTION`)
   3. Extra Quantity (+1 unit) (`EXCEPTION`)
   4. Wrong SKU (`EXCEPTION`)
   5. Wrong Variant (`EXCEPTION`)
   6. Crushed Packaging (`EXCEPTION`)
   7. Water Damage (`EXCEPTION`)
   8. Torn Packaging & Broken Seal (`EXCEPTION`)
   9. Missing Component (`EXCEPTION`)
   10. Ambiguous / Glared Barcode (`UNCERTAIN`)
7. **Security & Cryptographic Proof**:
   - Automatic server-side **EXIF & GPS metadata stripping**.
   - **SHA-256 cryptographic hashing** of raw uploads, clean images, and visual crops.
   - **Untrusted OCR & Image Text Sanitization** to neutralize prompt injection exploits.
   - Downloadable structured JSON evidence reports & printable HTML audit dossiers.

---

## Quick Start

### Prerequisites
- Node.js (v18+)
- npm (v9+)

### Installation & Running Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/HarishBugatha/cube26-rcv-0173-harishbugatha.git
   cd cube26-rcv-0173-harishbugatha
   ```

2. **Install root & client dependencies**:
   ```bash
   npm install
   npm --prefix client install
   ```

3. **Build and Run**:
   ```bash
   # Build the frontend
   npm --prefix client run build

   # Start the Receiving Manager server
   npm start
   ```

4. **Access the Web Interface**:
   Open **`http://localhost:3001`** in your browser.

   *(For live frontend development with hot-reloading, run `npm run client` and visit `http://localhost:5173`)*

---

## REST API Endpoints

- `GET /api/health` — Health check, system status, and security compliance flags.
- `GET /api/scenarios` — Lists all 10 PRD test scenarios with purchase orders and expected verdicts.
- `GET /api/scenarios/:id` — Retrieves scenario details, PO, and rendered SVG/PNG image buffer.
- `POST /api/verify/scenario/:id` — Executes the PRD-3 DEBATE adversarial verification workflow on a preset scenario.
- `POST /api/verify/custom` — Multipart upload endpoint for custom PO data and receiving photos.
- `GET /api/report/:id` — Downloads the structured inspection report (`?format=json` or `?format=html`).

---

## Project Structure

```
.
├── client/                     # Vite + React Modern Web Application
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx                # Security badges & system status
│   │   │   ├── ScenarioSelector.jsx      # 10 PRD test scenarios carousel
│   │   │   ├── POEditorPanel.jsx         # PO editor & custom upload dropzone
│   │   │   ├── VisualEvidenceViewer.jsx  # Bounding boxes & SHA-256 hash copy
│   │   │   ├── DebatePipelineVisualizer.jsx # 3-Role DEBATE live cards
│   │   │   ├── EvidenceGraph.jsx         # Interactive directed Evidence Graph
│   │   │   ├── DossierModal.jsx          # Clickable FAIL & crop zoom magnifier
│   │   │   └── StructuredReportView.jsx  # Audit log & JSON/HTML report export
│   │   ├── App.jsx                       # Master workflow coordinator
│   │   └── index.css                     # Custom glassmorphic dark theme
│   ├── package.json
│   └── vite.config.js
├── server/                     # Express.js Backend & Adversarial Engines
│   ├── security.js             # EXIF stripping, SHA-256, prompt injection filter
│   ├── cropEngine.js           # Sub-pixel ROI extractor & bounding box overlays
│   ├── scenarios.js            # 10 PRD test scenarios & SVG/PNG image generator
│   ├── debateEngine.js         # 3-Role DEBATE verification & classification
│   └── server.js               # REST API server & static asset host
├── ARCHITECTURE.md             # Detailed engineering and verification architecture
├── README.md                   # Project overview & quickstart guide
└── package.json
```

---

## Verification Test Results

All 10 PRD test scenarios pass with exact expected verdicts:

| Scenario | Discrepancy | Classification | Verdict | Result |
|---|---|---|---|---|
| `scenario-1-correct` | Pristine match | `REJECTED` (Clean) | `ACCEPT` | ✅ PASS |
| `scenario-2-short-quantity` | Deficit of 3 units in tray | `VERIFIED` | `EXCEPTION` | ✅ PASS |
| `scenario-3-extra-quantity` | +1 extra unit overshipment | `VERIFIED` | `EXCEPTION` | ✅ PASS |
| `scenario-4-wrong-sku` | Model 7200 vs 8800 | `VERIFIED` | `EXCEPTION` | ✅ PASS |
| `scenario-5-wrong-variant` | 64GB Gray vs 128GB Blue | `VERIFIED` | `EXCEPTION` | ✅ PASS |
| `scenario-6-crushed-packaging` | Severe corner crush & crease | `VERIFIED` | `EXCEPTION` | ✅ PASS |
| `scenario-7-water-damage` | Moisture ring stains & warped fiber | `VERIFIED` | `EXCEPTION` | ✅ PASS |
| `scenario-8-torn-packaging` | Fractured security void tape | `VERIFIED` | `EXCEPTION` | ✅ PASS |
| `scenario-9-missing-component` | Foam slot #3 empty | `VERIFIED` | `EXCEPTION` | ✅ PASS |
| `scenario-10-ambiguous` | Specular glare obscuring barcode | `CHALLENGED` | `UNCERTAIN` | ✅ PASS |
