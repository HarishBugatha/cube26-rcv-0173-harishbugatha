import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const app = require('../server/server.js');

let server: Server;
let base: string;
let alphaReportId: string;

const ALPHA = { 'X-Org-Id': 'org_demo_alpha' };
const BRAVO = { 'X-Org-Id': 'org_demo_bravo' };

async function verifyScenario(headers: Record<string, string>) {
  return fetch(`${base}/api/verify/scenario/scenario-1-correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({}),
  });
}

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const res = await verifyScenario(ALPHA);
  expect(res.status).toBe(200);
  alphaReportId = (await res.json()).report.inspectionId;
});

afterAll(() => {
  server?.close();
});

describe('Report cache tenant isolation (Rule 1)', () => {
  it('tenant A can access its own report (JSON and HTML)', async () => {
    const json = await fetch(`${base}/api/report/${alphaReportId}`, { headers: ALPHA });
    expect(json.status).toBe(200);
    const body = await json.json();
    expect(body.inspectionId).toBe(alphaReportId);
    expect(body.orgId).toBe('org_demo_alpha');

    const html = await fetch(`${base}/api/report/${alphaReportId}?format=html&org=org_demo_alpha`);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain(alphaReportId);
  });

  it('tenant B cannot access tenant A\'s report, and learns nothing from the error', async () => {
    const res = await fetch(`${base}/api/report/${alphaReportId}`, { headers: BRAVO });
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ success: false, error: 'Report not found.' });
    for (const leak of [alphaReportId, 'debatedClaims', 'poNumber', 'sha256', 'org_demo_alpha']) {
      expect(text).not.toContain(leak);
    }
    // Same response as an ID that does not exist (no existence oracle)
    const unknown = await fetch(`${base}/api/report/INSP-DOES-NOT-EXIST-1`, { headers: BRAVO });
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toBe(text);

    const html = await fetch(`${base}/api/report/${alphaReportId}?format=html&org=org_demo_bravo`);
    expect(html.status).toBe(404);
    expect(await html.text()).not.toContain(alphaReportId);
  });

  it('missing or invalid tenant identity cannot bypass the check', async () => {
    const attempts: [string, RequestInit][] = [
      [`${base}/api/report/${alphaReportId}`, {}],
      [`${base}/api/report/${alphaReportId}`, { headers: { 'X-Org-Id': '' } }],
      [`${base}/api/report/${alphaReportId}`, { headers: { 'X-Org-Id': 'org_evil' } }],
      [`${base}/api/report/${alphaReportId}`, { headers: { 'X-Org-Id': 'ORG_DEMO_ALPHA' } }],
      [`${base}/api/report/${alphaReportId}?org=*`, {}],
      [`${base}/api/report/${alphaReportId}?format=html`, {}],
    ];
    for (const [url, init] of attempts) {
      const res = await fetch(url, init);
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).not.toContain(alphaReportId);
      expect(text).not.toContain('debatedClaims');
    }
  });

  it('verification requests also require a valid organisation', async () => {
    expect((await verifyScenario({})).status).toBe(400);
    expect((await verifyScenario({ 'X-Org-Id': 'org_evil' })).status).toBe(400);
    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'x.png');
    const upload = await fetch(`${base}/api/verify/custom`, { method: 'POST', body: form });
    expect(upload.status).toBe(400);
  });
});

describe('Upload route fails open (Rule 3)', () => {
  async function uploadWith(provider: any) {
    app.locals.visionProvider = provider;
    const png = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#777777' } }).png().toBuffer();
    const form = new FormData();
    form.append('photo', new Blob([png], { type: 'image/png' }), 'dock.png');
    form.append('poNumber', 'PO-FAIL-1');
    form.append('expectedSku', 'SKU-X');
    form.append('expectedQuantity', '2');
    const res = await fetch(`${base}/api/verify/custom`, { method: 'POST', headers: ALPHA, body: form });
    return { status: res.status, body: await res.json() };
  }

  it('no vision model configured → 200, UNCERTAIN, INCOMPLETE', async () => {
    const { status, body } = await uploadWith(null);
    expect(status).toBe(200);
    expect(body.report.finalVerdict).toBe('UNCERTAIN');
    expect(body.report.verification).toMatchObject({ status: 'INCOMPLETE', mode: 'NONE' });
  });

  it('pipeline timeout → still 200 with an UNCERTAIN, INCOMPLETE report carrying the reason', async () => {
    process.env.VISION_PIPELINE_TIMEOUT_MS = '100';
    const hanging = { model: 'stub', blindVerifierTask: 'x', prosecute: () => new Promise(() => {}), defend: async () => ({}), blindVerify: async () => ({}) };
    try {
      const { status, body } = await uploadWith(hanging);
      expect(status).toBe(200);
      expect(body.report.finalVerdict).toBe('UNCERTAIN');
      expect(body.report.verification.status).toBe('INCOMPLETE');
      expect(body.report.verification.reasons[0]).toMatchObject({ stage: 'PIPELINE', kind: 'TIMEOUT' });
      expect(body.report.verification.reasons[0].reason).toMatch(/timed out/);
      // The fail-open report is cached for its owner only
      const own = await fetch(`${base}/api/report/${body.report.inspectionId}`, { headers: ALPHA });
      expect(own.status).toBe(200);
      const other = await fetch(`${base}/api/report/${body.report.inspectionId}`, { headers: BRAVO });
      expect(other.status).toBe(404);
    } finally {
      delete process.env.VISION_PIPELINE_TIMEOUT_MS;
      app.locals.visionProvider = null;
    }
  });
});
