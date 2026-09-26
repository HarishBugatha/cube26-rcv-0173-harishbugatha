# Architecture & Design Document: Receiving Manager (01 · Receiving)

**Project:** CUBE Buildathon 2026 — Commerce Context Stream  
**Stage:** Step 01 of 05 (Supplier Delivery & Inbound Dock)  
**Author:** Harish Bugatha  
**Fork:** `cube26-rcv-0173-harishbugatha`  

---

## 1. System Overview

The **Receiving Manager** is the foundational stage (Step 1 of 5) in the physical commerce lifecycle:

```text
 01 Receiving       02 Prep            03 Pack            04 Returns         05 Recovery
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ Condition on │──▶│ Compliance   │──▶│ Contents at  │──▶│ Condition &  │   │ Reads all    │
 │ arrival      │   │ proof        │   │ seal         │   │ disposition  │   │ four → claim │
 └──────┬───────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────▲───────┘
        │                                                                           │
        └───────────────────────────────────────────────────────────────────────────┘
```

When a shipment arrives at the warehouse dock, a receiving agent must verify:
1. **Product / SKU Identity:** Does the physical barcode/SKU strictly match the Purchase Order line item?
2. **Quantity Reconciliation:** How many cartons and units arrived versus what was ordered?
3. **Physical Damage:** Are there visible carton tears, water intrusion, or crushing?
4. **Specification Quality:** Does the product conform to the agreed spec (color, variant, components)?
5. **Disposition Routing:**
   - Compliant shipments ➔ Route to **Step 02: Prep Manager**.
   - Shortages, wrong SKUs, or damages ➔ Quarantine and forward photographic proof to **Step 05: Recovery Manager** for supplier dispute / chargeback.

---

## 2. Technical Stack

- **Framework:** React 19 + TypeScript 5.8 (Strict Mode)
- **Tooling:** Vite 6 + Vitest 3.2
- **State & Data Architecture:** In-Memory Multi-Tenant Store with real-time CSV parser (`receiving_sample.csv`) and reactive dock state
- **Design System:** Industrial Warehouse Theme with IBM Plex Sans and IBM Plex Mono typography, high-contrast indicators, and Lucide React iconography.

---

## 3. Engineering Rules Compliance

### Rule 1: Tenancy Isolation Before Any Feature
- All data access and mutations are strictly scoped to the active tenant (`org_demo_alpha` or `org_demo_bravo`).
- The `dataService` enforces Row-Level Security: queries filter strictly by `orgId`. A user in `org_demo_alpha` receives zero records or PO lines from `org_demo_bravo`.
- Verified by automated unit tests in [`tests/tenancyAndValidation.test.ts`](file:///c:/Users/Harish/Desktop/receiving%20manager/tests/tenancyAndValidation.test.ts).

### Rule 2: Batch Processing
- Inspection and verification checks are conducted in a unified single pass per inbound PO line.

### Rule 3: Fail-Open Architecture
- In the event of network disruption or inconclusive automated analysis, the system creates a valid record with status `PENDING_REVIEW` or `UNCERTAIN`. Dock operators are never blocked from receiving physical cartons.

### Rule 4: Uncertainty as a First-Class Verdict
- Inconclusive evidence produces an `UNCERTAIN` verdict, routed to supervisor review (`SUPERVISOR_REVIEW`), rather than an incorrect guess.

### Rule 5: Authoritative Rules Lookup
- Specifications (SKU, ASIN, expected carton count, units per carton, color, variant, components) are loaded directly from the authoritative PO catalog.

---

## 4. Business Logic & Mathematical Formulas

### Quantity Balance
The quantity difference is deterministically calculated as:
$$\text{Difference} = \text{Received Quantity} - \text{Expected Quantity}$$

- **Matched ($0$):** Received exactly equals expected.
- **Short Received ($< 0$):** Received is less than expected (e.g. $90 - 100 = -10$). Triggers partial acceptance and supplier shortage claim.
- **Over Received ($> 0$):** Received exceeds expected (e.g. $110 - 100 = +10$). Triggers dock buffer hold for surplus units.

### Status Evaluation Priority
Discrepancies are evaluated with warehouse safety priority:
1. `WRONG_PRODUCT` (Received SKU $\neq$ Expected SKU)
2. `DAMAGED` (Carton or Unit crushing, water, or tears)
3. `QUALITY_DISCREPANCY` (Color variance, variant mismatch, missing items)
4. `UNCERTAIN` (Inconclusive visual evidence)
5. `SHORT_RECEIVED` ($\text{Difference} < 0$)
6. `OVER_RECEIVED` ($\text{Difference} > 0$)
7. `MATCHED` ($\text{Difference} = 0$, no defects)

---

## 5. Cross-Pod Evidence Contract (Prep & Recovery)

Each completed receiving record outputs a standard JSON payload binding the physical proof to `unit_id`:

```json
{
  "stage": "01_RECEIVING",
  "version": "2.0.0",
  "recordId": "RCV-0001",
  "unitId": "UNIT-0001",
  "orgId": "org_demo_alpha",
  "poRef": {
    "poNumber": "PO-7000",
    "poLine": 2,
    "supplier": "Supplier East (DUMMY)"
  },
  "product": {
    "skuExpected": "SKU-TOWEL-BLU",
    "skuReceived": "SKU-TOWEL-BLU",
    "asin": "B0DUMMY600",
    "title": "Cotton Bath Towel",
    "identityMatch": "yes"
  },
  "quantity": {
    "cartonsOrdered": 1,
    "cartonsReceived": 1,
    "unitsPerCartonOrdered": 24,
    "unitsPerCartonCounted": 24,
    "qtyOrdered": 24,
    "qtyReceived": 24,
    "qtyDifference": 0
  },
  "condition": {
    "cartonDamage": "none",
    "unitDamage": "none",
    "qualityFlags": []
  },
  "verdict": {
    "finalStatus": "MATCHED",
    "disposition": "ACCEPT_TO_PREP",
    "isOverridden": false
  },
  "evidence": {
    "photoRefs": [
      "fixtures/receiving/UNIT-0001_pallet.jpg",
      "fixtures/receiving/UNIT-0001_carton.jpg",
      "fixtures/receiving/UNIT-0001_unit.jpg"
    ],
    "operatorId": "op_eli",
    "capturedAt": "2026-06-04T17:32:00Z",
    "contentHash": "sha256-01rcv-70a969b88b969a07"
  }
}
```

---

## 6. Honesty Rules Implementation

1. **Tamper-Evident Content Hashes:** Records include a cryptographic content hash computed over the PO, SKU, quantity, status, operator, and timestamp.
2. **Overrides are Preserved as Data:** When a supervisor or operator overrides an automated decision, the original verdict, new verdict, operator ID, timestamp, and a mandatory justification reason are saved to the audit log.
3. **No Silent Mutations:** All state transformations are visible in the Audit & Cross-Pod Hashes tab.
