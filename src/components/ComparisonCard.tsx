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
  const { status, qtyDifference, summaryExplanation, checks, disposition, isSkuMatched } = comparison;

  const getDispositionDetails = (action: DispositionAction) => {
    switch (action) {
      case 'ACCEPT_TO_PREP':
        return {
          label: 'ACCEPT & ROUTE TO PREP (STEP 02)',
          color: 'var(--ok)',
          bg: 'var(--ok-bg)',
          border: 'var(--ok)',
          desc: '100% compliant. Pallet cleared for Prep Manager compliance labeling.',
        };
      case 'ACCEPT_WITH_SHORTAGE':
        return {
          label: 'ACCEPT PARTIAL + LOG SHORTAGE CLAIM',
          color: 'var(--warn-text)',
          bg: 'var(--warn-bg)',
          border: 'var(--warn)',
          desc: `Accept ${receivedData.qtyReceived} units. Push shortage evidence to Recovery Manager for supplier deduction.`,
        };
      case 'HOLD_SURPLUS':
        return {
          label: 'HOLD SURPLUS IN DOCK BUFFER',
          color: 'var(--over-text)',
          bg: 'var(--over-bg)',
          border: 'var(--over)',
          desc: `Excess units (+${qtyDifference}) quarantined until procurement confirms PO amendment.`,
        };
      case 'HOLD_QUARANTINE_RECOVERY':
        return {
          label: 'HOLD IN QUARANTINE (CLAIMS QUEUE)',
          color: 'var(--bad-text)',
          bg: 'var(--bad-bg)',
          border: 'var(--bad)',
          desc: 'Blocked at dock. Forward photographic proof to Step 05 Recovery Manager for supplier dispute.',
        };
      case 'SUPERVISOR_REVIEW':
      default:
        return {
          label: 'HOLD FOR LEAD / SUPERVISOR INSPECTION',
          color: 'var(--over-text)',
          bg: 'var(--over-bg)',
          border: 'var(--over)',
          desc: 'Inconclusive visual evidence. Physical inspection required before release.',
        };
    }
  };

  const dispInfo = getDispositionDetails(disposition);

  return (
    <div className="card-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="card-panel-header">
        <div className="card-panel-title">
          <ShieldCheck size={19} style={{ color: 'var(--info-text)' }} />
          <span>Automated Receiving Reconciliation</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            PO: {expectedData.poNumber} [L#{expectedData.poLine}]
          </span>
          <DiscrepancyBadge status={status} size="sm" />
        </div>
      </div>

      <div className="card-panel-body" style={{ flex: 1 }}>
        {/* ========================================================
            PRIMARY INBOUND TELEMETRY HUD (The 4 Critical Signals)
            EXPECTED | RECEIVED | DIFFERENCE | STATUS
           ======================================================== */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.75rem',
            marginBottom: '1.25rem',
          }}
          className="telemetry-grid"
        >
          {/* 1. EXPECTED */}
          <div
            style={{
              backgroundColor: 'var(--bg-inset)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              1. EXPECTED
            </div>
            <div className="font-mono" style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-muted)', lineHeight: 1.1, margin: '4px 0' }}>
              {expectedData.qtyOrdered} <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>units</span>
            </div>
            <div className="font-mono" style={{ fontSize: '0.725rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {expectedData.sku}
            </div>
          </div>

          {/* 2. RECEIVED */}
          <div
            style={{
              backgroundColor: 'var(--bg-inset)',
              border: `1px solid ${isSkuMatched ? 'var(--border-subtle)' : 'var(--bad)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              2. RECEIVED
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: '1.65rem',
                fontWeight: 800,
                color: qtyDifference === 0 ? 'var(--ok-text)' : qtyDifference < 0 ? 'var(--warn-text)' : 'var(--over-text)',
                lineHeight: 1.1,
                margin: '4px 0',
              }}
            >
              {receivedData.qtyReceived} <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>units</span>
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: '0.725rem',
                color: isSkuMatched ? 'var(--ok-text)' : 'var(--bad-text)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {receivedData.receivedSku || 'NO SKU'}
            </div>
          </div>

          {/* 3. DIFFERENCE */}
          <div
            style={{
              backgroundColor: 'var(--bg-inset)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              3. DIFFERENCE
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: '1.65rem',
                fontWeight: 800,
                color: qtyDifference === 0 ? 'var(--ok-text)' : qtyDifference < 0 ? 'var(--warn-text)' : 'var(--over-text)',
                lineHeight: 1.1,
                margin: '4px 0',
              }}
            >
              {qtyDifference >= 0 ? `+${qtyDifference}` : qtyDifference}{' '}
              <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>units</span>
            </div>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
              {qtyDifference === 0 ? '✓ Balanced' : qtyDifference < 0 ? '⚠ Shortage' : '⚠ Surplus'}
            </div>
          </div>

          {/* 4. STATUS */}
          <div
            style={{
              backgroundColor: 'var(--bg-inset)',
              border: `1px solid ${dispInfo.border}`,
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              4. FINAL STATUS
            </div>
            <div style={{ margin: '4px 0' }}>
              <DiscrepancyBadge status={status} size="md" />
            </div>
            <div style={{ fontSize: '0.725rem', color: dispInfo.color, fontWeight: 600 }}>
              {status === 'MATCHED' ? '100% Compliant' : 'Discrepancy Action Required'}
            </div>
          </div>
        </div>

        {/* Live Mathematical Formula Strip */}
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-inset)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
              Mathematical Balance:
            </span>
            <span className="font-mono" style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
              {receivedData.qtyReceived} (received) - {expectedData.qtyOrdered} (expected) ={' '}
              <strong
                style={{
                  color: qtyDifference === 0 ? 'var(--ok-text)' : qtyDifference < 0 ? 'var(--warn-text)' : 'var(--over-text)',
                }}
              >
                {qtyDifference >= 0 ? `+${qtyDifference}` : qtyDifference} units
              </strong>
            </span>
          </div>

          <div
            className={`delta-tag ${
              qtyDifference === 0 ? 'delta-matched' : qtyDifference < 0 ? 'delta-short' : 'delta-over'
            }`}
            style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}
          >
            {qtyDifference === 0
              ? '✓ COUNT VERIFIED'
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
            border: `1px solid ${dispInfo.border}`,
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.725rem', color: dispInfo.color, fontWeight: 700, letterSpacing: '0.05em' }}>
              RECOMMENDED DOCK DISPOSITION:
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'var(--bg-inset)',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                color: dispInfo.color,
              }}
            >
              ACTION READY
            </span>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: dispInfo.color, marginTop: '2px' }}>
            {dispInfo.label}
          </div>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-main)', marginTop: '4px' }}>
            {dispInfo.desc}
          </div>
        </div>

        {/* Detailed 5-Point Inspection Checks Table */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div
            style={{
              fontSize: '0.775rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>5-Point Receiving Inspection Matrix</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Deterministic Rules Engine</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {checks.map((chk) => (
              <div
                key={chk.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6rem 0.85rem',
                  backgroundColor: 'var(--bg-inset)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.825rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {chk.verdict === 'PASS' ? (
                    <CheckCircle2 size={16} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                  ) : chk.verdict === 'FAIL' ? (
                    <XCircle size={16} style={{ color: 'var(--bad)', flexShrink: 0 }} />
                  ) : (
                    <HelpCircle size={16} style={{ color: 'var(--over)', flexShrink: 0 }} />
                  )}
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{chk.name}:</span>{' '}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{chk.details}</span>
                  </div>
                </div>

                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: '0.725rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor:
                      chk.verdict === 'PASS'
                        ? 'var(--ok-border)'
                        : chk.verdict === 'FAIL'
                        ? 'var(--bad-border)'
                        : 'var(--over-bg)',
                    color:
                      chk.verdict === 'PASS'
                        ? 'var(--ok-text)'
                        : chk.verdict === 'FAIL'
                        ? 'var(--bad-text)'
                        : 'var(--over-text)',
                  }}
                >
                  {chk.verdict}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Explanation */}
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem',
            color: 'var(--text-main)',
          }}
        >
          <span style={{ fontWeight: 700, color: 'var(--info-text)' }}>Agent Analysis: </span>
          {summaryExplanation}
        </div>
      </div>

      {/* Action Footer */}
      {(onExportContract || onOpenOverride) && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: 'var(--bg-inset)',
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
              Export Cross-Pod Evidence JSON
            </button>
          )}
        </div>
      )}
    </div>
  );
};
