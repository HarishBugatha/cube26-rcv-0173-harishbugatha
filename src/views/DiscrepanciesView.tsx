import React, { useState } from 'react';
import {
  FileCode,
  Edit3,
} from 'lucide-react';
import { ReceivingRecord } from '../types/receiving';
import { recordDiscrepancies, recordHasStatus } from '../services/comparisonEngine';
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
    // Match primary or additional discrepancies (e.g. a short delivery with a quality flag appears in both filters)
    if (typeFilter === 'SHORT') return recordHasStatus(r, 'SHORT_RECEIVED');
    if (typeFilter === 'OVER') return recordHasStatus(r, 'OVER_RECEIVED');
    if (typeFilter === 'WRONG_SKU') return recordHasStatus(r, 'WRONG_PRODUCT');
    if (typeFilter === 'DAMAGE') return recordHasStatus(r, 'DAMAGED');
    if (typeFilter === 'QUALITY') return recordHasStatus(r, 'QUALITY_DISCREPANCY');
    if (typeFilter === 'UNCERTAIN') return recordHasStatus(r, 'UNCERTAIN');
    return true;
  });

  // Calculate total units variance
  // Pending records (qtyDifference null: not counted) are excluded from unit totals
  const totalShortageUnits = discrepancyRecords
    .reduce((sum, r) => (r.qtyDifference !== null && r.qtyDifference < 0 ? sum + Math.abs(r.qtyDifference) : sum), 0);

  const totalSurplusUnits = discrepancyRecords
    .reduce((sum, r) => (r.qtyDifference !== null && r.qtyDifference > 0 ? sum + r.qtyDifference : sum), 0);

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
          Dock Discrepancy & Quarantine Queue
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
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
          style={{ padding: '1rem', borderLeft: '4px solid var(--bad)' }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--bad-text)', fontWeight: 600 }}>
            FLAGGED SHIPMENTS
          </div>
          <div className="font-mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {discrepancyRecords.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Require resolution or claim</div>
        </div>

        <div
          className="card-panel"
          style={{ padding: '1rem', borderLeft: '4px solid var(--warn)' }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--warn-text)', fontWeight: 600 }}>
            CUMULATIVE SHORTAGE
          </div>
          <div className="font-mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--warn-text)' }}>
            -{totalShortageUnits} <span style={{ fontSize: '0.9rem' }}>units</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Eligible for supplier chargeback</div>
        </div>

        <div
          className="card-panel"
          style={{ padding: '1rem', borderLeft: '4px solid var(--over)' }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--over-text)', fontWeight: 600 }}>
            CUMULATIVE SURPLUS
          </div>
          <div className="font-mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--over-text)' }}>
            +{totalSurplusUnits} <span style={{ fontSize: '0.9rem' }}>units</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Held in dock surplus staging</div>
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
              backgroundColor: typeFilter === tab.id ? 'var(--accent-primary)' : undefined,
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
            style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}
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
                      ? 'var(--warn)'
                      : r.status === 'OVER_RECEIVED'
                      ? 'var(--over)'
                      : r.status === 'UNCERTAIN'
                      ? 'var(--over)'
                      : 'var(--bad)'
                  }`,
                }}
              >
                <div className="card-panel-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span className="font-mono" style={{ fontWeight: 700, color: 'var(--info-text)' }}>
                      {r.recordId}
                    </span>
                    <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Unit: {r.unitId}
                    </span>
                    <DiscrepancyBadge status={r.status} size="sm" />
                    {recordDiscrepancies(r)
                      .filter((d) => d !== r.status)
                      .map((d) => (
                        <DiscrepancyBadge key={d} status={d} size="sm" />
                      ))}
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
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>PURCHASE ORDER & LINE:</div>
                      <div className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        {r.poNumber} [Line #{r.poLine}]
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.supplier}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>PRODUCT & EXPECTED SKU:</div>
                      <div style={{ fontWeight: 500, color: 'var(--text-main)' }}>{r.productTitle}</div>
                      <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Ordered: {r.sku}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>RECEIVED SKU SCAN:</div>
                      <div
                        className="font-mono"
                        style={{
                          fontWeight: 700,
                          color: r.receivedSku === r.sku ? 'var(--ok-text)' : 'var(--bad-text)',
                        }}
                      >
                        {r.receivedSku}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Identity Match: {r.identityMatch.toUpperCase()}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>QUANTITY RECONCILIATION:</div>
                      <div className="font-mono" style={{ fontSize: '0.9rem' }}>
                        Expected: {r.qtyOrdered} | Received: {r.qtyReceived ?? '— (not counted)'}
                      </div>
                      {r.qtyDifference === null ? (
                        <div style={{ marginTop: '3px', fontSize: '0.75rem', color: 'var(--warn-text)' }}>
                          Verification not completed{r.pendingReason ? `: ${r.pendingReason}` : ''}
                        </div>
                      ) : (
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
                      )}
                    </div>
                  </div>

                  {/* Condition & Damage Details */}
                  {(r.cartonDamage !== 'none' || r.unitDamage !== 'none' || r.qualityFlags.length > 0) && (
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'var(--bg-inset)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--bad-border)',
                        marginBottom: '0.75rem',
                        fontSize: '0.8rem',
                      }}
                    >
                      <strong style={{ color: 'var(--bad-text)' }}>Inspection Findings:</strong>
                      {r.cartonDamage !== 'none' && (
                        <span style={{ marginLeft: '8px', color: 'var(--text-main)' }}>
                          Carton Damage: <strong style={{ color: 'var(--bad-text)' }}>{r.cartonDamage}</strong>
                        </span>
                      )}
                      {r.unitDamage !== 'none' && (
                        <span style={{ marginLeft: '8px', color: 'var(--text-main)' }}>
                          Unit Damage: <strong style={{ color: 'var(--bad-text)' }}>{r.unitDamage}</strong>
                        </span>
                      )}
                      {r.qualityFlags.length > 0 && (
                        <span style={{ marginLeft: '8px', color: 'var(--text-main)' }}>
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
                      color: 'var(--text-muted)',
                      borderTop: '1px solid var(--border-subtle)',
                      paddingTop: '0.75rem',
                    }}
                  >
                    <div>
                      Disposition: <strong style={{ color: 'var(--info-text)' }}>{r.disposition}</strong>
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
