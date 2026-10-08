import { describe, it, expect } from 'vitest';
import { runReducer, initialRun, RunState } from '../src/components/LiveRun';
import { InspectionEvent } from '../src/services/inspectionStream';

/** Feeds a real-shaped event sequence through the UI reducer (what the live board renders from). */
const play = (events: InspectionEvent[]): RunState =>
  events.reduce((s, event) => runReducer(s, { type: 'event', event }), runReducer(initialRun, { type: 'start' }));

const claim = (id: string) => ({ claimId: id, claimType: 'QUANTITY_SHORTAGE', claimTitle: 'Short', bbox: [0.1, 0.1, 0.5, 0.5] as [number, number, number, number] });

describe('Live run reducer', () => {
  it('a full vision run ends with every lane settled and the verdict set', () => {
    const s = play([
      { type: 'stage', stage: 'PREPROCESS', status: 'started', t: 1 },
      { type: 'stage', stage: 'PROSECUTOR', status: 'started', mode: 'VISION_MODEL', t: 5 },
      { type: 'stage', stage: 'PROSECUTOR', status: 'done', mode: 'VISION_MODEL', claims: [claim('CLM-QTY-01')], t: 900 },
      { type: 'stage', stage: 'DEFENDER', status: 'started', t: 901 },
      { type: 'stage', stage: 'BLIND_VERIFIER', status: 'started', claimId: 'CLM-QTY-01', t: 901 },
      { type: 'stage', stage: 'BLIND_VERIFIER', status: 'done', claimId: 'CLM-QTY-01', anomaly: 'YES', confidence: 0.9, confirmsClaim: true, t: 1500 },
      { type: 'stage', stage: 'DEFENDER', status: 'done', responses: [{ claimId: 'CLM-QTY-01', stance: 'CONCEDE_DEFECT', plausibility: 0.1 }], t: 1700 },
      { type: 'claim', claimId: 'CLM-QTY-01', status: 'VERIFIED', rationale: 'x', t: 1701 },
      { type: 'stage', stage: 'REPORT', status: 'done', finalVerdict: 'EXCEPTION', t: 1702 },
    ]);
    expect(s.prosecutor.status).toBe('done');
    expect(s.defender.status).toBe('done');
    expect(s.blind['CLM-QTY-01']).toMatchObject({ status: 'done', confirmsClaim: true });
    expect(s.claims['CLM-QTY-01'].status).toBe('VERIFIED');
    expect(s.verdict).toBe('EXCEPTION');
    expect(s.serverMs).toBe(1702);
  });

  it('roles that never ran are shown as not run, never as done', () => {
    const s = play([
      { type: 'stage', stage: 'PROSECUTOR', status: 'failed', mode: 'NONE', reason: 'No vision model is configured', t: 3 },
      { type: 'claim', claimId: 'CLM-VIS-00', status: 'CHALLENGED', rationale: 'x', t: 4 },
      { type: 'stage', stage: 'REPORT', status: 'done', finalVerdict: 'UNCERTAIN', t: 5 },
    ]);
    expect(s.prosecutor).toMatchObject({ status: 'failed', reason: 'No vision model is configured' });
    expect(s.defender.status).toBe('skipped');
    expect(Object.keys(s.blind)).toHaveLength(0);
  });

  it('a non-streaming answer (no events at all) still finishes the run', () => {
    const s = runReducer(runReducer(initialRun, { type: 'start' }), { type: 'finish' });
    expect(s.phase).toBe('finished');
  });
});
