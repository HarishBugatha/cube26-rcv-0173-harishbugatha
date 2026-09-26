import React from 'react';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldCheck,
  FileCode,
  Edit3,
} from 'lucide-react';
import { ComparisonResult, DispositionAction } from '../types/receiving';
import { DiscrepancyBadge } from './DiscrepancyBadge';

interface ComparisonCardProps {
  comparison: ComparisonResult;
  expectedData: {
    poNumber: string;
    poLine: number;
    supplier: string;
    sku: string;
    asin?: string;
    productTitle: string;
    cartonsOrdered: number;
    unitsPerCartonOrdered: number;
    qtyOrdered: number;
  };
  receivedData: {
    receivedSku: string;
    cartonsReceived: number;
    unitsPerCartonCounted: number;
    qtyReceived: number;
    cartonDamage: string;
    unitDamage: string;
    qualityFlags: string[];
    operatorId: string;
  };
  onExportContract?: () => void;
  onOpenOverride?: () => void;
}

export const ComparisonCard: React.FC<ComparisonCardProps> = ({
  comparison,
  expectedData,
  receivedData,
  onExportContract,
  onOpenOverride,
}) => {
  const { status, qtyDifference, summaryExplanation, checks, disposition } = comparison;

  const getDispositionDetails = (action: DispositionAction) => {
    switch (action) {
      case 'ACCEPT_TO_PREP':
        return {
          label: 'ACCEPT & ROUTE TO PREP (STEP 02)',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.1)',
          desc: '100% compliant. Pallet cleared for Prep Manager compliance labeling.',
        };
      case 'ACCEPT_WITH_SHORTAGE':
        return {
          label: 'ACCEPT PARTIAL + LOG SHORTAGE CLAIM',
          color: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.1)',
          desc: `Accept ${receivedData.qtyReceived} units. Push discrepancy evidence to Recovery Manager for supplier deduction.`,
        };
      case 'HOLD_SURPLUS':
        return {
          label: 'HOLD SURPLUS IN DOCK BUFFER',
          color: '#818cf8',
          bg: 'rgba(99, 102, 241, 0.1)',
          desc: `Excess units (+${qtyDifference}) quarantined until procurement confirms PO amendment.`,
        };
      case 'HOLD_QUARANTINE_RECOVERY':
        return {
          label: 'HOLD IN QUARANTINE (CLAIMS QUEUE)',
          color: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.1)',
          desc: 'Blocked at dock. Forward photographic proof to Step 05 Recovery Manager for supplier dispute.',
        };
      case 'SUPERVISOR_REVIEW':
      default:
        return {
          label: 'HOLD FOR LEAD / SUPERVISOR INSPECTION',
          color: '#c7d2fe',
          bg: 'rgba(99, 102, 241, 0.1)',
          desc: 'Inconclusive visual evidence. Physical inspection required before release.',
        };
    }
  };

  const dispInfo = getDispositionDetails(disposition);

  return (
    <div className="card-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="card-panel-header">
        <div className="card-panel-title">
          <ShieldCheck size={18} style={{ color: '#38bdf8' }} />
          <span>Automated Receiving Comparison & Discrepancy Engine</span>
        </div>
        <DiscrepancyBadge status={status} size="md" />
      </div>

      <div className="card-panel-body" style={{ flex: 1 }}>
        {/* Core Side-by-Side Comparison Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1.25rem',
            padding: '1rem',
            backgroundColor: '#0a0f1d',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {/* Expected Section */}
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>PO Expected Line</span>
              <span className="font-mono" style={{ color: '#38bdf8' }}>
                {expectedData.poNumber} L#{expectedData.poLine}
              </span>
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>EXPECTED SKU:</div>
              <div
                className="font-mono"
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: '#f8fafc',
                }}
              >
                {expectedData.sku}
              </div>
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>ORDERED PACKAGING:</div>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                {expectedData.cartonsOrdered} cartons × {expectedData.unitsPerCartonOrdered} units
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>TOTAL ORDERED QTY:</div>
              <div
                className="font-mono"
                style={{
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  color: '#94a3b8',
                }}
              >
                {expectedData.qtyOrdered}{' '}
                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>units</span>
              </div>
            </div>
          </div>

          {/* Received Section */}
          <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: '1rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Observed / Received Physical
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>SCANNED SKU:</div>
              <div
                className="font-mono"
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: comparison.isSkuMatched ? '#34d399' : '#f87171',
                }}
              >
                {receivedData.receivedSku || '—'}
              </div>
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>COUNTED PACKAGING:</div>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                {receivedData.cartonsReceived} cartons × {receivedData.unitsPerCartonCounted} units
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>TOTAL RECEIVED QTY:</div>
              <div
                className="font-mono"
                style={{
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  color:
                    qtyDifference === 0
                      ? '#34d399'
                      : qtyDifference < 0
                      ? '#fbbf24'
                      : '#a5b4fc',
                }}
              >
                {receivedData.qtyReceived}{' '}
                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>units</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Mathematical Difference Breakdown */}
        <div
          style={{
            padding: '0.85rem 1rem',
            backgroundColor: '#111827',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.725rem', color: '#94a3b8', textTransform: 'uppercase' }}>
              Reconciliation Formula: difference = received - expected
            </div>
            <div className="font-mono" style={{ fontSize: '0.9rem', color: '#e2e8f0', marginTop: '2px' }}>
              {receivedData.qtyReceived} - {expectedData.qtyOrdered} ={' '}
              <span
                style={{
                  fontWeight: 700,
                  color:
                    qtyDifference === 0
                      ? '#34d399'
                      : qtyDifference < 0
                      ? '#fbbf24'
                      : '#a5b4fc',
                }}
              >
                {qtyDifference >= 0 ? `+${qtyDifference}` : qtyDifference} units
              </span>
            </div>
          </div>

          <div
            className={`delta-tag ${
              qtyDifference === 0
                ? 'delta-matched'
                : qtyDifference < 0
                ? 'delta-short'
                : 'delta-over'
            }`}
            style={{ fontSize: '0.875rem' }}
          >
            {qtyDifference === 0
              ? '✓ BALANCED (DIFF: 0)'
              : qtyDifference < 0
              ? `⚠ SHORT BY ${Math.abs(qtyDifference)} UNITS`
              : `⚠ SURPLUS OF +${qtyDifference} UNITS`}
          </div>
        </div>

        {/* Warehouse Disposition Recommendation */}
        <div
          style={{
            padding: '1rem',
            backgroundColor: dispInfo.bg,
            border: `1px solid ${dispInfo.color}`,
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.25rem',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              color: dispInfo.color,
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
          >
            RECOMMENDED DOCK DISPOSITION:
          </div>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: dispInfo.color,
              marginTop: '2px',
            }}
          >
            {dispInfo.label}
          </div>
          <div style={{ fontSize: '0.825rem', color: '#cbd5e1', marginTop: '4px' }}>
            {dispInfo.desc}
          </div>
        </div>

        {/* Individual Verification Checks Table */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              marginBottom: '0.5rem',
            }}
          >
            Detailed Receiving Inspection Checks
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {checks.map((chk) => (
              <div
                key={chk.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#0d1526',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '0.825rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {chk.verdict === 'PASS' ? (
                    <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                  ) : chk.verdict === 'FAIL' ? (
                    <XCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                  ) : (
                    <HelpCircle size={16} style={{ color: '#818cf8', flexShrink: 0 }} />
                  )}
                  <div>
                    <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{chk.name}:</span>{' '}
                    <span style={{ color: '#94a3b8' }}>{chk.details}</span>
                  </div>
                </div>

                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: '0.725rem',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    backgroundColor:
                      chk.verdict === 'PASS'
                        ? 'rgba(16, 185, 129, 0.2)'
                        : chk.verdict === 'FAIL'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : 'rgba(99, 102, 241, 0.2)',
                    color:
                      chk.verdict === 'PASS'
                        ? '#34d399'
                        : chk.verdict === 'FAIL'
                        ? '#f87171'
                        : '#a5b4fc',
                  }}
                >
                  {chk.verdict}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Explanation Alert */}
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#0f172a',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem',
            color: '#cbd5e1',
          }}
        >
          <span style={{ fontWeight: 600, color: '#38bdf8' }}>Agent Summary: </span>
          {summaryExplanation}
        </div>
      </div>

      {/* Action Footer */}
      {(onExportContract || onOpenOverride) && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: '#0a0f1d',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          {onOpenOverride && (
            <button className="btn-secondary" onClick={onOpenOverride} style={{ fontSize: '0.8rem' }}>
              <Edit3 size={14} />
              Operator Override (Honesty Rule)
            </button>
          )}

          {onExportContract && (
            <button className="btn-primary" onClick={onExportContract} style={{ fontSize: '0.8rem' }}>
              <FileCode size={14} />
              View Cross-Pod Contract JSON
            </button>
          )}
        </div>
      )}
    </div>
  );
};
