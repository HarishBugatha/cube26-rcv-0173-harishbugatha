import React, { useState, useEffect } from 'react';
import { PurchaseOrderLine, ReceivingRecord, TenantId } from '../types/receiving';
import { ReceivingForm } from '../components/ReceivingForm';
import { ComparisonCard } from '../components/ComparisonCard';
import { compareShipment } from '../services/comparisonEngine';
import { CrossPodExportModal } from '../components/CrossPodExportModal';
import { OverrideModal } from '../components/OverrideModal';

interface TerminalViewProps {
  poLines: PurchaseOrderLine[];
  selectedPOLine: PurchaseOrderLine | null;
  onSelectPOLine: (po: PurchaseOrderLine) => void;
  onSubmitRecord: (record: ReceivingRecord) => void;
  operatorId: string;
  tenantId: TenantId;
  onConfirmOverride: (override: any, recordId: string) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  poLines,
  selectedPOLine,
  onSelectPOLine,
  onSubmitRecord,
  operatorId,
  tenantId,
  onConfirmOverride,
}) => {
  const [activeExportRecord, setActiveExportRecord] = useState<ReceivingRecord | null>(null);
  const [activeOverrideRecord, setActiveOverrideRecord] = useState<ReceivingRecord | null>(null);

  // Default fallback PO if none selected
  useEffect(() => {
    if (!selectedPOLine && poLines.length > 0) {
      onSelectPOLine(poLines[0]);
    }
  }, [poLines, selectedPOLine, onSelectPOLine]);

  const activePO = selectedPOLine || poLines[0];

  // Live comparison state (reactive to active PO)
  const comparison = activePO
    ? compareShipment({
        expectedSku: activePO.sku,
        receivedSku: activePO.sku,
        qtyOrdered: activePO.qtyOrdered,
        qtyReceived: activePO.qtyOrdered,
        cartonDamage: 'none',
        unitDamage: 'none',
        qualityFlags: [],
      })
    : null;

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
          Dock Receiving Workstation
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
          Physical shipment verification, automated PO line reconciliation, and damage grading for inbound pallets.
        </p>
      </div>

      <div className="terminal-layout">
        {/* Left Column: Input Terminal Form */}
        <div>
          <ReceivingForm
            poLines={poLines}
            selectedPOLine={activePO}
            onSelectPOLine={onSelectPOLine}
            onSubmitRecord={onSubmitRecord}
            operatorId={operatorId}
            tenantId={tenantId}
          />
        </div>

        {/* Right Column: Live Comparison & Discrepancy Preview */}
        <div>
          {activePO && comparison ? (
            <ComparisonCard
              comparison={comparison}
              expectedData={{
                poNumber: activePO.poNumber,
                poLine: activePO.poLine,
                supplier: activePO.supplier,
                sku: activePO.sku,
                asin: activePO.asin,
                productTitle: activePO.productTitle,
                cartonsOrdered: activePO.cartonsOrdered,
                unitsPerCartonOrdered: activePO.unitsPerCartonOrdered,
                qtyOrdered: activePO.qtyOrdered,
              }}
              receivedData={{
                receivedSku: activePO.sku,
                cartonsReceived: activePO.cartonsOrdered,
                unitsPerCartonCounted: activePO.unitsPerCartonOrdered,
                qtyReceived: activePO.qtyOrdered,
                cartonDamage: 'none',
                unitDamage: 'none',
                qualityFlags: [],
                operatorId,
              }}
              onExportContract={() => {
                const sampleRecord: ReceivingRecord = {
                  recordId: `RCV-PREVIEW`,
                  unitId: `UNIT-SAMPLE`,
                  orgId: tenantId,
                  poNumber: activePO.poNumber,
                  poLine: activePO.poLine,
                  supplier: activePO.supplier,
                  sku: activePO.sku,
                  asin: activePO.asin,
                  productTitle: activePO.productTitle,
                  specColour: activePO.specColour,
                  specVariant: activePO.specVariant,
                  specComponents: activePO.specComponents,
                  cartonsOrdered: activePO.cartonsOrdered,
                  unitsPerCartonOrdered: activePO.unitsPerCartonOrdered,
                  qtyOrdered: activePO.qtyOrdered,
                  cartonsReceived: activePO.cartonsOrdered,
                  unitsPerCartonCounted: activePO.unitsPerCartonOrdered,
                  qtyReceived: activePO.qtyOrdered,
                  receivedSku: activePO.sku,
                  identityMatch: 'yes',
                  cartonDamage: 'none',
                  unitDamage: 'none',
                  qualityFlags: [],
                  photoRefs: [
                    'fixtures/receiving/UNIT-SAMPLE_pallet.jpg',
                    'fixtures/receiving/UNIT-SAMPLE_carton.jpg',
                  ],
                  operatorId,
                  capturedAt: new Date().toISOString(),
                  status: comparison.status,
                  qtyDifference: comparison.qtyDifference,
                  disposition: comparison.disposition,
                  contentHash: 'sha256-preview-contract-hash',
                };
                setActiveExportRecord(sampleRecord);
              }}
            />
          ) : (
            <div
              className="card-panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '350px',
                color: '#64748b',
              }}
            >
              Select a Purchase Order line to begin comparison preview
            </div>
          )}
        </div>
      </div>

      {/* Export Contract Modal */}
      {activeExportRecord && (
        <CrossPodExportModal
          record={activeExportRecord}
          onClose={() => setActiveExportRecord(null)}
        />
      )}

      {/* Operator Override Modal */}
      {activeOverrideRecord && (
        <OverrideModal
          record={activeOverrideRecord}
          activeOperatorId={operatorId}
          onClose={() => setActiveOverrideRecord(null)}
          onConfirmOverride={(override) => {
            onConfirmOverride(override, activeOverrideRecord.recordId);
            setActiveOverrideRecord(null);
          }}
        />
      )}
    </div>
  );
};
