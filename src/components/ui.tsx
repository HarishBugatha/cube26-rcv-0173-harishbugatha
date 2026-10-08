import React, { useState } from 'react';
import { CheckCircle2, AlertOctagon, HelpCircle, Copy, Check } from 'lucide-react';
import { ClaimStatus, PRDVerdict } from '../types/receiving';

/** Plain-language meaning of each final verdict, shown wherever a verdict appears. */
export const VERDICT_META: Record<PRDVerdict, { label: string; meaning: string; icon: React.ElementType; tone: 'ok' | 'bad' | 'warn' }> = {
  ACCEPT: {
    label: 'Accept',
    meaning: 'Shipment matches the purchase order. Release to inventory.',
    icon: CheckCircle2,
    tone: 'ok',
  },
  EXCEPTION: {
    label: 'Exception',
    meaning: 'Discrepancy verified. Hold and quarantine for a supplier claim.',
    icon: AlertOctagon,
    tone: 'bad',
  },
  UNCERTAIN: {
    label: 'Uncertain',
    meaning: 'Evidence is inconclusive. Route to a dock supervisor for manual inspection.',
    icon: HelpCircle,
    tone: 'warn',
  },
};

export const CLAIM_STATUS_META: Record<ClaimStatus, { meaning: string; tone: 'ok' | 'bad' | 'warn' }> = {
  VERIFIED: { meaning: 'Issue confirmed', tone: 'bad' },
  CHALLENGED: { meaning: 'Inconclusive', tone: 'warn' },
  REJECTED: { meaning: 'Cleared', tone: 'ok' },
};

/** Human-readable name of the check behind each claim type emitted by the engine. */
export const CHECK_NAMES: Record<string, string> = {
  QUANTITY_SHORTAGE: 'Quantity',
  QUANTITY_OVERAGE: 'Quantity',
  AMBIGUOUS_LABEL: 'Label legibility',
  SKU_MISMATCH: 'SKU identity',
  VARIANT_MISMATCH: 'Variant / spec',
  PACKAGING_CRUSH: 'Carton condition',
  WATER_DAMAGE: 'Carton condition',
  TORN_PACKAGING_BROKEN_SEAL: 'Seal & packaging',
  MISSING_COMPONENT: 'Kit completeness',
  NOMINAL_COMPLIANCE: 'Overall conformance',
  VISUAL_VERIFICATION_UNAVAILABLE: 'Visual verification',
  QUANTITY_UNDETERMINED: 'Quantity',
  VARIANT_UNDETERMINED: 'Variant / spec',
  COMPONENTS_UNDETERMINED: 'Kit completeness',
  UNRECONCILED_FINDING: 'Unreconciled finding',
  PACKAGING_UNCLEAR: 'Carton condition',
};

export const checkName = (claimType: string) =>
  CHECK_NAMES[claimType] || claimType.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const VerdictPill: React.FC<{ verdict: PRDVerdict; size?: 'md' | 'lg' }> = ({ verdict, size = 'md' }) => {
  const meta = VERDICT_META[verdict] || VERDICT_META.UNCERTAIN;
  const Icon = meta.icon;
  return (
    <span className={`pill pill-${meta.tone} ${size === 'lg' ? 'pill-lg' : ''}`} title={meta.meaning}>
      <Icon size={size === 'lg' ? 14 : 12} />
      {verdict}
    </span>
  );
};

export const ClaimStatusPill: React.FC<{ status: ClaimStatus; showMeaning?: boolean }> = ({ status, showMeaning }) => {
  const meta = CLAIM_STATUS_META[status] || CLAIM_STATUS_META.CHALLENGED;
  return (
    <span className={`pill pill-${meta.tone}`} title={meta.meaning}>
      {status}
      {showMeaning && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· {meta.meaning}</span>}
    </span>
  );
};

export const Meter: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <span className="meter-value" style={{ color }}>{pct.toFixed(0)}%</span>
      <span className="meter-track"><span style={{ width: `${pct}%`, background: color }} /></span>
    </div>
  );
};

export const HashField: React.FC<{ label: string; value?: string; style?: React.CSSProperties }> = ({ label, value, style }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => undefined
    );
  };
  return (
    <div className="hash-field" style={style}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <span className="hash-field-label">{label}</span>
        <span className="hash-field-value" title={value}>{value || '—'}</span>
      </div>
      {value && (
        <button type="button" className="btn-ghost btn-icon" onClick={handleCopy} title={copied ? 'Copied' : 'Copy to clipboard'} aria-label={`Copy ${label}`}>
          {copied ? <Check size={14} color="var(--ok-text)" /> : <Copy size={14} />}
        </button>
      )}
    </div>
  );
};

export const EmptyState: React.FC<{ icon: React.ElementType; title: string; children?: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div className="empty-state">
    <Icon size={36} />
    <h3>{title}</h3>
    {children && <p>{children}</p>}
  </div>
);
