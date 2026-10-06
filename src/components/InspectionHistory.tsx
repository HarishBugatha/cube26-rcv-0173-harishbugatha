import React from 'react';
import { History, ChevronRight, CheckCircle2 } from 'lucide-react';
import { DebateInspectionReport, PRDScenarioPo, TenantId } from '../types/receiving';
import { VerdictPill, EmptyState } from './ui';
import { observedFeaturesOf } from '../services/inspectionRecord';
import { calculateDifference } from '../services/comparisonEngine';

/** One completed inspection kept for the current browser session (UI state only). */
export interface InspectionHistoryEntry {
  report: DebateInspectionReport;
  po: PRDScenarioPo;
  tenantId: TenantId;
  sourceLabel: string;
  rawImageUrl: string;
  ingested: boolean;
  /** Receiving record created from this inspection, once recorded. */
  recordId?: string;
}

interface InspectionHistoryProps {
  entries: InspectionHistoryEntry[];
  activeId?: string | null;
  onOpen: (inspectionId: string) => void;
  limit?: number;
  title?: string;
  action?: React.ReactNode;
}

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const InspectionHistory: React.FC<InspectionHistoryProps> = ({
  entries,
  activeId,
  onOpen,
  limit,
  title = 'Inspection history',
  action,
}) => {
  const shown = limit ? entries.slice(0, limit) : entries;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">
            <History size={16} />
            {title}
            {entries.length > 0 && <span className="chip">{entries.length}</span>}
          </div>
          <div className="panel-subtitle">Inspections run in this session for the current organisation.</div>
        </div>
        {action}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={History} title="No inspections yet">
          Completed inspections will be listed here.
        </EmptyState>
      ) : (
        <div className="history-list">
          {shown.map((entry) => {
            const r = entry.report;
            const observed = observedFeaturesOf(r, entry.po);
            const qtyText =
              typeof observed.itemsDetected === 'number'
                ? (() => {
                    const diff = calculateDifference(observed.itemsDetected, Number(r.expectedQuantity));
                    return `qty ${observed.itemsDetected}/${r.expectedQuantity} (${diff > 0 ? `+${diff}` : diff})`;
                  })()
                : 'not visually verified';
            return (
              <button
                type="button"
                key={r.inspectionId}
                className={`history-item ${activeId === r.inspectionId ? 'active' : ''}`}
                onClick={() => onOpen(r.inspectionId)}
              >
                <VerdictPill verdict={r.finalVerdict} />
                <div style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                    {entry.sourceLabel}
                  </div>
                  <div className="truncate xsmall dim mono">
                    {r.poNumber} · {r.expectedSku} · {qtyText}
                    {entry.recordId ? ` · ${entry.recordId}` : ` · ${r.inspectionId}`}
                  </div>
                </div>
                <div className="row xsmall dim" style={{ gap: 6 }}>
                  {entry.ingested && (
                    <span title="Recorded to receiving log" style={{ color: 'var(--ok-text)', display: 'inline-flex' }}>
                      <CheckCircle2 size={14} />
                    </span>
                  )}
                  <span>{formatTime(r.timestamp)}</span>
                  <ChevronRight size={14} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default InspectionHistory;
