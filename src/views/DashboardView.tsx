import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  FileCode,
  Edit3,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { ReceivingRecord } from '../types/receiving';
import { MetricsBanner } from '../components/MetricsBanner';
import { DiscrepancyBadge } from '../components/DiscrepancyBadge';
import { CrossPodExportModal } from '../components/CrossPodExportModal';
import { OverrideModal } from '../components/OverrideModal';

interface DashboardViewProps {
  records: ReceivingRecord[];
  onConfirmOverride: (override: any, recordId: string) => void;
  activeOperatorId: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  records,
  onConfirmOverride,
  activeOperatorId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedRecordForContract, setSelectedRecordForContract] = useState<ReceivingRecord | null>(null);
  const [selectedRecordForOverride, setSelectedRecordForOverride] = useState<ReceivingRecord | null>(null);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Search term matching
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        term === '' ||
        r.recordId.toLowerCase().includes(term) ||
        r.unitId.toLowerCase().includes(term) ||
        r.poNumber.toLowerCase().includes(term) ||
        r.supplier.toLowerCase().includes(term) ||
        r.sku.toLowerCase().includes(term) ||
        r.productTitle.toLowerCase().includes(term);

      // Status filtering
      let matchesStatus = true;
      if (statusFilter === 'ALL') {
        matchesStatus = true;
      } else if (statusFilter === 'DISCREPANCIES') {
        matchesStatus = ['WRONG_PRODUCT', 'DAMAGED', 'QUALITY_DISCREPANCY'].includes(r.status);
      } else if (statusFilter === 'UNCERTAIN') {
        matchesStatus = ['UNCERTAIN', 'PENDING_REVIEW'].includes(r.status);
      } else {
        matchesStatus = r.status === statusFilter;
      }

      return matchesSearch && matchesStatus;
    });
  }, [records, searchTerm, statusFilter]);

  const handleMetricCardClick = (filter: string) => {
    setStatusFilter(filter);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
          Receiving Operations Dashboard
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
          Real-time visibility across all supplier shipments, dock receipts, and discrepancy reconciliation.
        </p>
      </div>

      {/* KPI Metrics Banner */}
      <MetricsBanner
        records={records}
        onFilterClick={handleMetricCardClick}
        activeFilter={statusFilter}
      />

      {/* Filter and Search Bar */}
      <div
        className="card-panel"
        style={{ marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#0f172a' }}
      >
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 300px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.4rem' }}
              placeholder="Search by PO #, Supplier, SKU, Unit ID, Record ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Status Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={16} style={{ color: '#94a3b8' }} />
            <select
              className="form-select"
              style={{ minWidth: '180px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Receipts ({records.length})</option>
              <option value="MATCHED">Matched (100%)</option>
              <option value="SHORT_RECEIVED">Short Received</option>
              <option value="OVER_RECEIVED">Over Received</option>
              <option value="DISCREPANCIES">Quarantine Discrepancies</option>
              <option value="WRONG_PRODUCT">Wrong Product / SKU</option>
              <option value="DAMAGED">Physical Damage</option>
              <option value="QUALITY_DISCREPANCY">Quality Flags</option>
              <option value="UNCERTAIN">Uncertain / Review</option>
            </select>

            {(searchTerm || statusFilter !== 'ALL') && (
              <button
                className="btn-secondary"
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('ALL');
                }}
                title="Reset filters"
              >
                <RotateCcw size={14} />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Receipts Data Table */}
      <div className="card-panel">
        <div className="card-panel-header">
          <div className="card-panel-title">
            <span>Inbound Receipts Queue</span>
            <span
              className="font-mono"
              style={{
                fontSize: '0.75rem',
                backgroundColor: '#1e293b',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                color: '#94a3b8',
              }}
            >
              Showing {filteredRecords.length} of {records.length} records
            </span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Record / Unit</th>
                <th>PO Line</th>
                <th>Supplier</th>
                <th>Product / SKU</th>
                <th style={{ textAlign: 'right' }}>Expected</th>
                <th style={{ textAlign: 'right' }}>Received</th>
                <th style={{ textAlign: 'center' }}>Difference</th>
                <th>Status</th>
                <th>Condition / Flags</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    <AlertCircle size={28} style={{ margin: '0 auto 0.5rem auto', color: '#64748b' }} />
                    No receiving records matched the current search or status filter.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  return (
                    <tr key={r.recordId}>
                      {/* Record & Unit */}
                      <td>
                        <div className="font-mono" style={{ fontWeight: 600, color: '#38bdf8' }}>
                          {r.recordId}
                        </div>
                        <div className="font-mono" style={{ fontSize: '0.725rem', color: '#64748b' }}>
                          {r.unitId}
                        </div>
                      </td>

                      {/* PO Number & Line */}
                      <td>
                        <span className="font-mono" style={{ fontWeight: 600 }}>
                          {r.poNumber}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '4px' }}>
                          [L#{r.poLine}]
                        </span>
                      </td>

                      {/* Supplier */}
                      <td style={{ color: '#cbd5e1', fontSize: '0.825rem' }}>{r.supplier}</td>

                      {/* Product & SKU */}
                      <td>
                        <div style={{ fontWeight: 500, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.productTitle}
                        </div>
                        <div className="font-mono" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {r.sku}
                        </div>
                      </td>

                      {/* Expected Qty */}
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#94a3b8' }}>
                        {r.qtyOrdered}
                      </td>

                      {/* Received Qty */}
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f8fafc' }}>
                        {r.qtyReceived}
                      </td>

                      {/* Difference */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`delta-tag ${
                            r.qtyDifference === 0
                              ? 'delta-matched'
                              : r.qtyDifference < 0
                              ? 'delta-short'
                              : 'delta-over'
                          }`}
                          style={{ fontSize: '0.775rem' }}
                        >
                          {r.qtyDifference >= 0 ? `+${r.qtyDifference}` : r.qtyDifference}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <DiscrepancyBadge status={r.status} size="sm" />
                        {r.operatorOverride && (
                          <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: '2px' }}>
                            [Overridden: {r.operatorOverride.operatorId}]
                          </div>
                        )}
                      </td>

                      {/* Damage & Flags */}
                      <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {r.cartonDamage !== 'none' && (
                          <div>Carton: <strong style={{ color: '#f87171' }}>{r.cartonDamage}</strong></div>
                        )}
                        {r.unitDamage !== 'none' && (
                          <div>Unit: <strong style={{ color: '#f87171' }}>{r.unitDamage}</strong></div>
                        )}
                        {r.qualityFlags.length > 0 && (
                          <div style={{ color: '#e9d5ff' }}>Flags: {r.qualityFlags.join(', ')}</div>
                        )}
                        {r.cartonDamage === 'none' && r.unitDamage === 'none' && r.qualityFlags.length === 0 && (
                          <span style={{ color: '#34d399' }}>Pristine</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => setSelectedRecordForContract(r)}
                            title="View Cross-Pod Contract JSON"
                          >
                            <FileCode size={14} />
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => setSelectedRecordForOverride(r)}
                            title="Override Verdict"
                          >
                            <Edit3 size={14} />
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
