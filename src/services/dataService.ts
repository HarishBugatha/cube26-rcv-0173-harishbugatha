import rawCsv from '../../data/receiving_sample.csv?raw';
import {
  PurchaseOrderLine,
  ReceivingRecord,
  TenantId,
  DamageGrade,
  QualityFlag,
  OperatorOverride,
} from '../types/receiving';
import {
  compareShipment,
  generateContentHash,
} from './comparisonEngine';

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

export function initializeData(): { records: ReceivingRecord[]; poLines: PurchaseOrderLine[] } {
  if (isInitialized && recordsStore.length > 0) {
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
      qtyDifference: evaluation.qtyDifference,
      disposition: evaluation.disposition,
      contentHash: generateContentHash({
        poNumber: po_number,
        poLine: Number(po_line) || 1,
        sku,
        qtyReceived: qReceived,
        status: evaluation.status,
        operatorId: operator_id || 'op_warehouse',
        capturedAt: captured_at || new Date().toISOString(),
      }),
    };

    parsedRecords.push(record);

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
  // Enforce tenant ID on created record
  record.orgId = tenantId;
  recordsStore.unshift(record);

  // Update associated PO line status
  const poLine = poLinesStore.find(
    (p) => p.orgId === tenantId && p.poNumber === record.poNumber && p.poLine === record.poLine
  );
  if (poLine) {
    poLine.status = record.status === 'MATCHED' ? 'COMPLETED' : 'FLAGGED';
    poLine.updatedAt = record.capturedAt;
  }

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

  record.operatorOverride = override;
  record.status = override.newStatus;
  record.disposition =
    override.newStatus === 'MATCHED'
      ? 'ACCEPT_TO_PREP'
      : override.newStatus === 'SHORT_RECEIVED'
      ? 'ACCEPT_WITH_SHORTAGE'
      : 'HOLD_QUARANTINE_RECOVERY';

  // Recalculate content hash to anchor override
  record.contentHash = generateContentHash({
    poNumber: record.poNumber,
    poLine: record.poLine,
    sku: record.sku,
    qtyReceived: record.qtyReceived,
    status: `${record.status}(OVERRIDDEN)`,
    operatorId: override.operatorId,
    capturedAt: override.timestamp,
  });

  return record;
}
