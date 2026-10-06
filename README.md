# Cube Buildathon · 01 · Receiving Manager

**Commerce Context stream · Round 2 · Individual Build**

> Five agents, one unit, one record that follows it.
> A physical product arrives, gets prepped, gets shipped, comes back. At every step a person makes a fast judgment that nobody records. **You build the agent that makes one of those judgments, and leaves proof.**

**New here? Read these first:**

1. [`GITHUB-GUIDE.md`](GITHUB-GUIDE.md) explains how to fork the repository, set it up, build and push your work.
2. [`RULES.md`](RULES.md) covers the repository and engineering rules.

---

## Your problem statement: Receiving Manager

|                              |                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| **Position in the chain**    | Step 1 of 5. Supplier delivery.                                                     |
| **Customer**                 | Seller or 3PL taking supplier delivery                                              |
| **What gets recorded**       | Condition on arrival                                                                |
| **Who consumes your output** | Prep Manager (next in the chain) and Recovery Manager (supplier and inbound claims) |

A pallet arrives from a manufacturer, often overseas. Someone opens the cartons and decides whether what arrived is what was ordered: right SKU, right count, undamaged, to the quality agreed. Today this is a spot check at best. Shortages and defects surface weeks later when units fail in prep or come back as returns, by which point the supplier conversation is unwinnable because nothing was recorded on arrival.

**What the agent returns, from photographs at the point of receipt:**

* Identity of the goods against the purchase order line
* Quantity received against quantity ordered, including carton count and units per carton
* Damage visible on cartons and units: crushing, water, tears
* Quality flags against the agreed spec: wrong colour, wrong variant, missing components, obvious defects

> This is where supplier disputes originate, and the only point at which a claim against the supplier is still possible. Every downstream problem in this chain is cheaper if it was caught here.

### The chain you are part of

```text
 Supplier delivery      Inbound to Amazon     Outbound to buyer     Customer return        Money back
 ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
 │ 01 Receiving │ ───▶ │ 02 Prep      │ ───▶ │ 03 Pack      │ ───▶ │ 04 Returns   │      │ 05 Recovery  │
 │ condition on │      │ compliance   │      │ contents at  │      │ condition &  │      │ reads all    │
 │ arrival      │      │ proof        │      │ seal         │      │ disposition  │      │ four → claim │
 └──────┬───────┘      └──────┬───────┘      └──────┬───────┘      └──────┬───────┘      └──────▲───────┘
        └─────────────────────┴─────────────────────┴─────────────────────┴─────────────────────┘
```

The first four are the same machine: a camera, a model, and a decision bound to a record. What changes is the ruleset, the buyer and the moment. The fifth has no camera. It turns the other four's records into a claim.

Your output has to be usable by another pod. That's deliberate, and it's scored.

---

## Reference data

`data/` holds a **dummy** CSV for reference while you design and build. Its columns and meanings are listed in [`data/README.md`](data/README.md).

**The data is synthetic.** The SKUs, ASINs, FNSKUs, orders, suppliers, operators and amounts are all invented. The requirement flags and fee amounts are **not** Amazon's real rules or fees. Engineering rule 5 applies: look the authoritative rule up. The `photo_refs` paths are placeholders, and no images ship with this repo. Your fixtures and eval set are yours to capture.

All five buildathon repos share the same `unit_id` values (`UNIT-0001` … `UNIT-0100`). You can follow one unit from receiving through recovery, the same way the real records will be joined. In the sample, each unit takes one route: **FBA** (prep, then Amazon ships it and charges fees) or **merchant-fulfilled / 3PL** (the seller packs it). So a unit has a Prep record or a Pack record, never both.

---

## How this works

You have a defined problem statement, supporting domain information and an engineering repository to build from. Understand the customer and operational workflow before writing code, then build and measure whether the solution works.

Your goal is to turn the Receiving Manager problem into a working, measurable agent.

### What you're given

* This problem statement
* A domain brief covering the real economics, fee structures and what a working day in a warehouse looks like *(shared by the organisers)*
* The engineering rules in [`RULES.md`](RULES.md)
* Repository data and supporting resources
* One fully worked package for Returns Manager (customer letter, PR/FAQ, one-pager) as a reference for the standard expected. **Read it. Don't copy it.**

### What you produce

Build your solution in **your own GitHub fork**.

Your final Round 2 submission should include:

* A working Receiving Manager
* A `README.md` explaining your solution, setup, assumptions and limitations
* An `ARCHITECTURE.md`
* An eval report/results with numbers and named failure modes
* A working demo/video
* A deployment URL, where applicable
* Your mandatory LinkedIn post URL

## Build and submission flow

```text
Understand
    ↓
Build
    ↓
Test
    ↓
Evaluate
    ↓
Document
    ↓
Demo / Deploy
    ↓
Submit
```

Round 2 is an **individual build**.

The official build phase begins on **25 September 2026 at 9:00 AM IST**.

Submissions open from **27 September 2026**.

The final submission deadline is **1 October 2026 at 6:00 PM IST**.

The submission form closes permanently at the deadline. **There is no resubmission.**

All code commits forming your Round 2 submission must be made during the authorised build phase. Do not continue making Round 2 code changes after the build phase ends.

## What we're being straight with you about

* **The core assumption is untested.** Nobody knows yet whether vision models can identify products and grade condition on long-tail catalogues without per-SKU training. Finding out that it doesn't hold, and documenting that clearly, counts as a successful outcome.
* **Nobody has spoken to a customer yet.** If you can get a real prep center or seller on a call, ask them to rank the five problems by urgency. Don't ask whether they'd buy what you're building.
* **The background documents disagree in places.** A contradiction is a finding. Raise it as an Issue labelled `finding`.

---

## Evaluation

Your Round 2 submission is evaluated out of **100 points**:

| Criterion                                    |  Points |
| -------------------------------------------- | ------: |
| Problem Understanding & Solution Relevance   |  **15** |
| Agent Functionality & Decision Quality       |  **25** |
| Evaluation, Accuracy & Uncertainty Handling  |  **25** |
| Evidence, Traceability & Engineering Quality |  **20** |
| UX, Demo & Documentation                     |  **15** |
| **TOTAL**                                    | **100** |

For the vision-based portions of the Receiving Manager, use an appropriate unseen/held-out evaluation set and report your methodology, results, false positives, false negatives, `UNCERTAIN` cases and failure modes.

---

## Evidence and decision traceability

Your Receiving Manager should leave evidence behind for its decisions.

At minimum, the workflow should make it possible to understand:

```text
What was received?
        ↓
What was expected?
        ↓
What checks were performed?
        ↓
What did the agent find?
        ↓
What verdict was produced?
        ↓
Why?
```

Use the official evidence contract provided by the organisers as the baseline for interoperability with the other Managers.

---

## PASS · FAIL · UNCERTAIN

For individual checks:

* **PASS** — the evidence supports the condition.
* **FAIL** — the evidence shows the condition is not met.
* **UNCERTAIN** — the evidence is insufficient for a reliable judgment.

`UNCERTAIN` is not simply a low-confidence PASS.

---

*CUBE Buildathon · Commerce Context*

---

## Receiving Manager — Implementation & Quick Start

A Receiving Manager prototype built with **React 19, TypeScript 5.8, Vite 6, Express 5, Sharp and Vitest**. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how it works.

> **What this build is and is not.** Uploaded photos are inspected by a vision model (Claude, default
> `claude-opus-5-5`) when `ANTHROPIC_API_KEY` is set on the server: the Prosecutor, Defender and Blind
> Verifier are three separate model calls with different inputs (one model, three roles). Without a key,
> or when the model fails, times out or cannot determine something, the result is `UNCERTAIN` and can only
> be recorded as pending review. The 10 built-in test scenarios still use scripted roles and scenario
> metadata (`server/scenarios.js`) as deterministic fixtures — they do not exercise the model.
> The live model path has been tested only with a test double, not against the real API, and no
> evaluation against real photographs has been carried out yet.

### Configuration (server environment)

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the vision model for uploaded photos. Never commit it. |
| `VISION_MODEL` | Optional model override (default `claude-opus-5-5`). |
| `VISION_TIMEOUT_MS` | Per-call timeout (default 45000). |
| `VISION_PIPELINE_TIMEOUT_MS` | Whole-inspection timeout before failing open (default 150000). |

### Quick start

```bash
npm install
npm test                 # 103 unit & integration tests (Vitest)
npm run build            # type-check + production bundle into dist/
node server/server.js    # API + built UI on http://localhost:3001
```

For UI development, run `node server/server.js` (port 3001) and `npm run dev` (Vite on port 5173, which proxies `/api` to 3001).

### What is implemented

1. **New Inspection (PRD-3 DEBATE).** Pick one of 10 reference scenarios (or upload a photo), review the
   expected purchase-order values, run the inspection. Each candidate finding is passed through the
   Prosecutor, Defender and Blind Verifier roles and classified `VERIFIED`, `CHALLENGED` or `REJECTED`;
   the verdict is `EXCEPTION` if any finding is verified, else `UNCERTAIN` if any is challenged, else
   `ACCEPT`. Results show expected vs observed per finding, the image crops, an evidence graph and a
   downloadable JSON / printable HTML report.
2. **Vision inspection of uploaded photos.** The Prosecutor (photo + PO) reports observed count, SKU,
   variant, packaging and missing components with bounding boxes; findings are generated by the same
   comparison logic as the scenarios. The Defender (photo + findings) argues innocent explanations. The
   Blind Verifier receives only one crop and a fixed task — no claim, PO values or other roles'
   reasoning — once per finding. A finding is `VERIFIED` only if the Blind Verifier independently sees an
   anomaly; anything the photo doesn't show becomes an explicit `CHALLENGED` finding.
3. **Fail open (Rule 3).** Missing configuration, timeouts, API errors, refusals and incomplete model
   responses never produce a pass: the inspection returns `UNCERTAIN` with `verification.status:
   INCOMPLETE` and the reasons, which the UI shows. It can be recorded as a `PENDING_REVIEW` record with
   the reason kept and no received count invented (quantities are left empty).
3. **Recording an inspection.** A verified inspection becomes a receiving record using the engine's
   observed values (`observedFeatures`) and its verified findings, so the report, evidence graph,
   inspection history and dashboard show the same expected/received quantities.
4. **Manual Receiving.** Operator enters received SKU, cartons × units per carton, carton/unit damage and
   quality flags. Preset buttons show the exact quantity change they apply (e.g. `Short (−6)`).
5. **Deterministic classification** (`compareShipment`, `src/services/comparisonEngine.ts`):
   - difference = received − expected;
   - every discrepancy present is kept in `discrepancies` (e.g. `SHORT_RECEIVED` + `QUALITY_DISCREPANCY`);
   - primary status priority: wrong product → short / over → damaged → quality → uncertain → matched, so a
     quantity shortage or surplus is never hidden behind a quality flag;
   - disposition is the most protective action needed by any discrepancy (quarantine for wrong product,
     damage or quality; supervisor review for uncertain; accept-with-shortage or hold-surplus otherwise).
6. **Unit IDs.** The sample data uses `UNIT-0001`…`UNIT-0100`. New receipts are assigned the next number in
   the same format (`UNIT-0101`, …) by the data service; IDs are never random.
7. **Integrity.** Every receiving record has a **SHA-256 content hash** of its canonical JSON content.
   Every record creation and operator override is appended to a per-organisation **hash chain**
   (each entry includes the previous entry's hash). The Audit Trail runs **integrity verification**,
   which detects edits, deletions or broken links made outside the app. Images and crops are hashed with
   SHA-256 on the server.
8. **Persistence.** Records, PO lines and hash chains are saved in the browser's `localStorage` and loaded
   back exactly as stored after a reload. A corrupted or tampered store is reported as an integrity
   failure and is not repaired; only an explicit, confirmed "Reset demo data" re-seeds from the CSV.
9. **Operator overrides** require a justification; the original verdict, all original discrepancies, the
   new verdict and the reason are kept on the record and in the hash chain.
10. **Cross-pod evidence contract** JSON export per record for 02 Prep and 05 Recovery.

### Engineering rules: current status

| Rule | Status |
|---|---|
| 1. Tenancy isolation | Partial. All reads and writes are filtered by organisation in the client-side data service (tested). Server reports are bound to the organisation that created them and returned only to it (`X-Org-Id`; other orgs and unknown IDs get the same 404; missing/invalid org gets 400; tested). There is no user authentication — the client asserts its organisation — and no database row-level security. |
| 2. Batch model calls | Partial. The Prosecutor and Defender each make one call per unit covering all checks; the Blind Verifier makes one call per finding, because isolation requires it to see only one crop. |
| 3. Fail open | Implemented for uploaded photos: model/verifier failures return `UNCERTAIN` (`INCOMPLETE`, reasons kept) and can be recorded as `PENDING_REVIEW` (tested for timeout, error, verifier failure, missing configuration, incomplete response). |
| 4. Uncertain is a valid verdict | Implemented: `UNCERTAIN` for challenged findings and for any upload without visual verification. |
| 5. Look authoritative rules up | Not implemented: no channel rules are retrieved. |

### Limitations

- The vision path has only been exercised with a test double (no API key was available); real-photo
  accuracy is unmeasured. Scenario results reflect scripted metadata.
- The hash chain gives tamper **detection**, not immutability: it lives in browser storage, and someone with
  write access to that storage could rebuild the whole chain consistently. There is no external anchoring.
- Data is per browser (`localStorage`); there is no server-side database or multi-user storage.
- No held-out evaluation set or accuracy numbers yet.

