# Change log — agent review, fixes and redesign (8 Oct 2026)

> **Deadline note:** RULES.md R4/R5 forbid Round 2 code changes after 1 Oct 2026, 6 PM IST.
> All changes below were made to a local copy. Pushing them to the submission fork may count against the submission.

Tests: **103 → 137 passing** (`npm test`). Type-check and build clean (`npm run build`).

---

## 1. Who did what: main agent vs. subagents

One **main agent** (Claude, in this session) planned the work, read the code, made most of the
changes and decided which findings to accept. **Subagents** are separate Claude instances the main agent
started for one focused job each. They had no memory of this conversation, only the brief they
were given, so their findings were independent. Every subagent finding was checked against the code
by the main agent before acting on it. Some had wrong line numbers, and one claimed a
variable that wasn't in scope.

| Who | Role | What it did |
|---|---|---|
| **Main agent** | Lead engineer / designer | Read the agent end to end; found and fixed the core logic bugs; wrote the regression tests; diagnosed the 185 MB upload failure; designed and built the new UI (design system, live run board, photo stage, streaming client, inspection page); removed invented data; verified everything in the browser |
| Code reviewer (backend) | Read-only audit | Reviewed `server/*.js`: found the edge-of-image crop crash, the double-billed timeout retry, the hard-coded `metadataStripped`, the unused Prosecutor findings |
| TypeScript reviewer | Read-only audit | Reviewed `src/services/*`: confirmed NaN counts became MATCHED and CHALLENGED findings were dropped from records |
| Silent-failure hunter | Cross-check 1 (round 1) | Verified the first fixes; found 7 more issues (body-less POST crash, half-normalised SKU compare, a dent verifying a missing part, components never checked, Defender ignored on ACCEPT) |
| Test analyzer | Cross-check 1 (round 1) | Checked that the new tests really pin the bugs; pointed out weak tests and coverage gaps |
| Code reviewer (fresh) | Cross-check 2 (round 1) | Full re-verification: live server smoke test, traced every claim type, audited docs against code |
| **General-purpose subagent** | Builder (round 2, server) | Implemented the payload fix (185 MB → 1.7 MB), the NDJSON live event stream, the concurrent Defender/Blind Verifier, per-role effort, and their tests. It worked only in `server/` and `tests/` while the main agent built the UI |
| React reviewer | Cross-check 1 (round 2) | Reviewed the new UI: found 13 issues (stuck "running" state, stale-run races, clipped region labels, a scripted run claiming an "isolated crop") |
| Code reviewer (fresh) | Cross-check 2 (round 2) | Verified every UI fix and the live stream contract; found the remaining invented values (generated PO number, `'N/A'` vendor, manual-PO placeholders) |

**The difference, in short:** subagents *found* problems or *built* one isolated piece from a written
brief. The main agent decided what was real, made the design decisions, integrated everything, and
is accountable for the result.

---

## 2. Round 1: agent logic and security

### Bugs fixed in the inspection agent (`server/debateEngine.js`, `server/visionProvider.js`)
- An empty carton (0 units counted) was turned into "all units present" (`Number(0) || expected`).
- The variant check only worked for the demo words gray/64gb/standard/legacy. Real photos never raised a variant mismatch.
- The SKU check used a two-way substring match, so `SKU-1` matched `SKU-12`. A partial read is now *ambiguous* (UNCERTAIN), and "readable" with an empty SKU counts as not determinable.
- Any anomaly the Blind Verifier saw confirmed **any** finding, so a dent could verify a shortage. Confirmation is now claim-specific:
  - quantity needs the independent unit count to agree;
  - SKU/variant need the detected text visible and the ordered text absent;
  - damage needs the same damage type;
  - a missing part needs an empty slot.
- ACCEPT relied on the Prosecutor alone. It now also needs Prosecutor confidence ≥ 0.75, a Defender that does not dispute it, and the Blind Verifier's independent count to agree.
- Kit components were never verified. A new `components_determinable` flag means a kit the photo cannot show is UNCERTAIN.
- Prosecutor findings that contradicted its own summary were dropped. They are now surfaced as UNCERTAIN.
- Scenario-only wording ("slot #3", "glare", "Space Gray / 64GB") appeared in real-photo claims and was fed to the Defender.
- Timed-out model calls kept running and billing in the background. Each call now has its own AbortController.
- The prompts now state that text printed on boxes or in PO fields is data, never instructions (prompt-injection hardening).

### Server and security (`server/server.js`, `server/security.js`, `server/cropEngine.js`)
- The base64 upload path skipped all type and size checks, and undecodable files were passed on raw with their EXIF/GPS data. Both paths are validated now, and the real format is checked from the bytes.
- Malformed `expectedComponents`, or impossible quantities (−3, 2.5), crashed the server (500) or were accepted. Both are now 400.
- Body-less POSTs crashed (500).
- The report cache grew without limit (now capped at 200), and inspection IDs could collide.
- A crop near the image edge crashed the whole inspection. Annotation labels always read "C1: DEFECT".

### Records (`src/services/comparisonEngine.ts`, `src/services/inspectionRecord.ts`)
- An UNCERTAIN report could be saved as a **MATCHED** record. Any challenged finding now keeps the record UNCERTAIN, routed to supervisor review.
- NaN, negative or fractional counts were classified as MATCHED.

---

## 3. Round 2: uploads, real-time agent, honest data, redesign

### Why real uploads "did not work"
1. **One phone photo produced a 185 MB response.** The image was re-encoded as full-resolution PNG and embedded again and again (annotated image, every crop, every graph node). The browser choked on it. Now the working copy is a JPEG capped at 2048 px, and the duplicates are gone: **~1.7 MB**, about 8× faster to process.
2. **No `ANTHROPIC_API_KEY` is configured.** Without it, no model can look at the photo, so the result is honestly UNCERTAIN. The header now shows the real engine state ("Vision: No vision model" or the model name).

### Real-time agent
- The server streams live events (`?stream=1`, NDJSON) as each role starts and finishes, with real timings.
- The Defender now runs **at the same time** as the Blind Verifier, which lowers latency. The Blind Verifier uses lower effort (a simple description task).
- The client can cancel a run, and cancelling also stops the model calls on the server.

### Fake information removed
- The upload form was pre-filled with a demo order ("MetaOptics Global Ltd…"). It now starts empty.
- The server invented `'Standard'` for an empty variant, which could flag false variant mismatches. It also invented `'Vendor Unknown'`, `'General Receiving Item'` and `'SKU-UNKNOWN'`, a generated PO number, and `'N/A'` as the vendor. Empty now stays empty, and SKU is required (400).
- Records had a hard-coded fake ASIN (`B0DEBATE01`).
- **Manual receipts claimed "3 photos attached"** and wrote made-up photo paths into the tamper-evident record. Now they have no photo references and the UI says so.
- Removed the fake "Bay 03 / station" labels.
- Scripted test scenarios are labelled "Scripted fixture · no model call" and never claim a model or crop check ran.

### New UI ("QC inspection sheet" theme)
- **Theme:** warm paper with ink type, hairline rules and monospaced data (Archivo + JetBrains Mono). Ink is the brand colour and scanner-blue marks anything live.
- **Verdict colours:** green ACCEPT, red EXCEPTION, hazard-stripe UNCERTAIN.
- **Live run board:** three lanes (Prosecutor, Defender, Blind Verifier), driven only by real server events. A role that never ran says "Not run". Includes an event tape with server timings.
- **Photo stage:** a scan line sweeps while the Prosecutor works, then finding regions appear and settle into their verdict colour. Clicking a region opens its evidence.
- **Blind Verifier patches:** shown as cut-outs of the exact regions it inspected.
- **Verdict stamp:** the verdict lands as a rubber stamp.
- **Accessibility and whole-app consistency:** honours reduced-motion settings, and about 230 hard-coded dark colours across all pages were mapped to theme tokens, so every page matches.

---

## 4. Files

| Area | Files |
|---|---|
| Agent / server | `server/debateEngine.js`, `server/visionProvider.js`, `server/server.js`, `server/security.js`, `server/cropEngine.js` |
| Client logic | `src/services/comparisonEngine.ts`, `src/services/inspectionRecord.ts`, `src/services/inspectionStream.ts` (new) |
| UI | `src/index.css` (rewritten), `src/views/DebateWorkspaceView.tsx` (rewritten), `src/components/LiveRun.tsx` (new), `src/components/PhotoStage.tsx` (new), `src/components/Navbar.tsx`, `src/components/StructuredReportView.tsx`, `src/components/EvidenceGraph.tsx`, `src/components/ReceivingForm.tsx`, `src/views/TerminalView.tsx`, `src/components/ui.tsx`, `index.html`, plus token-only colour changes in 11 view/component files |
| Removed | `src/components/POEditorPanel.tsx`, `src/components/VisualEvidenceViewer.tsx` (replaced) |
| Tests | `tests/agentRegressions.test.ts`, `tests/streamingAndPayload.test.ts`, `tests/liveRunReducer.test.ts` (new); small updates to `visionFailOpen`, `prdDebateEngine` |
| Docs | `ARCHITECTURE.md`, `README.md`, `submissions/harishbugatha/README.md`, `CHANGES.md` (this file) |

## 5. Known limits (not changed)
- **API key needed:** a real vision result requires `ANTHROPIC_API_KEY` on the server.
- **Model calls per photo:** the Blind Verifier makes one call per finding (isolation by design), so a photo costs 2 + N model calls. RULES.md asks for one call per unit.
- **Accuracy unmeasured:** real-photo accuracy has not been measured; there is no labelled photo set yet.
- **Access control:** organisation scope comes from a request header (no login); CORS is open; there is no rate limit.
