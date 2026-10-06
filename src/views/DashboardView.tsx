import React, { useState, useMemo } from 'react';
import {
  Search,
  FileCode,
  Edit3,
  RotateCcw,
  Inbox,
  ScanSearch,
  Table2,
} from 'lucide-react';
import { ReceivingRecord, ReceivingStatus } from '../types/receiving';
import { recordDiscrepancies, recordHasStatus } from '../services/comparisonEngine';
import { MetricsBanner } from '../components/MetricsBanner';
import { DiscrepancyBadge } from '../components/DiscrepancyBadge';
import { CrossPodExportModal } from '../components/CrossPodExportModal';
import { OverrideModal } from '../components/OverrideModal';
import InspectionHistory, { InspectionHistoryEntry } from '../components/InspectionHistory';
import { EmptyState } from '../components/ui';

interface DashboardViewProps {
  records: ReceivingRecord[];
  onConfirmOverride: (override: any, recordId: string) => void;
  activeOperatorId: string;
  inspections: InspectionHistoryEntry[];
  onOpenInspection: (inspectionId: string) => void;
  onNewInspection: () => void;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  records,
  onConfirmOverride,
  activeOperatorId,
  inspections,
  onOpenInspection,
  onNewInspection,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedRecordForContract, setSelectedRecordForContract] = useState<ReceivingRecord | null>(null);
  const [selectedRecordForOverride, setSelectedRecordForOverride] = useState<ReceivingRecord | null>(null);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        term === '' ||
        r.recordId.toLowerCase().includes(term) ||
        r.unitId.toLowerCase().includes(term) ||
        r.poNumber.toLowerCase().includes(term) ||
        r.supplier.toLowerCase().includes(term) ||
        r.sku.toLowerCase().includes(term) ||
        r.productTitle.toLowerCase().includes(term);

      // Filters match a discrepancy whether it is the primary status or an additional one
      let matchesStatus = true;
      if (statusFilter === 'ALL') {
        matchesStatus = true;
      } else if (statusFilter === 'DISCREPANCIES') {
        matchesStatus = (['WRONG_PRODUCT', 'DAMAGED', 'QUALITY_DISCREPANCY'] as const).some((s) => recordHasStatus(r, s));
      } else if (statusFilter === 'UNCERTAIN') {
        matchesStatus = recordHasStatus(r, 'UNCERTAIN') || recordHasStatus(r, 'PENDING_REVIEW');
      } else {
        matchesStatus = recordHasStatus(r, statusFilter as ReceivingStatus);
      }

      return matchesSearch && matchesStatus;
    });
  }, [records, searchTerm, statusFilter]);

  const filtersActive = searchTerm !== '' || statusFilter !== 'ALL';

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="page-eyebrow">Receiving operations</div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Every supplier receipt for this organisation, its condition on arrival and where it was routed.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn-primary btn-lg" onClick={onNewInspection}>
            <ScanSearch size={16} />
            New inspection
          </button>
        </div>
      </div>

      <MetricsBanner records={records} onFilterClick={setStatusFilter} activeFilter={statusFilter} />

      <InspectionHistory
        entries={inspections}
        onOpen={onOpenInspection}
        limit={5}
        title="Recent inspections"
      />

      {/* Receipts table */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <Table2 size={16} />
              Receipts
              <span className="chip">{filteredRecords.length} of {records.length}</span>
            </div>
            <div className="panel-subtitle">Select a KPI tile above or use the filters to narrow the list.</div>
          </div>

          <div className="row" style={{ flexWrap: 'wrap', gap: 8, flex: '1 1 420px', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 340 }}>
              <Search
                size={15}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}
                aria-hidden="true"
              />
              <input
                type="search"
                className="form-input"
                style={{ paddingLeft: 32 }}
                placeholder="Search PO, supplier, SKU, unit…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search receipts"
              />
            </div>
            <select
              className="form-select"
              style={{ width: 'auto', minWidth: 170 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="ALL">All statuses</option>
              <option value="MATCHED">Matched</option>
              <option value="SHORT_RECEIVED">Short received</option>
              <option value="OVER_RECEIVED">Over received</option>
              <option value="DISCREPANCIES">Quarantined (all)</option>
              <option value="WRONG_PRODUCT">Wrong product / SKU</option>
              <option value="DAMAGED">Damaged</option>
              <option value="QUALITY_DISCREPANCY">Quality flag</option>
              <option value="UNCERTAIN">Uncertain / review</option>
            </select>
            {filtersActive && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('ALL');
                }}
              >
                <RotateCcw size={14} />
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Purchase order</th>
                <th>Product</th>
                <th className="num">Expected</th>
                <th className="num">Received</th>
                <th className="num">Diff</th>
                <th>Status</th>
                <th>Condition</th>
                <th>Captured</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState icon={Inbox} title="No matching receipts">
                      {filtersActive ? 'Try clearing the search or status filter.' : 'Receipts recorded for this organisation will appear here.'}
                    </EmptyState>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const conditionIssues = [
                    r.cartonDamage !== 'none' ? `Carton: ${r.cartonDamage}` : null,
                    r.unitDamage !== 'none' ? `Unit: ${r.unitDamage}` : null,
                    ...r.qualityFlags.map((f) => f.replace(/_/g, ' ')),
                  ].filter(Boolean) as string[];

                  return (
                    <tr key={r.recordId}>
                      <td>
                        <div className="mono" style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.recordId}</div>
                        <div className="mono xsmall dim" style={{ whiteSpace: 'nowrap' }}>{r.unitId}</div>
                      </td>
                      <td>
                        <div className="mono" style={{ whiteSpace: 'nowrap' }}>{r.poNumber}</div>
                        <div className="xsmall dim truncate" style={{ maxWidth: 180 }} title={r.supplier}>
                          Line {r.poLine} · {r.supplier}
                        </div>
                      </td>
                      <td>
                        <div className="truncate" style={{ maxWidth: 220 }} title={r.productTitle}>{r.productTitle}</div>
                        <div className="mono xsmall dim">{r.sku}</div>
                      </td>
                      <td className="num muted">{r.qtyOrdered}</td>
                      <td className="num" style={{ fontWeight: 600 }} title={r.qtyReceived === null ? 'Not counted: verification not completed' : undefined}>
                        {r.qtyReceived ?? '—'}
                      </td>
                      <td className="num">
                        {r.qtyDifference === null ? (
                          <span className="dim" title="Not counted: verification not completed">—</span>
                        ) : (
                          <span
                            className={`delta-tag ${
                              r.qtyDifference === 0 ? 'delta-matched' : r.qtyDifference < 0 ? 'delta-short' : 'delta-over'
                            }`}
                            style={{ fontSize: '0.76rem' }}
                          >
                            {r.qtyDifference > 0 ? `+${r.qtyDifference}` : r.qtyDifference}
                          </span>
                        )}
                      </td>
                      <td>
                        <DiscrepancyBadge status={r.status} size="sm" />
                        {recordDiscrepancies(r)
                          .filter((d) => d !== r.status)
                          .map((d) => (
                            <div key={d} style={{ marginTop: 3 }} data-testid="additional-discrepancy">
                              <DiscrepancyBadge status={d} size="sm" />
                            </div>
                          ))}
                        {r.operatorOverride && (
                          <div className="xsmall" style={{ color: 'var(--warn-text)', marginTop: 3 }}>
                            Overridden by {r.operatorOverride.operatorId}
                          </div>
                        )}
                      </td>
                      <td className="small">
                        {r.pendingReason ? (
                          <span style={{ color: 'var(--warn-text)' }} data-testid="pending-reason">
                            Verification not completed: {r.pendingReason}
                          </span>
                        ) : conditionIssues.length === 0 ? (
                          <span style={{ color: 'var(--ok-text)' }}>No issues</span>
                        ) : (
                          <span style={{ color: 'var(--bad-text)', textTransform: 'capitalize' }}>{conditionIssues.join(' · ')}</span>
                        )}
                      </td>
                      <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.capturedAt)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <button
                            type="button"
                            className="btn-ghost btn-icon"
                            onClick={() => setSelectedRecordForContract(r)}
                            title="View cross-pod evidence contract"
                            aria-label={`View evidence contract for ${r.recordId}`}
                          >
                            <FileCode size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-icon"
                            onClick={() => setSelectedRecordForOverride(r)}
                            title="Override verdict"
                            aria-label={`Override verdict for ${r.recordId}`}
                          >
                            <Edit3 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRecordForContract && (
        <CrossPodExportModal
          record={selectedRecordForContract}
          onClose={() => setSelectedRecordForContract(null)}
        />
      )}

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
