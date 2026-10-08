import { ClaimStatus, DebateInspectionReport, ObservedFeatures, PRDVerdict } from '../types/receiving';

/*
 * Client for the server's live inspection stream (`?stream=1`, NDJSON, one event per line).
 * Every event carries `t` = ms since the server received the request. The stream ends with
 * exactly one terminal line: `report` or `error`. Validation errors arrive as plain JSON (400).
 */

export type StageStatus = 'started' | 'done' | 'failed';
export type RunMode = 'VISION_MODEL' | 'SCENARIO_FIXTURE' | 'NONE';

export interface StreamClaim {
  claimId: string;
  claimType: string;
  claimTitle: string;
  bbox: [number, number, number, number];
}

export type InspectionEvent =
  | { type: 'stage'; stage: 'PREPROCESS'; status: StageStatus; t: number; imageSha256?: string; width?: number; height?: number }
  | {
      type: 'stage'; stage: 'PROSECUTOR'; status: StageStatus; t: number; mode?: RunMode;
      observedFeatures?: ObservedFeatures; claims?: StreamClaim[]; reason?: string;
    }
  | {
      type: 'stage'; stage: 'DEFENDER'; status: StageStatus; t: number;
      responses?: { claimId: string; stance: string; plausibility: number }[]; reason?: string;
    }
  | {
      type: 'stage'; stage: 'BLIND_VERIFIER'; status: StageStatus; t: number; claimId: string;
      anomaly?: 'YES' | 'NO' | 'UNCLEAR' | null; confidence?: number; confirmsClaim?: boolean | null; reason?: string;
    }
  | { type: 'stage'; stage: 'REPORT'; status: StageStatus; t: number; finalVerdict?: PRDVerdict }
  | { type: 'claim'; t: number; claimId: string; status: ClaimStatus; rationale: string }
  | { type: 'report'; t: number; report: DebateInspectionReport }
  | { type: 'error'; t: number; error: string };

export class InspectionRequestError extends Error {}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || `Server returned status ${res.status}.`;
  } catch {
    if (res.status === 502 || res.status === 504) {
      return 'The inspection server is not reachable. Start it with "node server/server.js" (port 3001).';
    }
    return `Server returned status ${res.status}.`;
  }
}

/**
 * POST an inspection and stream its events. Resolves with the final report; rejects with an
 * InspectionRequestError carrying a user-readable message (or an AbortError when cancelled).
 */
export async function streamInspection(
  url: string,
  init: RequestInit,
  onEvent: (event: InspectionEvent) => void,
  signal?: AbortSignal
): Promise<DebateInspectionReport> {
  const sep = url.includes('?') ? '&' : '?';
  let res: Response;
  try {
    res = await fetch(`${url}${sep}stream=1`, { ...init, signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new InspectionRequestError('Could not reach the inspection server. Check that it is running on port 3001.');
  }
  if (!res.ok) throw new InspectionRequestError(await readError(res));

  // A server without streaming (or a proxy that buffered it) answers with one JSON body
  if (!(res.headers.get('content-type') || '').includes('ndjson') || !res.body) {
    const data = await res.json();
    if (!data?.report) throw new InspectionRequestError(data?.error || 'The server returned no report.');
    return data.report as DebateInspectionReport;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let report: DebateInspectionReport | null = null;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let event: InspectionEvent;
    try {
      event = JSON.parse(line);
    } catch {
      return; // ignore a malformed line rather than abort the whole run
    }
    if (event.type === 'error') throw new InspectionRequestError(event.error);
    if (event.type === 'report') report = event.report;
    onEvent(event);
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    handleLine(buffer + decoder.decode());
  } finally {
    // Release the connection whether the stream ended, errored or a handler threw
    reader.cancel().catch(() => undefined);
  }

  if (!report) throw new InspectionRequestError('The inspection stream ended without a result.');
  return report;
}
