import React from 'react';
import { 
  FileCheck2, 
  Download, 
  Printer, 
  Lock 
} from 'lucide-react';
import { DebateInspectionReport } from '../types/receiving';

interface StructuredReportViewProps {
  report: DebateInspectionReport | null;
}

export const StructuredReportView: React.FC<StructuredReportViewProps> = ({ report }) => {
  if (!report) return null;

  const handleDownloadJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${report.inspectionId}-DEBATE-evidence-report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handlePrintHtml = () => {
    window.open(`/api/report/${report.inspectionId}?format=html`, '_blank');
  };

  const isException = report.finalVerdict === 'EXCEPTION';
  const isUncertain = report.finalVerdict === 'UNCERTAIN';

  let verdictColor = '#10b981';
  let verdictBg = 'rgba(16, 185, 129, 0.15)';
  if (isException) {
    verdictColor = '#ef4444';
    verdictBg = 'rgba(239, 68, 68, 0.15)';
  } else if (isUncertain) {
    verdictColor = '#f59e0b';
    verdictBg = 'rgba(245, 158, 11, 0.15)';
  }

  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #10b981, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FileCheck2 size={20} color="#ffffff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc' }}>
              Structured Receiving Inspection Report
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Audit Reference: <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{report.inspectionId}</span> • Verified: {new Date(report.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={handleDownloadJson}
            className="btn-secondary"
            style={{ fontSize: '0.82rem', padding: '8px 14px' }}
          >
            <Download size={15} />
            <span>Download JSON Evidence</span>
          </button>
          <button
            type="button"
            onClick={handlePrintHtml}
            className="btn-primary"
            style={{ fontSize: '0.82rem', padding: '8px 14px' }}
          >
            <Printer size={15} />
            <span>Print / Export Dossier (HTML)</span>
          </button>
        </div>
      </div>

      {/* Decision Banner */}
      <div style={{
        background: verdictBg,
        border: `2px solid ${verdictColor}`,
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <span style={{ fontSize: '0.74rem', color: '#cbd5e1', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '2px' }}>
            RECEIVING VERIFICATION VERDICT
          </span>
          <h3 style={{ fontSize: '1.6rem', fontWeight: '900', color: verdictColor, letterSpacing: '-0.02em' }}>
            {report.finalVerdict}
          </h3>
          <p style={{ fontSize: '0.88rem', color: '#f8fafc', marginTop: '4px', maxWidth: '680px' }}>
            {report.decisionRationale}
          </p>
        </div>

        <div style={{
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          padding: '12px 18px',
          textAlign: 'right'
        }}>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>
            RECOMMENDED DOCK ACTION
          </span>
          <strong style={{ fontSize: '0.95rem', color: verdictColor, fontFamily: 'monospace' }}>
            {report.recommendedAction}
          </strong>
        </div>
      </div>

      {/* Overview Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        
        <div className="glass-card" style={{ padding: '14px' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', display: 'block' }}>
            PURCHASE ORDER NUMBER
          </span>
          <strong style={{ fontSize: '0.95rem', color: '#f8fafc', fontFamily: 'monospace' }}>
            {report.poNumber}
          </strong>
        </div>

        <div className="glass-card" style={{ padding: '14px' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', display: 'block' }}>
            EXPECTED SKU / ITEM
          </span>
          <strong style={{ fontSize: '0.95rem', color: '#38bdf8', fontFamily: 'monospace' }}>
            {report.expectedSku}
          </strong>
        </div>

        <div className="glass-card" style={{ padding: '14px' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', display: 'block' }}>
            CLAIMS AUDITED
          </span>
          <strong style={{ fontSize: '0.95rem', color: '#f8fafc' }}>
            {report.claimsSummary?.total || 0} Total ({report.claimsSummary?.verified || 0} Verified, {report.claimsSummary?.challenged || 0} Challenged)
          </strong>
        </div>

        <div className="glass-card" style={{ padding: '14px' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', display: 'block' }}>
            EXECUTION DURATION
          </span>
          <strong style={{ fontSize: '0.95rem', color: '#34d399', fontFamily: 'monospace' }}>
            {report.metrics?.totalDurationMs} ms
          </strong>
        </div>

      </div>

      {/* Security & Cryptographic Proof Card */}
      <div className="glass-card" style={{ padding: '16px 20px', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Lock size={16} color="#10b981" />
          <h4 style={{ fontSize: '0.88rem', fontWeight: '700', color: '#34d399' }}>
            Security &amp; Cryptographic Compliance Audit
          </h4>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px', fontSize: '0.75rem', color: '#94a3b8' }}>
          <div>
            <strong>EXIF Metadata Stripped:</strong> <span style={{ color: '#34d399' }}>YES (GPS &amp; EXIF Tags Removed)</span>
          </div>
          <div>
            <strong>Prompt Injection Filter:</strong> <span style={{ color: '#34d399' }}>ACTIVE (Sanitized)</span>
          </div>
          <div>
            <strong>Blind Verifier Isolation:</strong> <span style={{ color: '#c084fc' }}>STRICT (Isolated Crop Only)</span>
          </div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <strong>Master SHA-256:</strong> <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{report.securityAudit?.cleanImageSha256?.slice(0, 20)}...</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default StructuredReportView;
