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
import { recordHasStatus } from '../services/comparisonEngine';

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
  // A record with several discrepancies (e.g. short + quality flag) counts in each tile,
  // matching what the dashboard filter shows for that tile.
  const total = records.length;
  const matched = records.filter((r) => r.status === 'MATCHED').length;
  const shortReceived = records.filter((r) => recordHasStatus(r, 'SHORT_RECEIVED')).length;
  const overReceived = records.filter((r) => recordHasStatus(r, 'OVER_RECEIVED')).length;
  const discrepancies = records.filter((r) =>
    (['WRONG_PRODUCT', 'DAMAGED', 'QUALITY_DISCREPANCY'] as const).some((s) => recordHasStatus(r, s))
  ).length;
  const uncertain = records.filter((r) => recordHasStatus(r, 'UNCERTAIN') || recordHasStatus(r, 'PENDING_REVIEW')).length;

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const tiles = [
    { id: 'ALL', title: 'Total receipts', value: total, sub: 'All supplier deliveries', icon: Boxes, color: 'var(--accent-cyan)', bar: 100 },
    { id: 'MATCHED', title: 'Matched', value: matched, sub: `${pct(matched)}% accepted to prep`, icon: PackageCheck, color: 'var(--ok)', bar: pct(matched) },
    { id: 'SHORT_RECEIVED', title: 'Short received', value: shortReceived, sub: 'Logged for recovery', icon: TrendingDown, color: 'var(--warn)', bar: pct(shortReceived) },
    { id: 'OVER_RECEIVED', title: 'Over received', value: overReceived, sub: 'Surplus on hold', icon: TrendingUp, color: 'var(--accent-indigo)', bar: pct(overReceived) },
    { id: 'DISCREPANCIES', title: 'Quarantined', value: discrepancies, sub: 'Wrong SKU, damage, spec', icon: AlertOctagon, color: 'var(--bad)', bar: pct(discrepancies) },
    { id: 'UNCERTAIN', title: 'Uncertain / review', value: uncertain, sub: 'Needs a supervisor', icon: HelpCircle, color: 'var(--warn)', bar: pct(uncertain) },
  ];

  return (
    <div className="metrics-grid" role="group" aria-label="Receiving metrics (select to filter)">
      {tiles.map(({ id, title, value, sub, icon: Icon, color, bar }) => (
        <button
          type="button"
          key={id}
          className={`metric-card ${activeFilter === id ? 'active-metric-card' : ''}`}
          onClick={() => onFilterClick && onFilterClick(id)}
          aria-pressed={activeFilter === id}
        >
          <div className="metric-header">
            <Icon size={15} style={{ color }} />
            <span className="metric-title">{title}</span>
          </div>
          <div className="metric-value">{value}</div>
          <div className="metric-subtitle">{sub}</div>
          <div className="metric-bar"><span style={{ width: `${bar}%`, background: color }} /></div>
        </button>
      ))}
    </div>
  );
};
