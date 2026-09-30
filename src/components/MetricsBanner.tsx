import React from 'react';
import {
  PackageCheck,
  TrendingDown,
  TrendingUp,
  AlertOctagon,
  HelpCircle,
  Boxes,
} from 'lucide-react';
import { ReceivingRecord } from '../types/receiving';

interface MetricsBannerProps {
  records: ReceivingRecord[];
  onFilterClick?: (status: string) => void;
  activeFilter?: string;
}

export const MetricsBanner: React.FC<MetricsBannerProps> = ({
  records,
  onFilterClick,
  activeFilter = 'ALL',
}) => {
  const total = records.length;
  const matched = records.filter((r) => r.status === 'MATCHED').length;
  const shortReceived = records.filter((r) => r.status === 'SHORT_RECEIVED').length;
  const overReceived = records.filter((r) => r.status === 'OVER_RECEIVED').length;
  const discrepancies = records.filter((r) =>
    ['WRONG_PRODUCT', 'DAMAGED', 'QUALITY_DISCREPANCY'].includes(r.status)
  ).length;
  const uncertain = records.filter((r) =>
    ['UNCERTAIN', 'PENDING_REVIEW'].includes(r.status)
  ).length;

  const matchRate = total > 0 ? Math.round((matched / total) * 100) : 0;
  const discrepancyRate = total > 0 ? Math.round((discrepancies / total) * 100) : 0;

  return (
    <div className="metrics-grid" role="region" aria-label="Warehouse Receiving Metrics">
      {/* 1. Total PO Receipts */}
      <div
        className={`metric-card ${activeFilter === 'ALL' ? 'active-metric-card' : ''}`}
        style={{ cursor: onFilterClick ? 'pointer' : 'default' }}
        onClick={() => onFilterClick && onFilterClick('ALL')}
      >
        <div className="metric-header">
          <span className="metric-title">Total Inbound Receipts</span>
          <Boxes size={18} style={{ color: '#38bdf8' }} />
        </div>
        <div className="metric-value">{total}</div>
        <div className="metric-subtitle">Across active supplier deliveries</div>
        {/* Visual micro progress bar */}
        <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '100%', backgroundColor: '#38bdf8' }} />
        </div>
      </div>

      {/* 2. Matched (Clear to Prep) */}
      <div
        className={`metric-card ${activeFilter === 'MATCHED' ? 'active-metric-card' : ''}`}
        style={{ cursor: onFilterClick ? 'pointer' : 'default', borderLeft: '4px solid #10b981' }}
        onClick={() => onFilterClick && onFilterClick('MATCHED')}
      >
        <div className="metric-header">
          <span className="metric-title" style={{ color: '#34d399' }}>100% Matched</span>
          <PackageCheck size={18} style={{ color: '#34d399' }} />
        </div>
        <div className="metric-value" style={{ color: '#34d399' }}>{matched}</div>
        <div className="metric-subtitle">{matchRate}% perfect dock acceptance</div>
        <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${matchRate}%`, height: '100%', backgroundColor: '#10b981' }} />
        </div>
      </div>

      {/* 3. Short Received */}
      <div
        className={`metric-card ${activeFilter === 'SHORT_RECEIVED' ? 'active-metric-card' : ''}`}
        style={{ cursor: onFilterClick ? 'pointer' : 'default', borderLeft: '4px solid #f59e0b' }}
        onClick={() => onFilterClick && onFilterClick('SHORT_RECEIVED')}
      >
        <div className="metric-header">
          <span className="metric-title" style={{ color: '#fbbf24' }}>Short Received</span>
          <TrendingDown size={18} style={{ color: '#fbbf24' }} />
        </div>
        <div className="metric-value" style={{ color: '#fbbf24' }}>{shortReceived}</div>
        <div className="metric-subtitle">Under-shipments logged for recovery</div>
        <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${total > 0 ? (shortReceived / total) * 100 : 0}%`, height: '100%', backgroundColor: '#f59e0b' }} />
        </div>
      </div>

      {/* 4. Over Received */}
      <div
        className={`metric-card ${activeFilter === 'OVER_RECEIVED' ? 'active-metric-card' : ''}`}
        style={{ cursor: onFilterClick ? 'pointer' : 'default', borderLeft: '4px solid #818cf8' }}
        onClick={() => onFilterClick && onFilterClick('OVER_RECEIVED')}
      >
        <div className="metric-header">
          <span className="metric-title" style={{ color: '#a5b4fc' }}>Over Received</span>
          <TrendingUp size={18} style={{ color: '#a5b4fc' }} />
        </div>
        <div className="metric-value" style={{ color: '#a5b4fc' }}>{overReceived}</div>
        <div className="metric-subtitle">Surplus goods held in buffer</div>
        <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${total > 0 ? (overReceived / total) * 100 : 0}%`, height: '100%', backgroundColor: '#818cf8' }} />
        </div>
      </div>

      {/* 5. Discrepancies (Damage/Wrong SKU/Quality) */}
      <div
        className={`metric-card ${activeFilter === 'DISCREPANCIES' ? 'active-metric-card' : ''}`}
        style={{ cursor: onFilterClick ? 'pointer' : 'default', borderLeft: '4px solid #ef4444' }}
        onClick={() => onFilterClick && onFilterClick('DISCREPANCIES')}
      >
        <div className="metric-header">
          <span className="metric-title" style={{ color: '#f87171' }}>Quarantine Discrepancies</span>
          <AlertOctagon size={18} style={{ color: '#f87171' }} />
        </div>
        <div className="metric-value" style={{ color: '#f87171' }}>{discrepancies}</div>
        <div className="metric-subtitle">{discrepancyRate}% flagged: wrong SKU, damage, spec</div>
        <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${discrepancyRate}%`, height: '100%', backgroundColor: '#ef4444' }} />
        </div>
      </div>

      {/* 6. Uncertain / Under Review */}
      <div
        className={`metric-card ${activeFilter === 'UNCERTAIN' ? 'active-metric-card' : ''}`}
        style={{ cursor: onFilterClick ? 'pointer' : 'default', borderLeft: '4px solid #6366f1' }}
        onClick={() => onFilterClick && onFilterClick('UNCERTAIN')}
      >
        <div className="metric-header">
          <span className="metric-title" style={{ color: '#c7d2fe' }}>Uncertain / Review</span>
          <HelpCircle size={18} style={{ color: '#c7d2fe' }} />
        </div>
        <div className="metric-value" style={{ color: '#c7d2fe' }}>{uncertain}</div>
        <div className="metric-subtitle">Rule 4: Inconclusive verdicts</div>
        <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${total > 0 ? (uncertain / total) * 100 : 0}%`, height: '100%', backgroundColor: '#6366f1' }} />
        </div>
      </div>
    </div>
  );
};
