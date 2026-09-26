import React, { useState } from 'react';
import {
  FileCode,
  Edit3,
} from 'lucide-react';
import { ReceivingRecord } from '../types/receiving';
import { DiscrepancyBadge } from '../components/DiscrepancyBadge';
import { CrossPodExportModal } from '../components/CrossPodExportModal';
import { OverrideModal } from '../components/OverrideModal';

interface DiscrepanciesViewProps {
  records: ReceivingRecord[];
  onConfirmOverride: (override: any, recordId: string) => void;
  activeOperatorId: string;
}

export const DiscrepanciesView: React.FC<DiscrepanciesViewProps> = ({
  records,
  onConfirmOverride,
  activeOperatorId,
}) => {
  const [selectedRecordForContract, setSelectedRecordForContract] = useState<ReceivingRecord | null>(null);
  const [selectedRecordForOverride, setSelectedRecordForOverride] = useState<ReceivingRecord | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Filter only records that have discrepancies or are uncertain
  const discrepancyRecords = records.filter(
    (r) => r.status !== 'MATCHED'
  );

  const filteredDiscrepancies = discrepancyRecords.filter((r) => {
    if (typeFilter === 'ALL') return true;
    if (typeFilter === 'SHORT') return r.status === 'SHORT_RECEIVED';
    if (typeFilter === 'OVER') return r.status === 'OVER_RECEIVED';
    if (typeFilter === 'WRONG_SKU') return r.status === 'WRONG_PRODUCT';
    if (typeFilter === 'DAMAGE') return r.status === 'DAMAGED';
    if (typeFilter === 'QUALITY') return r.status === 'QUALITY_DISCREPANCY';
    if (typeFilter === 'UNCERTAIN') return r.status === 'UNCERTAIN';
    return true;
  });

  // Calculate total units variance
  const totalShortageUnits = discrepancyRecords
    .filter((r) => r.qtyDifference < 0)
    .reduce((sum, r) => sum + Math.abs(r.qtyDifference), 0);

  const totalSurplusUnits = discrepancyRecords
    .filter((r) => r.qtyDifference > 0)
    .reduce((sum, r) => sum + r.qtyDifference, 0);

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
          Dock Discrepancy & Quarantine Queue
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
          Quarantine holds, shortage claims, damage records, and photographic proof feeding Step 05 Recovery Manager.
        </p>
      </div>

      {/* Discrepancy Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          className="card-panel"
          style={{ padding: '1rem', borderLeft: '4px solid #ef4444' }}
        >
          <div style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 600 }}>
            FLAGGED SHIPMENTS
          </div>
          <div className="font-mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f8fafc' }}>
            {discrepancyRecords.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Require resolution or claim</div>
        </div>

        <div
          className="card-panel"
          style={{ padding: '1rem', borderLeft: '4px solid #f59e0b' }}
        >
          <div style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 600 }}>
            CUMULATIVE SHORTAGE
          </div>
          <div className="font-mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fbbf24' }}>
            -{totalShortageUnits} <span style={{ fontSize: '0.9rem' }}>units</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Eligible for supplier chargeback</div>
        </div>

        <div
          className="card-panel"
          style={{ padding: '1rem', borderLeft: '4px solid #818cf8' }}
        >
          <div style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 600 }}>
            CUMULATIVE SURPLUS
          </div>
          <div className="font-mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#a5b4fc' }}>
            +{totalSurplusUnits} <span style={{ fontSize: '0.9rem' }}>units</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Held in dock surplus staging</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { id: 'ALL', label: `All Flagged (${discrepancyRecords.length})` },
          { id: 'SHORT', label: 'Shortages' },
          { id: 'OVER', label: 'Surplus' },
          { id: 'WRONG_SKU', label: 'Wrong SKU' },
          { id: 'DAMAGE', label: 'Damaged' },
          { id: 'QUALITY', label: 'Quality Non-Conformance' },
          { id: 'UNCERTAIN', label: 'Uncertain' },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`btn-secondary ${typeFilter === tab.id ? 'active' : ''}`}
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.8rem',
              backgroundColor: typeFilter === tab.id ? '#2563eb' : undefined,
              color: typeFilter === tab.id ? 'white' : undefined,
            }}
            onClick={() => setTypeFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Discrepancy Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredDiscrepancies.length === 0 ? (
          <div
            className="card-panel"
            style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}
          >
            No discrepancies in this category. All shipments compliant.
          </div>
        ) : (
          filteredDiscrepancies.map((r) => {
            return (
              <div
                key={r.recordId}
                className="card-panel"
                style={{
                  borderLeft: `4px solid ${
                    r.status === 'SHORT_RECEIVED'
                      ? '#f59e0b'
                      : r.status === 'OVER_RECEIVED'
                      ? '#818cf8'
                      : r.status === 'UNCERTAIN'
                      ? '#6366f1'
                      : '#ef4444'
                  }`,
                }}
              >
                <div className="card-panel-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="font-mono" style={{ fontWeight: 700, color: '#38bdf8' }}>
                      {r.recordId}
                    </span>
                    <span className="font-mono" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Unit: {r.unitId}
                    </span>
                    <DiscrepancyBadge status={r.status} size="sm" />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => setSelectedRecordForContract(r)}
                    >
                      <FileCode size={14} />
                      Export Evidence JSON
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => setSelectedRecordForOverride(r)}
                    >
                      <Edit3 size={14} />
                      Override
                    </button>
                  </div>
                </div>

                <div className="card-panel-body">
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '1rem',
                      marginBottom: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>PURCHASE ORDER & LINE:</div>
                      <div className="font-mono" style={{ fontWeight: 600, color: '#f8fafc' }}>
                        {r.poNumber} [Line #{r.poLine}]
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{r.supplier}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>PRODUCT & EXPECTED SKU:</div>
                      <div style={{ fontWeight: 500, color: '#f8fafc' }}>{r.productTitle}</div>
                      <div className="font-mono" style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        Ordered: {r.sku}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>RECEIVED SKU SCAN:</div>
                      <div
                        className="font-mono"
                        style={{
                          fontWeight: 700,
                          color: r.receivedSku === r.sku ? '#34d399' : '#f87171',
                        }}
                      >
                        {r.receivedSku}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Identity Match: {r.identityMatch.toUpperCase()}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>QUANTITY RECONCILIATION:</div>
                      <div className="font-mono" style={{ fontSize: '0.9rem' }}>
                        Expected: {r.qtyOrdered} | Received: {r.qtyReceived}
                      </div>
                      <div
                        className={`delta-tag ${
                          r.qtyDifference === 0
                            ? 'delta-matched'
                            : r.qtyDifference < 0
                            ? 'delta-short'
                            : 'delta-over'
                        }`}
                        style={{ display: 'inline-block', marginTop: '3px', fontSize: '0.75rem' }}
                      >
                        Variance: {r.qtyDifference >= 0 ? `+${r.qtyDifference}` : r.qtyDifference} units
                      </div>
                    </div>
                  </div>

                  {/* Condition & Damage Details */}
                  {(r.cartonDamage !== 'none' || r.unitDamage !== 'none' || r.qualityFlags.length > 0) && (
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: '#0a0f1d',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        marginBottom: '0.75rem',
                        fontSize: '0.8rem',
                      }}
                    >
                      <strong style={{ color: '#f87171' }}>Inspection Findings:</strong>
                      {r.cartonDamage !== 'none' && (
                        <span style={{ marginLeft: '8px', color: '#cbd5e1' }}>
                          Carton Damage: <strong style={{ color: '#f87171' }}>{r.cartonDamage}</strong>
                        </span>
                      )}
                      {r.unitDamage !== 'none' && (
                        <span style={{ marginLeft: '8px', color: '#cbd5e1' }}>
                          Unit Damage: <strong style={{ color: '#f87171' }}>{r.unitDamage}</strong>
                        </span>
                      )}
                      {r.qualityFlags.length > 0 && (
                        <span style={{ marginLeft: '8px', color: '#e9d5ff' }}>
                          Quality Flags: <strong>{r.qualityFlags.join(', ')}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Disposition Recommendation */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                      paddingTop: '0.75rem',
                    }}
                  >
                    <div>
                      Disposition: <strong style={{ color: '#38bdf8' }}>{r.disposition}</strong>
                    </div>
                    <div className="font-mono" style={{ fontSize: '0.75rem' }}>
                      Operator: {r.operatorId} · {new Date(r.capturedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Contract Modal */}
      {selectedRecordForContract && (
        <CrossPodExportModal
          record={selectedRecordForContract}
          onClose={() => setSelectedRecordForContract(null)}
        />
      )}

      {/* Override Modal */}
      {selectedRecordForOverride && (
        <OverrideModal
          record={selectedRecordForOverride}
          activeOperatorId={activeOperatorId}
          onClose={() => setSelectedRecordForOverride(null)}
          onConfirmOverride={(override) => {
            onConfirmOverride(override, selectedRecordForOverride.recordId);
            setSelectedRecordForOverride(null);
          }}
        />
      )}
    </div>
  );
};
