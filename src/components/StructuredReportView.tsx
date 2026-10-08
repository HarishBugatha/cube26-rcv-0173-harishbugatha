import React from 'react';
import {
  Download,
  Printer,
  ArrowRightCircle,
  CheckCircle2,
  ShieldCheck,
  ListChecks,
  ChevronRight,
  LayoutDashboard,
} from 'lucide-react';
import { DebateInspectionReport, DebatedClaim, PRDScenarioPo, TenantId } from '../types/receiving';
import { VERDICT_META, ClaimStatusPill, HashField, checkName } from './ui';
import { observedFeaturesOf, isVisuallyVerified } from '../services/inspectionRecord';
import { calculateDifference } from '../services/comparisonEngine';

interface StructuredReportViewProps {
  report: DebateInspectionReport | null;
  po: PRDScenarioPo;
  tenantId: TenantId;
  ingested: boolean;
  recordId?: string;
  onIngest: () => void;
  onViewDashboard: () => void;
  onClaimClick: (claim: DebatedClaim) => void;
}

const ACTION_LABELS: Record<string, string> = {
  RELEASE_TO_INVENTORY: 'Release to inventory',
  HOLD_AND_QUARANTINE: 'Hold & quarantine',
  MANUAL_INSPECTION_REQUIRED: 'Manual inspection',
};

export const StructuredReportView: React.FC<StructuredReportViewProps> = ({
  report,
  po,
  tenantId,
  ingested,
  recordId,
  onIngest,
  onViewDashboard,
  onClaimClick,
}) => {
  if (!report) return null;

  const observed = observedFeaturesOf(report, po);
  const verified = isVisuallyVerified(report, po);
  const qtyDiff = verified ? calculateDifference(observed.itemsDetected as number, Number(report.expectedQuantity)) : null;

  const meta = VERDICT_META[report.finalVerdict] || VERDICT_META.UNCERTAIN;
  const VerdictIcon = meta.icon;
  const summary = report.claimsSummary || { total: 0, verified: 0, challenged: 0, rejected: 0 };

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${report.inspectionId}-DEBATE-evidence-report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handlePrintHtml = () => {
    // The server only returns a report to the organisation that owns it
    window.open(`/api/report/${encodeURIComponent(report.inspectionId)}?format=html&org=${encodeURIComponent(tenantId)}`, '_blank', 'noopener');
  };

  return (
    <section className="stack fade-in" style={{ gap: 16 }} aria-label="Inspection result">
      {/* Verdict */}
      <div className={`verdict-banner v-${report.finalVerdict}`} role="status">
        <div className={`stamp v-${report.finalVerdict}`} key={report.inspectionId} aria-hidden="true">
          <span className="stamp-word">{report.finalVerdict}</span>
          <span className="stamp-sub">{report.inspectionId.replace(/^INSP-/, '')}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="page-eyebrow" style={{ marginBottom: 2 }}>
            <VerdictIcon size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            Inspection verdict · {report.finalVerdict}
          </div>
          <div className="verdict-meaning" style={{ fontWeight: 700, fontSize: '1rem' }}>{meta.meaning}</div>
          <div className="verdict-rationale">{report.decisionRationale}</div>
        </div>
        <div className="verdict-actions stack" style={{ gap: 8, alignItems: 'stretch' }}>
          {ingested ? (
            <>
              <span className="notice notice-success" style={{ padding: '7px 10px' }}>
                <CheckCircle2 size={15} />
                {recordId ? `Recorded as ${recordId}` : `Recorded to ${tenantId}`}
              </span>
              <button type="button" className="btn-secondary" onClick={onViewDashboard}>
                <LayoutDashboard size={15} />
                View on dashboard
              </button>
            </>
          ) : verified ? (
            <button type="button" className="btn-primary" onClick={onIngest}>
              <ArrowRightCircle size={15} />
              Record to receiving log
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={onIngest} data-testid="record-pending">
                <ArrowRightCircle size={15} />
                Record as pending review
              </button>
              <span className="xsmall muted" style={{ maxWidth: 260 }}>
                Verification was not completed, so no received count is recorded. A supervisor must count and confirm.
              </span>
            </>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn-secondary btn-sm" style={{ flex: 1 }} onClick={handleDownloadJson} title="Download the full evidence report as JSON">
              <Download size={14} />
              JSON
            </button>
            <button type="button" className="btn-secondary btn-sm" style={{ flex: 1 }} onClick={handlePrintHtml} title="Open a printable HTML report">
              <Printer size={14} />
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Verification not completed (fail open) */}
      {report.verification && report.verification.status === 'INCOMPLETE' && (
        <div className="notice" role="alert" data-testid="verification-incomplete"
          style={{ borderColor: 'var(--warn-border)', background: 'var(--warn-bg)', color: 'var(--warn-text)' }}>
          <div>
            <strong>Verification not completed.</strong> The result is UNCERTAIN and cannot become ACCEPT.
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {report.verification.reasons.map((r, i) => (
                <li key={i}>
                  <span className="mono">{r.stage}</span> — {r.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Key facts */}
      <div className="kv-grid">
        <div>
          <div className="kv-label">Recommended action</div>
          <div className="kv-value">{ACTION_LABELS[report.recommendedAction] || report.recommendedAction}</div>
        </div>
        <div>
          <div className="kv-label">Purchase order</div>
          <div className={`kv-value ${report.poNumber ? 'mono' : 'dim'}`}>{report.poNumber || 'Not provided'}</div>
        </div>
        <div>
          <div className="kv-label">Expected SKU</div>
          <div className="kv-value mono">{report.expectedSku}</div>
        </div>
        <div>
          <div className="kv-label">Supplier</div>
          <div className={`kv-value ${report.vendor ? '' : 'dim'}`} title={report.vendor}>{report.vendor || 'Not provided'}</div>
        </div>
        <div>
          <div className="kv-label">Findings</div>
          <div className="kv-value">
            <span style={{ color: 'var(--bad-text)' }}>{summary.verified} verified</span>
            <span className="dim"> · </span>
            <span style={{ color: 'var(--warn-text)' }}>{summary.challenged} challenged</span>
            <span className="dim"> · </span>
            <span style={{ color: 'var(--ok-text)' }}>{summary.rejected} cleared</span>
          </div>
        </div>
        <div>
          <div className="kv-label">Inspection ID</div>
          <div className="kv-value mono" title={`${report.inspectionId} · ${new Date(report.timestamp).toLocaleString()}`}>
            {report.inspectionId}
          </div>
        </div>
      </div>

      {/* Expected vs observed */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <ListChecks size={16} />
              Expected vs observed
            </div>
            <div className="panel-subtitle">One row per finding. Select a row to see the full evidence and the role-by-role reasoning.</div>
          </div>
          <div className="legend">
            <span><span className="status-dot status-dot-VERIFIED" />Verified → Exception</span>
            <span><span className="status-dot status-dot-CHALLENGED" />Challenged → Uncertain</span>
            <span><span className="status-dot status-dot-REJECTED" />Rejected → cleared</span>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table eo-table">
            <thead>
              <tr>
                <th style={{ width: '18%' }}>Check</th>
                <th style={{ width: '27%' }}>Expected (PO)</th>
                <th>Observed</th>
                <th style={{ width: 120 }}>Result</th>
                <th style={{ width: 40 }} aria-label="Open evidence" />
              </tr>
            </thead>
            <tbody>
              {report.debatedClaims.map((claim) => (
                <tr
                  key={claim.claimId}
                  className="row-clickable"
                  onClick={() => onClaimClick(claim)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onClaimClick(claim);
                  }}
                >
                  <td>
                    <div className="eo-check">{checkName(claim.claimType)}</div>
                    <div className="xsmall dim mono">{claim.claimId}</div>
                  </td>
                  <td className="eo-expected">{claim.poExpected || '—'}</td>
                  <td className={`eo-observed s-${claim.status}`}>{claim.physicalObserved || '—'}</td>
                  <td><ClaimStatusPill status={claim.status} /></td>
                  <td className="dim"><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-footer xsmall muted" data-testid="quantity-summary">
          Expected quantity <strong className="mono" style={{ color: 'var(--text-main)' }}>{report.expectedQuantity}</strong>
          {' · '}Observed <strong className="mono" style={{ color: 'var(--text-main)' }}>{verified ? observed.itemsDetected : '— (not assessed)'}</strong>
          {qtyDiff !== null && (
            <>
              {' · '}Difference <strong className="mono" style={{ color: qtyDiff === 0 ? 'var(--ok-text)' : 'var(--warn-text)' }}>{qtyDiff > 0 ? `+${qtyDiff}` : qtyDiff}</strong>
            </>
          )}
          {' · '}Variant <strong style={{ color: 'var(--text-main)' }}>{po.expectedVariant || '—'}</strong>
          {po.expectedComponents && po.expectedComponents.length > 0 && <>{' · '}Kit: {po.expectedComponents.join(', ')}</>}
        </div>
      </div>

      {/* Evidence integrity */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <ShieldCheck size={16} />
              Evidence integrity
            </div>
            <div className="panel-subtitle">
              SHA-256 content hashes let anyone check that the photo and crops have not changed since this inspection.
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span className={`pill ${report.securityAudit?.metadataStripped ? 'pill-ok' : 'pill-neutral'}`}>EXIF stripped</span>
            <span className={`pill ${report.securityAudit?.textSanitizationApplied ? 'pill-ok' : 'pill-neutral'}`}>Text sanitised</span>
            <span className={`pill ${report.securityAudit?.isolationProtocolEnforced ? 'pill-ok' : 'pill-neutral'}`}>Blind crop isolation</span>
          </div>
        </div>
        <div className="panel-body grid-2">
          <HashField label="Uploaded image (raw bytes)" value={report.securityAudit?.rawImageSha256} />
          <HashField label="Inspected working copy (EXIF stripped)" value={report.securityAudit?.cleanImageSha256} />
        </div>
      </div>
    </section>
  );
};

export default StructuredReportView;
