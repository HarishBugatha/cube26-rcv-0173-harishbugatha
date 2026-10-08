import React, { useEffect, useRef, useState } from 'react';
import { Gavel, Shield, EyeOff, Check, X, Minus } from 'lucide-react';
import { ClaimStatus, ObservedFeatures, PRDVerdict } from '../types/receiving';
import { InspectionEvent, RunMode, StreamClaim } from '../services/inspectionStream';

/* =============================================================
   Run state: built only from server events — nothing is simulated.
   A role that never sends an event is shown as "not run".
   ============================================================= */

export type LaneStatus = 'idle' | 'active' | 'done' | 'failed' | 'skipped';

export interface BlindItem {
  status: 'active' | 'done' | 'failed';
  anomaly?: 'YES' | 'NO' | 'UNCLEAR' | null;
  confidence?: number;
  confirmsClaim?: boolean | null;
  reason?: string;
}

export interface TapeEntry { t: number; who: string; msg: string; bad?: boolean }

export interface RunState {
  phase: 'idle' | 'running' | 'finished' | 'error';
  startedAt: number;
  serverMs?: number;
  mode?: RunMode;
  tape: TapeEntry[];
  prosecutor: { status: LaneStatus; reason?: string; claims: StreamClaim[]; observed?: ObservedFeatures };
  defender: { status: LaneStatus; reason?: string; responses: { claimId: string; stance: string; plausibility: number }[] };
  blind: Record<string, BlindItem>;
  claims: Record<string, { status: ClaimStatus; rationale: string }>;
  verdict?: PRDVerdict;
  error?: string;
}

export const initialRun: RunState = {
  phase: 'idle',
  startedAt: 0,
  tape: [],
  prosecutor: { status: 'idle', claims: [] },
  defender: { status: 'idle', responses: [] },
  blind: {},
  claims: {},
};

export type RunAction =
  | { type: 'reset' }
  | { type: 'start' }
  | { type: 'finish' }
  | { type: 'event'; event: InspectionEvent }
  | { type: 'error'; message: string };

const pct = (n?: number) => (typeof n === 'number' ? `${Math.round(n * 100)}%` : '—');

function observedSummary(o?: ObservedFeatures): string {
  if (!o || o.source === 'NONE') return 'nothing observed';
  const parts = [
    o.itemsDetected === null ? 'count not determinable' : `${o.itemsDetected} unit${o.itemsDetected === 1 ? '' : 's'}`,
    o.detectedSku === null ? 'label unreadable' : `label "${o.detectedSku}"`,
    o.packagingStatus === null ? 'packaging unclear' : `packaging ${String(o.packagingStatus).toLowerCase().replace(/_/g, ' ')}`,
  ];
  return parts.join(' · ');
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'reset':
      return initialRun;
    case 'start':
      return { ...initialRun, phase: 'running', startedAt: performance.now() };
    case 'finish':
      // Also covers a server that answered without streaming (no events at all)
      return state.phase === 'running'
        ? { ...state, phase: 'finished', serverMs: state.serverMs ?? performance.now() - state.startedAt }
        : state;
    case 'error':
      return {
        ...state,
        phase: 'error',
        error: action.message,
        tape: [...state.tape, { t: state.serverMs ?? 0, who: 'ERROR', msg: action.message, bad: true }],
      };
    case 'event':
      break;
  }

  const e = action.event;
  const s: RunState = { ...state, serverMs: e.t, tape: state.tape };
  const log = (who: string, msg: string, bad = false) => { s.tape = [...s.tape, { t: e.t, who, msg, bad }]; };

  if (e.type === 'claim') {
    s.claims = { ...state.claims, [e.claimId]: { status: e.status, rationale: e.rationale } };
    log('CLASSIFY', `${e.claimId} → ${e.status}`);
    return s;
  }
  if (e.type === 'report') {
    s.phase = 'finished';
    return s;
  }
  if (e.type === 'error') return s;

  switch (e.stage) {
    case 'PREPROCESS':
      if (e.status === 'started') log('PREPROCESS', 'Stripping EXIF/GPS and hashing the photo');
      else log('PREPROCESS', `Working copy ${e.width ?? '?'}×${e.height ?? '?'} px · sha256 ${(e.imageSha256 || '').slice(0, 12)}…`);
      break;
    case 'PROSECUTOR':
      s.mode = e.mode ?? state.mode;
      if (e.status === 'started') {
        s.prosecutor = { ...state.prosecutor, status: 'active' };
        log('PROSECUTOR', e.mode === 'SCENARIO_FIXTURE' ? 'Scripted fixture: replaying recorded observations' : 'Comparing the photo with the purchase order');
      } else if (e.status === 'done') {
        s.prosecutor = { status: 'done', claims: e.claims || [], observed: e.observedFeatures };
        log('PROSECUTOR', `Observed ${observedSummary(e.observedFeatures)} · raised ${(e.claims || []).length} finding(s)`);
      } else {
        s.prosecutor = { ...state.prosecutor, status: 'failed', reason: e.reason };
        log('PROSECUTOR', e.reason || 'Failed', true);
      }
      break;
    case 'DEFENDER':
      if (e.status === 'started') {
        s.defender = { ...state.defender, status: 'active' };
        log('DEFENDER', 'Looking for innocent explanations for each finding');
      } else if (e.status === 'done') {
        const responses = e.responses || [];
        s.defender = { status: 'done', responses };
        const challenges = responses.filter((r) => r.stance === 'VALID_CHALLENGE').length;
        log('DEFENDER', `Answered ${responses.length} finding(s) · ${challenges} valid challenge(s)`);
      } else {
        s.defender = { ...state.defender, status: 'failed', reason: e.reason };
        log('DEFENDER', e.reason || 'Failed', true);
      }
      break;
    case 'BLIND_VERIFIER': {
      const prev = state.blind[e.claimId];
      if (e.status === 'started') {
        s.blind = { ...state.blind, [e.claimId]: { status: 'active' } };
        log('BLIND_VERIFIER', state.mode === 'SCENARIO_FIXTURE'
          ? `${e.claimId}: replaying the scripted crop observation`
          : `${e.claimId}: inspecting an isolated crop (no order, no claim text)`);
      } else if (e.status === 'done') {
        s.blind = { ...state.blind, [e.claimId]: { ...prev, status: 'done', anomaly: e.anomaly, confidence: e.confidence, confirmsClaim: e.confirmsClaim } };
        const saw = e.anomaly ? `anomaly ${e.anomaly}` : 'scripted observation';
        const support = e.confirmsClaim === true ? ' · supports finding' : e.confirmsClaim === false ? ' · does not support finding' : '';
        log('BLIND_VERIFIER', `${e.claimId}: ${saw}, confidence ${pct(e.confidence)}${support}`);
      } else {
        s.blind = { ...state.blind, [e.claimId]: { ...prev, status: 'failed', reason: e.reason } };
        log('BLIND_VERIFIER', `${e.claimId}: ${e.reason || 'failed'}`, true);
      }
      break;
    }
    case 'REPORT':
      s.verdict = e.finalVerdict;
      // Roles that never reported were not run (e.g. the Prosecutor failed first)
      if (state.prosecutor.status === 'idle') s.prosecutor = { ...state.prosecutor, status: 'skipped' };
      if (state.defender.status === 'idle') s.defender = { ...state.defender, status: 'skipped' };
      log('REPORT', `Verdict ${e.finalVerdict}`);
      break;
  }
  return s;
}

/* =============================================================
   Presentation
   ============================================================= */

interface LiveRunProps {
  run: RunState;
  photoUrl?: string;
  naturalSize?: { w: number; h: number };
}

const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

/** Region of the photo shown as a cut-out, positioned with CSS from the real bbox. */
const PatchPreview: React.FC<{ photoUrl?: string; bbox?: number[]; size?: { w: number; h: number } }> = ({ photoUrl, bbox, size }) => {
  if (!photoUrl || !bbox || !size) return <div className="patch-ph" />;
  const [ymin, xmin, ymax, xmax] = bbox;
  const rw = Math.max(1, (xmax - xmin) * size.w);
  const rh = Math.max(1, (ymax - ymin) * size.h);
  const W = 66;
  const H = 52;
  const scale = Math.max(W / rw, H / rh);
  return (
    <div
      style={{
        width: '100%',
        height: H,
        backgroundColor: '#1c1c20',
        backgroundImage: `url("${photoUrl}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${size.w * scale}px ${size.h * scale}px`,
        backgroundPosition: `${-(xmin * size.w * scale) + (W - rw * scale) / 2}px ${-(ymin * size.h * scale) + (H - rh * scale) / 2}px`,
      }}
    />
  );
};

const StateLine: React.FC<{ status: LaneStatus; active: string; done: React.ReactNode; failed?: string; idle?: string }> = ({
  status, active, done, failed, idle = 'Waiting',
}) => {
  if (status === 'active') return <div className="lane-state"><span className="dots">{active}</span></div>;
  if (status === 'done') return <div className="lane-state"><Check size={13} className="tick" /> {done}</div>;
  if (status === 'failed') return <div className="lane-state"><X size={13} className="cross" /> {failed || 'Failed'}</div>;
  if (status === 'skipped') return <div className="lane-state"><Minus size={13} /> Not run</div>;
  return <div className="lane-state">{idle}</div>;
};

export const LiveRun: React.FC<LiveRunProps> = ({ run, photoUrl, naturalSize }) => {
  const [now, setNow] = useState(() => performance.now());
  const tapeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (run.phase !== 'running') return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [run.phase]);

  useEffect(() => {
    tapeRef.current?.scrollTo({ top: tapeRef.current.scrollHeight, behavior: 'smooth' });
  }, [run.tape.length]);

  if (run.phase === 'idle') return null;

  const elapsed = Math.max(0, run.phase === 'running' ? now - run.startedAt : run.serverMs ?? now - run.startedAt);
  const blindIds = Object.keys(run.blind);
  const blindItems = blindIds.map((id) => run.blind[id]);
  const blindStatus: LaneStatus =
    blindItems.some((b) => b.status === 'active') ? 'active'
      : blindItems.length && blindItems.every((b) => b.status === 'failed') ? 'failed'
      : blindItems.length ? 'done'
      : run.phase === 'finished' || run.phase === 'error' ? 'skipped'
      : 'idle';
  const claimBox = (id: string) => run.prosecutor.claims.find((c) => c.claimId === id)?.bbox;
  const scripted = run.mode === 'SCENARIO_FIXTURE';

  return (
    <section className="run-board fade-in" aria-label="Live inspection run">
      <div className="run-board-head">
        <div className="row" style={{ gap: 10 }}>
          <div className="panel-title">
            {run.phase === 'running' && <span className="live-dot" aria-hidden="true" />}
            {run.phase === 'running' ? 'Inspection running' : run.phase === 'error' ? 'Inspection failed' : 'Inspection run'}
          </div>
          {run.mode === 'VISION_MODEL' && <span className="pill pill-info">Live vision model</span>}
          {scripted && <span className="pill pill-neutral">Scripted fixture · no model call</span>}
          {run.mode === 'NONE' && <span className="pill pill-warn">No vision model</span>}
        </div>
        <div className="run-clock" aria-hidden="true">
          {run.phase === 'running' ? 'elapsed ' : 'took '}
          <strong>{fmtMs(elapsed)}</strong>
        </div>
      </div>

      <div className="lanes">
        <div className={`lane prosecutor ${run.prosecutor.status}`}>
          <div className="lane-head">
            <span className="lane-badge"><Gavel size={16} /></span>
            <div>
              <div className="lane-name">Prosecutor</div>
              <div className="lane-role">Photo + purchase order · lists every difference</div>
            </div>
          </div>
          <StateLine
            status={run.prosecutor.status}
            active="Inspecting photo"
            done={`${run.prosecutor.claims.length} finding(s)`}
            failed={run.prosecutor.reason}
          />
          {run.prosecutor.status === 'done' && (
            <div className="lane-detail">
              <div className="lane-line">{observedSummary(run.prosecutor.observed)}</div>
              {run.prosecutor.claims.slice(0, 5).map((c) => (
                <div className="lane-line" key={c.claimId}><strong className="mono">{c.claimId}</strong> {c.claimTitle}</div>
              ))}
            </div>
          )}
          <div className="lane-progress" />
        </div>

        <div className={`lane defender ${run.defender.status}`}>
          <div className="lane-head">
            <span className="lane-badge"><Shield size={16} /></span>
            <div>
              <div className="lane-name">Defender</div>
              <div className="lane-role">Photo + findings · argues innocent explanations</div>
            </div>
          </div>
          <StateLine
            status={run.defender.status}
            active="Testing each finding"
            done={`${run.defender.responses.length} response(s)`}
            failed={run.defender.reason}
          />
          {run.defender.status === 'done' && (
            <div className="lane-detail">
              {run.defender.responses.slice(0, 5).map((r) => (
                <div className="lane-line" key={r.claimId}>
                  <strong className="mono">{r.claimId}</strong> {r.stance.replace(/_/g, ' ').toLowerCase()}
                  {typeof r.plausibility === 'number' && <span className="dim"> · {pct(r.plausibility)}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="lane-progress" />
        </div>

        <div className={`lane blind ${blindStatus}`}>
          <div className="lane-head">
            <span className="lane-badge"><EyeOff size={16} /></span>
            <div>
              <div className="lane-name">Blind verifier</div>
              <div className="lane-role">One cropped patch only · no order, no claims</div>
            </div>
          </div>
          <StateLine
            status={blindStatus}
            active={scripted
              ? 'Replaying scripted observations'
              : `Checking ${blindItems.filter((b) => b.status === 'active').length} isolated crop(s)`}
            done={`${blindItems.filter((b) => b.status === 'done').length} of ${blindItems.length} crop(s) checked`}
            failed="All crop checks failed"
          />
          {blindIds.length > 0 && (
            <div className="patches">
              {blindIds.map((id) => {
                const b = run.blind[id];
                const cls = b.status === 'active' ? 'working'
                  : b.status === 'failed' ? 'c-fail'
                  : b.confirmsClaim === true ? 'c-yes'
                  : b.confirmsClaim === false ? 'c-no'
                  : 'c-unk';
                return (
                  <div key={id} className={`patch ${cls}`} title={b.reason || `${id}: ${b.anomaly ?? 'scripted'} ${pct(b.confidence)}`}>
                    <PatchPreview photoUrl={photoUrl} bbox={claimBox(id)} size={naturalSize} />
                    <div className="patch-id">
                      <span>{id.replace('CLM-', '')}</span>
                      <span>{b.status === 'done' ? pct(b.confidence) : b.status === 'failed' ? 'err' : '…'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="lane-progress" />
        </div>
      </div>

      <div className="tape" ref={tapeRef} role="log" aria-label="Event log">
        {run.tape.map((line, i) => (
          <div key={i} className={`tape-line ${line.bad ? 'bad' : ''}`}>
            <span className="t">+{fmtMs(line.t)}</span>
            <span className={`who ${line.who}`}>{line.who.replace('_', ' ')}</span>
            <span className="msg">{line.msg}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default LiveRun;
