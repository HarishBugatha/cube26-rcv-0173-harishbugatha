import rawCsv from '../../data/receiving_sample.csv?raw';
import {
  PurchaseOrderLine,
  ReceivingRecord,
  TenantId,
  DamageGrade,
  QualityFlag,
  OperatorOverride,
  AuditChainEntry,
  IntegrityFailure,
  IntegrityReport,
} from '../types/receiving';
import {
  compareShipment,
  generateContentHash,
} from './comparisonEngine';
import { sha256Hex, canonicalJson } from './sha256';

// Parse CSV with quotes handling
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// In-memory repositories per tenant
let recordsStore: ReceivingRecord[] = [];
let poLinesStore: PurchaseOrderLine[] = [];
let isInitialized = false;

// -------------------------------------------------------------
// Audit hash chain (append-only, one chain per tenant)
// -------------------------------------------------------------
export const GENESIS_HASH = '0'.repeat(64);
let auditChains: Record<TenantId, AuditChainEntry[]> = { org_demo_alpha: [], org_demo_bravo: [] };

export function computeEntryHash(entry: Omit<AuditChainEntry, 'entryHash'>): string {
  const { entryHash: _ignored, ...content } = entry as AuditChainEntry;
  return sha256Hex(canonicalJson(content));
}

function appendChainEntry(
  orgId: TenantId,
  eventType: AuditChainEntry['eventType'],
  record: ReceivingRecord,
  override?: OperatorOverride
): AuditChainEntry {
  const chain = auditChains[orgId] || (auditChains[orgId] = []);
  const prevHash = chain.length > 0 ? chain[chain.length - 1].entryHash : GENESIS_HASH;
  const base: Omit<AuditChainEntry, 'entryHash'> = {
    index: chain.length,
    orgId,
    eventType,
    recordId: record.recordId,
    contentHash: record.contentHash,
    prevHash,
    ...(override ? { override: { ...override } } : {}),
  };
  const entry: AuditChainEntry = { ...base, entryHash: computeEntryHash(base) };
  chain.push(entry);
  return entry;
}

/** Recomputes the record's SHA-256 content hash from its current content and stores it. */
function sealRecord(record: ReceivingRecord): ReceivingRecord {
  record.contentHash = generateContentHash(record);
  return record;
}

// -------------------------------------------------------------
// Persistence: records, PO lines and hash chains survive page reloads.
// The browser's localStorage is used when available; tests inject an adapter.
// Stored data is loaded exactly as found — it is never re-hashed, repaired or
// silently replaced, so tampering in storage surfaces in verifyIntegrity().
// -------------------------------------------------------------
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'rcv-manager:ledger:v1';

interface PersistedState {
  version: 1;
  records: ReceivingRecord[];
  poLines: PurchaseOrderLine[];
  auditChains: Record<TenantId, AuditChainEntry[]>;
}

function browserStorage(): StorageAdapter | null {
  if (typeof window === 'undefined') return null;
  try {
    const probe = '__rcv_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

let storage: StorageAdapter | null = browserStorage();
/** Set when stored data exists but cannot be read; saving is then blocked so the evidence is not overwritten. */
let storageError: string | null = null;

export function setStorageAdapter(adapter: StorageAdapter | null): void {
  storage = adapter;
}

function persist(): void {
  if (!storage || storageError) return;
  const state: PersistedState = { version: 1, records: recordsStore, poLines: poLinesStore, auditChains };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Receiving data could not be saved to storage:', err);
  }
}

/** Loads persisted state. Returns true when state was loaded or found unreadable (no seeding either way). */
function loadPersisted(): boolean {
  if (!storage) return false;
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
  if (raw === null) return false;

  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.records) ||
      !Array.isArray(parsed.poLines) ||
      !parsed.auditChains ||
      !Array.isArray(parsed.auditChains.org_demo_alpha) ||
      !Array.isArray(parsed.auditChains.org_demo_bravo)
    ) {
      throw new Error('unexpected structure');
    }
    recordsStore = parsed.records;
    poLinesStore = parsed.poLines;
    auditChains = parsed.auditChains;
  } catch (err) {
    storageError = `Stored receiving data could not be read (${err instanceof Error ? err.message : 'parse error'}). It has not been repaired or replaced.`;
    recordsStore = [];
    poLinesStore = [];
    auditChains = { org_demo_alpha: [], org_demo_bravo: [] };
  }
  return true;
}

/** Simulates a page reload: drops in-memory state and re-initialises from storage. */
export function reloadFromStorage(): void {
  isInitialized = false;
  storageError = null;
  recordsStore = [];
  poLinesStore = [];
  auditChains = { org_demo_alpha: [], org_demo_bravo: [] };
  initializeData();
}

/** Explicit, user-confirmed reset: discards stored data and re-seeds from the sample CSV. */
export function resetToSampleData(): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  reloadFromStorage();
}

export function getPersistenceStatus(): { mode: 'browser-storage' | 'memory-only'; error: string | null } {
  initializeData();
  return { mode: storage ? 'browser-storage' : 'memory-only', error: storageError };
}

// -------------------------------------------------------------
// Unit IDs: shared, deterministic UNIT-#### join keys (UNIT-0001…UNIT-0100 in the sample data)
// -------------------------------------------------------------
export const UNIT_ID_PATTERN = /^UNIT-(\d{4,})$/;

export function formatUnitId(n: number): string {
  return `UNIT-${String(n).padStart(4, '0')}`;
}

/** Next unit ID after the highest one in use across all organisations (unit IDs are a global join key). */
export function nextUnitId(): string {
  initializeData();
  const max = recordsStore.reduce((m, r) => {
    const match = UNIT_ID_PATTERN.exec(r.unitId || '');
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return formatUnitId(max + 1);
}

export function getAuditChain(tenantId: TenantId): AuditChainEntry[] {
  initializeData();
  return [...(auditChains[tenantId] || [])];
}

/**
 * Integrity verification for one tenant:
 * 1. every chain entry's entryHash matches a recomputation of its content;
 * 2. every entry's prevHash equals the previous entry's entryHash (genesis for the first);
 * 3. every stored record's content re-hashes to the contentHash in its latest chain entry.
 * Any edit to a record or chain entry made outside addReceivingRecord / applyOperatorOverride fails one of these.
 */
export function verifyIntegrity(tenantId: TenantId): IntegrityReport {
  initializeData();
  const chain = auditChains[tenantId] || [];
  const failures: IntegrityFailure[] = [];
  const latestContentHash = new Map<string, string>();

  if (storageError) {
    failures.push({ kind: 'STORAGE_UNREADABLE', detail: storageError });
  }

  chain.forEach((entry, i) => {
    const expectedPrev = i === 0 ? GENESIS_HASH : chain[i - 1].entryHash;
    if (entry.prevHash !== expectedPrev) {
      failures.push({ kind: 'BROKEN_LINK', index: i, recordId: entry.recordId, detail: `Entry ${i} does not link to the previous entry hash.` });
    }
    if (computeEntryHash(entry) !== entry.entryHash) {
      failures.push({ kind: 'ENTRY_HASH_MISMATCH', index: i, recordId: entry.recordId, detail: `Entry ${i} content no longer matches its SHA-256 entry hash.` });
    }
    latestContentHash.set(entry.recordId, entry.contentHash);
  });

  const records = recordsStore.filter((r) => r.orgId === tenantId);
  records.forEach((record) => {
    const chained = latestContentHash.get(record.recordId);
    if (!chained) {
      failures.push({ kind: 'RECORD_NOT_IN_CHAIN', recordId: record.recordId, detail: `${record.recordId} has no entry in the audit hash chain.` });
      return;
    }
    if (generateContentHash(record) !== chained) {
      failures.push({ kind: 'RECORD_CONTENT_MISMATCH', recordId: record.recordId, detail: `${record.recordId} content does not match the SHA-256 content hash recorded in the chain.` });
    }
  });

  // Records that the chain says exist but are no longer stored (deleted outside the app)
  const storedIds = new Set(records.map((r) => r.recordId));
  latestContentHash.forEach((_hash, recordId) => {
    if (!storedIds.has(recordId)) {
      failures.push({ kind: 'RECORD_MISSING', recordId, detail: `${recordId} is in the audit hash chain but is no longer stored.` });
    }
  });

  return {
    ok: failures.length === 0,
    orgId: tenantId,
    entriesChecked: chain.length,
    recordsChecked: records.length,
    headHash: chain.length > 0 ? chain[chain.length - 1].entryHash : GENESIS_HASH,
    failures,
    checkedAt: new Date().toISOString(),
  };
}

export function initializeData(): { records: ReceivingRecord[]; poLines: PurchaseOrderLine[] } {
  if (isInitialized) {
    return { records: recordsStore, poLines: poLinesStore };
  }

  // Previously saved state (including an unreadable one) takes precedence over re-seeding
  if (loadPersisted()) {
    isInitialized = true;
    return { records: recordsStore, poLines: poLinesStore };
  }

  const lines = rawCsv.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { records: [], poLines: [] };
  }

  const parsedRecords: ReceivingRecord[] = [];
  const poLineMap = new Map<string, PurchaseOrderLine>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i].trim());
    if (cols.length < 24) continue;

    const [
      record_id,
      unit_id,
      org_id,
      po_number,
      po_line,
      supplier,
      sku,
      asin,
      product_title,
      spec_colour,
      spec_variant,
      spec_components,
      cartons_ordered,
      cartons_received,
      units_per_carton_ordered,
      units_per_carton_counted,
      qty_ordered,
      qty_received,
      identity_match,
      carton_damage,
      unit_damage,
      quality_flags,
      photo_refs,
      operator_id,
      captured_at,
    ] = cols;

    const cartonsOrd = Number(cartons_ordered) || 0;
    const cartonsRec = Number(cartons_received) || 0;
    const unitsPerOrd = Number(units_per_carton_ordered) || 0;
    const unitsPerRec = Number(units_per_carton_counted) || 0;
    const qOrdered = Number(qty_ordered) || (cartonsOrd * unitsPerOrd);
    const qReceived = Number(qty_received) || (cartonsRec * unitsPerRec);

    const qualityFlagsArray: QualityFlag[] = quality_flags
      ? (quality_flags.split(';').map((f) => f.trim()).filter(Boolean) as QualityFlag[])
      : [];

    const photoRefsArray: string[] = photo_refs
      ? photo_refs.split(';').map((p) => p.trim()).filter(Boolean)
      : [];

    // Evaluate through comparison engine
    const evaluation = compareShipment({
      expectedSku: sku,
      receivedSku: identity_match === 'no' ? `${sku}-ALT` : sku,
      qtyOrdered: qOrdered,
      qtyReceived: qReceived,
      cartonDamage: (carton_damage || 'none') as DamageGrade,
      unitDamage: (unit_damage || 'none') as DamageGrade,
      qualityFlags: qualityFlagsArray,
      identityMatchOverride: identity_match as 'yes' | 'no' | 'uncertain',
    });

    const record: ReceivingRecord = {
      recordId: record_id,
      unitId: unit_id,
      orgId: (org_id as TenantId) || 'org_demo_alpha',
      poNumber: po_number,
      poLine: Number(po_line) || 1,
      supplier,
      sku,
      asin,
      productTitle: product_title,
      specColour: spec_colour,
      specVariant: spec_variant,
      specComponents: spec_components,
      cartonsOrdered: cartonsOrd,
      unitsPerCartonOrdered: unitsPerOrd,
      qtyOrdered: qOrdered,
      cartonsReceived: cartonsRec,
      unitsPerCartonCounted: unitsPerRec,
      qtyReceived: qReceived,
      receivedSku: identity_match === 'no' ? `${sku}-ALT` : sku,
      identityMatch: (identity_match as 'yes' | 'no' | 'uncertain') || 'yes',
      cartonDamage: (carton_damage as DamageGrade) || 'none',
      unitDamage: (unit_damage as DamageGrade) || 'none',
      qualityFlags: qualityFlagsArray,
      photoRefs: photoRefsArray,
      operatorId: operator_id || 'op_warehouse',
      capturedAt: captured_at || new Date().toISOString(),
      status: evaluation.status,
      discrepancies: evaluation.discrepancies,
      qtyDifference: evaluation.qtyDifference,
      disposition: evaluation.disposition,
      contentHash: '',
    };

    parsedRecords.push(sealRecord(record));

    // Aggregate into PO line catalog
    const poKey = `${org_id}_${po_number}_${po_line}`;
    if (!poLineMap.has(poKey)) {
      poLineMap.set(poKey, {
        id: poKey,
        poNumber: po_number,
        poLine: Number(po_line) || 1,
        orgId: (org_id as TenantId) || 'org_demo_alpha',
        supplier,
        sku,
        asin,
        productTitle: product_title,
        specColour: spec_colour,
        specVariant: spec_variant,
        specComponents: spec_components,
        cartonsOrdered: cartonsOrd,
        unitsPerCartonOrdered: unitsPerOrd,
        qtyOrdered: qOrdered,
        status: 'COMPLETED',
        updatedAt: captured_at,
      });
    }
  }

  // Add a few pending PO lines ready for receiving in both tenants
  const pendingLines: PurchaseOrderLine[] = [
    {
      id: 'org_demo_alpha_PO-7026_1',
      poNumber: 'PO-7026',
      poLine: 1,
      orgId: 'org_demo_alpha',
      supplier: 'Supplier East (DUMMY)',
      sku: 'SKU-TOWEL-BLU',
      asin: 'B0DUMMY600',
      productTitle: 'Cotton Bath Towel (Dock Ready)',
      specColour: 'blue',
      specVariant: 'bath',
      specComponents: 'towel',
      cartonsOrdered: 3,
      unitsPerCartonOrdered: 24,
      qtyOrdered: 72,
      status: 'PENDING',
    },
    {
      id: 'org_demo_alpha_PO-7026_2',
      poNumber: 'PO-7026',
      poLine: 2,
      orgId: 'org_demo_alpha',
      supplier: 'Supplier East (DUMMY)',
      sku: 'SKU-CANDLE-3',
      asin: 'B0DUMMY964',
      productTitle: 'Soy Candle Trio Set',
      specColour: 'cream',
      specVariant: '3-pack',
      specComponents: 'candle x3;gift box',
      cartonsOrdered: 4,
      unitsPerCartonOrdered: 12,
      qtyOrdered: 48,
      status: 'PENDING',
    },
    {
      id: 'org_demo_bravo_PO-8001_1',
      poNumber: 'PO-8001',
      poLine: 1,
      orgId: 'org_demo_bravo',
      supplier: 'Supplier Coastal (DUMMY)',
      sku: 'SKU-LEASH-6FT',
      asin: 'B0DUMMY205',
      productTitle: 'Nylon Dog Leash 6ft Heavy Duty',
      specColour: 'red',
      specVariant: '6ft',
      specComponents: 'leash',
      cartonsOrdered: 5,
      unitsPerCartonOrdered: 12,
      qtyOrdered: 60,
      status: 'PENDING',
    },
  ];

  pendingLines.forEach((line) => {
    poLineMap.set(line.id, line);
  });

  recordsStore = parsedRecords;
  poLinesStore = Array.from(poLineMap.values());
  isInitialized = true;

  // Seed each tenant's audit hash chain with the imported records, in file order
  auditChains = { org_demo_alpha: [], org_demo_bravo: [] };
  parsedRecords.forEach((record) => appendChainEntry(record.orgId, 'RECORD_CREATED', record));
  persist();

  return { records: recordsStore, poLines: poLinesStore };
}

// Tenancy isolation enforcement
export function getRecordsByTenant(tenantId: TenantId): ReceivingRecord[] {
  initializeData();
  return recordsStore.filter((r) => r.orgId === tenantId);
}

export function getPOLinesByTenant(tenantId: TenantId): PurchaseOrderLine[] {
  initializeData();
  return poLinesStore.filter((p) => p.orgId === tenantId);
}

export function getRecordById(tenantId: TenantId, recordId: string): ReceivingRecord | null {
  initializeData();
  const record = recordsStore.find((r) => r.recordId === recordId && r.orgId === tenantId);
  return record || null;
}

export function getPOLineById(tenantId: TenantId, poLineId: string): PurchaseOrderLine | null {
  initializeData();
  const poLine = poLinesStore.find((p) => p.id === poLineId && p.orgId === tenantId);
  return poLine || null;
}

export function addReceivingRecord(tenantId: TenantId, record: ReceivingRecord): ReceivingRecord {
  initializeData();
  // Enforce tenant ID on created record, then compute its SHA-256 content hash
  // from the stored content (any caller-supplied hash is replaced) and append it to the chain
  record.orgId = tenantId;
  // Unit IDs are global join keys: always assign the next deterministic UNIT-#### here,
  // so callers cannot introduce random, duplicate or out-of-sequence IDs
  record.unitId = nextUnitId();
  sealRecord(record);
  recordsStore.unshift(record);
  appendChainEntry(tenantId, 'RECORD_CREATED', record);

  // Update associated PO line status
  const poLine = poLinesStore.find(
    (p) => p.orgId === tenantId && p.poNumber === record.poNumber && p.poLine === record.poLine
  );
  if (poLine) {
    poLine.status = record.status === 'MATCHED' ? 'COMPLETED' : 'FLAGGED';
    poLine.updatedAt = record.capturedAt;
  }

  persist();
  return record;
}

export function applyOperatorOverride(
  tenantId: TenantId,
  recordId: string,
  override: OperatorOverride
): ReceivingRecord | null {
  initializeData();
  const record = recordsStore.find((r) => r.recordId === recordId && r.orgId === tenantId);
  if (!record) return null;

  // Keep the full original finding set with the override ("overrides are data")
  const originalDiscrepancies = record.discrepancies ?? (record.status === 'MATCHED' ? [] : [record.status]);
  record.operatorOverride = { ...override, originalDiscrepancies: [...originalDiscrepancies] };
  record.status = override.newStatus;
  record.discrepancies = override.newStatus === 'MATCHED' ? [] : [override.newStatus];
  record.disposition =
    override.newStatus === 'MATCHED'
      ? 'ACCEPT_TO_PREP'
      : override.newStatus === 'SHORT_RECEIVED'
      ? 'ACCEPT_WITH_SHORTAGE'
      : 'HOLD_QUARANTINE_RECOVERY';

  // Re-hash the updated content (including the override itself) and append an
  // OPERATOR_OVERRIDE entry so the change is recorded in the chain, not silently applied
  sealRecord(record);
  appendChainEntry(tenantId, 'OPERATOR_OVERRIDE', record, record.operatorOverride);

  persist();
  return record;
}
