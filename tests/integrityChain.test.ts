import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { sha256Hex, canonicalJson } from '../src/services/sha256';
import { generateContentHash, CONTENT_HASH_PREFIX } from '../src/services/comparisonEngine';
import {
  initializeData,
  getRecordsByTenant,
  getAuditChain,
  addReceivingRecord,
  applyOperatorOverride,
  verifyIntegrity,
  computeEntryHash,
  GENESIS_HASH,
} from '../src/services/dataService';
import { ReceivingRecord } from '../src/types/receiving';

const nodeSha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('SHA-256 content hashing', () => {
  it('sha256Hex matches Node crypto (empty, block boundaries, multi-block, non-ASCII)', () => {
    const inputs = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(1000), 'Prüfung — 受信 ✓ 📦'];
    inputs.forEach((s) => expect(sha256Hex(s)).toBe(nodeSha256(s)));
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('record content hash = prefix + SHA-256 of canonical JSON, independent of key order', () => {
    const a = { poNumber: 'PO-1', qtyReceived: 9, qualityFlags: ['missing_components'], nested: { b: 1, a: 2 } };
    const b = { nested: { a: 2, b: 1 }, qualityFlags: ['missing_components'], qtyReceived: 9, poNumber: 'PO-1' };
    const hash = generateContentHash(a);
    expect(hash).toMatch(new RegExp(`^${CONTENT_HASH_PREFIX}[0-9a-f]{64}$`));
    expect(hash).toBe(generateContentHash(b));
    expect(hash).toBe(CONTENT_HASH_PREFIX + nodeSha256(canonicalJson(a)));
  });

  it('is deterministic over time and excludes its own contentHash field', async () => {
    const rec = { recordId: 'RCV-X', qtyReceived: 9, capturedAt: '2026-10-06T10:00:00.000Z' };
    const h1 = generateContentHash(rec);
    await new Promise((r) => setTimeout(r, 15));
    expect(generateContentHash(rec)).toBe(h1);
    expect(generateContentHash({ ...rec, contentHash: 'anything' })).toBe(h1);
  });

  it('any content change produces a different hash', () => {
    const base = { recordId: 'RCV-X', qtyReceived: 9, qualityFlags: ['missing_components'], status: 'QUALITY_DISCREPANCY' };
    const h = generateContentHash(base);
    expect(generateContentHash({ ...base, qtyReceived: 12 })).not.toBe(h);
    expect(generateContentHash({ ...base, qualityFlags: [] })).not.toBe(h);
    expect(generateContentHash({ ...base, status: 'MATCHED' })).not.toBe(h);
  });

  it('seeded records carry real SHA-256 content hashes of their stored content', () => {
    initializeData();
    const records = getRecordsByTenant('org_demo_alpha');
    expect(records.length).toBeGreaterThan(0);
    records.forEach((r) => {
      expect(r.contentHash).toMatch(/^sha256-01rcv-[0-9a-f]{64}$/);
      expect(r.contentHash).toBe(generateContentHash(r));
    });
  });
});

describe('Audit hash chain & integrity verification', () => {
  it('each tenant chain is linked from genesis and verifies cleanly after seeding', () => {
    initializeData();
    for (const org of ['org_demo_alpha', 'org_demo_bravo'] as const) {
      const chain = getAuditChain(org);
      expect(chain.length).toBe(getRecordsByTenant(org).length);
      expect(chain[0].prevHash).toBe(GENESIS_HASH);
      chain.forEach((entry, i) => {
        expect(entry.index).toBe(i);
        expect(entry.orgId).toBe(org);
        if (i > 0) expect(entry.prevHash).toBe(chain[i - 1].entryHash);
        expect(entry.entryHash).toBe(computeEntryHash(entry));
      });
      const report = verifyIntegrity(org);
      expect(report.ok).toBe(true);
      expect(report.failures).toEqual([]);
      expect(report.headHash).toBe(chain[chain.length - 1].entryHash);
    }
  });

  it('new records and overrides are appended to the chain; caller-supplied hashes are replaced', () => {
    initializeData();
    const before = getAuditChain('org_demo_alpha').length;
    const template = getRecordsByTenant('org_demo_alpha')[0];
    const created = addReceivingRecord('org_demo_alpha', {
      ...template,
      recordId: 'RCV-CHAIN-TEST',
      qtyReceived: 1,
      contentHash: 'sha256-01rcv-forged',
    } as ReceivingRecord);
    expect(created.contentHash).toBe(generateContentHash(created));
    let chain = getAuditChain('org_demo_alpha');
    expect(chain.length).toBe(before + 1);
    expect(chain[chain.length - 1]).toMatchObject({ eventType: 'RECORD_CREATED', recordId: 'RCV-CHAIN-TEST', contentHash: created.contentHash });

    const override = {
      originalStatus: created.status,
      newStatus: 'DAMAGED' as const,
      reason: 'Integrity test override with justification',
      operatorId: 'supervisor_test',
      timestamp: '2026-10-06T11:00:00.000Z',
    };
    const overridden = applyOperatorOverride('org_demo_alpha', 'RCV-CHAIN-TEST', override)!;
    chain = getAuditChain('org_demo_alpha');
    const last = chain[chain.length - 1];
    expect(last.eventType).toBe('OPERATOR_OVERRIDE');
    expect(last.override).toMatchObject({ originalStatus: override.originalStatus, newStatus: 'DAMAGED', reason: override.reason });
    expect(last.contentHash).toBe(overridden.contentHash);
    expect(last.prevHash).toBe(chain[chain.length - 2].entryHash);
    expect(verifyIntegrity('org_demo_alpha').ok).toBe(true);
  });

  it('modifying an earlier record outside the API fails integrity verification', () => {
    initializeData();
    const records = getRecordsByTenant('org_demo_alpha');
    const target = records[records.length - 1]; // oldest seeded record
    const original = target.qtyReceived;

    target.qtyReceived = original + 5; // silent edit, no re-hash, no chain entry
    const report = verifyIntegrity('org_demo_alpha');
    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual(expect.objectContaining({ kind: 'RECORD_CONTENT_MISMATCH', recordId: target.recordId }));
    // Other tenants are unaffected
    expect(verifyIntegrity('org_demo_bravo').ok).toBe(true);

    target.qtyReceived = original;
    expect(verifyIntegrity('org_demo_alpha').ok).toBe(true);
  });

  it('re-hashing a tampered record does not help: the chain still holds the original hash', () => {
    initializeData();
    const target = getRecordsByTenant('org_demo_alpha')[5];
    const snapshot = { status: target.status, contentHash: target.contentHash };

    target.status = 'MATCHED';
    target.contentHash = generateContentHash(target); // attacker recomputes the record hash
    const report = verifyIntegrity('org_demo_alpha');
    expect(report.ok).toBe(false);
    expect(report.failures.some((f) => f.kind === 'RECORD_CONTENT_MISMATCH' && f.recordId === target.recordId)).toBe(true);

    Object.assign(target, snapshot);
    expect(verifyIntegrity('org_demo_alpha').ok).toBe(true);
  });

  it('editing an earlier chain entry breaks its hash, and re-hashing it breaks the next link', () => {
    initializeData();
    const chain = getAuditChain('org_demo_alpha');
    const entry = chain[2];
    const original = { contentHash: entry.contentHash, entryHash: entry.entryHash };

    entry.contentHash = 'sha256-01rcv-' + '0'.repeat(64);
    let report = verifyIntegrity('org_demo_alpha');
    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual(expect.objectContaining({ kind: 'ENTRY_HASH_MISMATCH', index: 2 }));

    entry.entryHash = computeEntryHash(entry); // attacker re-hashes the edited entry
    report = verifyIntegrity('org_demo_alpha');
    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual(expect.objectContaining({ kind: 'BROKEN_LINK', index: 3 }));

    Object.assign(entry, original);
    expect(verifyIntegrity('org_demo_alpha').ok).toBe(true);
  });
});
