import React, { useState, useEffect } from 'react';
import {
  Hash,
  History,
  Building2,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { IntegrityReport, ReceivingRecord, TenantId } from '../types/receiving';
import { verifyIntegrity, getPersistenceStatus, resetToSampleData } from '../services/dataService';
import { CrossPodExportModal } from '../components/CrossPodExportModal';

interface AuditViewProps {
  records: ReceivingRecord[];
  tenantId: TenantId;
}

export const AuditView: React.FC<AuditViewProps> = ({ records, tenantId }) => {
  const [selectedRecordForContract, setSelectedRecordForContract] = useState<ReceivingRecord | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const persistence = getPersistenceStatus();

  // Re-run integrity verification whenever the tenant or its records change
  useEffect(() => {
    setIntegrity(verifyIntegrity(tenantId));
  }, [tenantId, records]);

  // Overridden records
  const overriddenRecords = records.filter((r) => !!r.operatorOverride);

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
          Evidence Traceability & Audit Verification
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
          Compliance with Engineering Rules 1 (Tenancy), 4 (Uncertainty), and Honesty Rules (Overrides as Data, Content Hashes).
        </p>
      </div>

      {/* Tenancy & Honesty Status Banner */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Tenancy Rule 1 Check */}
        <div className="card-panel" style={{ padding: '1.15rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <Building2 size={18} style={{ color: '#34d399' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399' }}>
              RULE 1: TENANCY ISOLATION VERIFIED
            </span>
          </div>
          <div style={{ fontSize: '0.825rem', color: '#cbd5e1' }}>
            Currently active scope: <code className="font-mono" style={{ color: '#38bdf8' }}>{tenantId}</code>.
            Only records matching this tenant are loaded into memory. Other tenants see zero rows.
          </div>
        </div>

        {/* Content Hashes Check */}
        <div className="card-panel" style={{ padding: '1.15rem', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <Hash size={18} style={{ color: '#60a5fa' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#60a5fa' }}>
              SHA-256 CONTENT HASH & HASH CHAIN
            </span>
          </div>
          <div style={{ fontSize: '0.825rem', color: '#cbd5e1' }}>
            Each record carries a SHA-256 content hash of its canonical content. Every record creation and override is appended to this organisation's hash chain, where each entry includes the previous entry's hash. Integrity verification recomputes both, so edits made outside the app are detected. This is tamper detection, not immutable storage: the chain is kept in this browser's storage, and someone with write access to it could rebuild the entire chain consistently.
          </div>
        </div>
      </div>

      {/* Integrity verification */}
      <div className="card-panel" style={{ marginBottom: '1.5rem' }} data-testid="integrity-panel">
        <div className="card-panel-header">
          <div className="card-panel-title">
            {integrity && !integrity.ok ? (
              <ShieldAlert size={18} style={{ color: 'var(--bad-text)' }} />
            ) : (
              <ShieldCheck size={18} style={{ color: 'var(--ok-text)' }} />
            )}
            <span>Integrity verification</span>
            {integrity && (
              <span className={integrity.ok ? 'pill pill-ok' : 'pill pill-bad'} data-testid="integrity-status">
                {integrity.ok ? 'PASS' : 'FAIL'}
              </span>
            )}
          </div>
          <button className="btn-secondary btn-sm" onClick={() => setIntegrity(verifyIntegrity(tenantId))}>
            <RefreshCw size={13} />
            Verify now
          </button>
        </div>
        {integrity && (
          <div className="card-panel-body" style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            <div>
              Checked <strong style={{ color: 'var(--text-main)' }}>{integrity.entriesChecked}</strong> hash-chain entries and{' '}
              <strong style={{ color: 'var(--text-main)' }}>{integrity.recordsChecked}</strong> records for{' '}
              <code className="font-mono">{integrity.orgId}</code> at {new Date(integrity.checkedAt).toLocaleTimeString()}.
            </div>
            <div className="font-mono" style={{ fontSize: '0.72rem', marginTop: 6, overflowWrap: 'anywhere' }}>
              Chain head: {integrity.headHash}
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 6 }} data-testid="persistence-status">
              {persistence.mode === 'browser-storage'
                ? 'Records and hash chain are saved in this browser (localStorage) and reloaded as stored, without re-hashing.'
                : 'Browser storage unavailable: records and hash chain are held in memory only and reset on reload.'}
            </div>
            {integrity.failures.length > 0 && (
              <ul style={{ marginTop: 10, paddingLeft: 18, color: 'var(--bad-text)' }}>
                {integrity.failures.slice(0, 10).map((f, i) => (
                  <li key={i}>
                    {f.kind}: {f.detail}
                  </li>
                ))}
                {integrity.failures.length > 10 && <li>…and {integrity.failures.length - 10} more</li>}
              </ul>
            )}
            {!integrity.ok && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem' }}>
                  The stored data is left exactly as found. Resetting discards it and reloads the sample data.
                </span>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    if (window.confirm('Discard the stored receiving data and hash chain, and reload the sample data? This cannot be undone.')) {
                      resetToSampleData();
                      window.location.reload();
                    }
                  }}
                >
                  Reset demo data
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Operator Overrides Section */}
      <div className="card-panel" style={{ marginBottom: '1.5rem' }}>
        <div className="card-panel-header">
          <div className="card-panel-title">
            <History size={18} style={{ color: '#f59e0b' }} />
            <span>Operator Override Audit Trail ("Overrides are Data")</span>
          </div>
          <span className="badge" style={{ backgroundColor: '#1e293b', color: '#fbbf24' }}>
            {overriddenRecords.length} OVERRIDES RECORDED
          </span>
        </div>

        <div className="card-panel-body">
          {overriddenRecords.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
              No operator overrides have been applied yet in this session. All decisions reflect the automated comparison engine.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {overriddenRecords.map((r) => {
                const ov = r.operatorOverride!;
                return (
                  <div
                    key={r.recordId}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#0a0f1d',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.5rem',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="font-mono" style={{ fontWeight: 700, color: '#38bdf8' }}>
                          {r.recordId}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          PO: {r.poNumber} L#{r.poLine}
                        </span>
                      </div>
                      <div className="font-mono" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Overridden at: {new Date(ov.timestamp).toLocaleString()} by {ov.operatorId}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', fontSize: '0.825rem' }}>
                      <div>
                        <span style={{ color: '#64748b' }}>Original Verdict: </span>
                        <strong style={{ color: '#f87171' }}>{ov.originalStatus}</strong>
                      </div>
                      <div>➔</div>
                      <div>
                        <span style={{ color: '#64748b' }}>Overridden Verdict: </span>
                        <strong style={{ color: '#34d399' }}>{ov.newStatus}</strong>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#111827',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        color: '#cbd5e1',
                        borderLeft: '3px solid #f59e0b',
                      }}
                    >
                      <strong style={{ color: '#fbbf24' }}>Justification Reason: </strong>
                      {ov.reason}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Content Hash Verification Table */}
      <div className="card-panel">
        <div className="card-panel-header">
          <div className="card-panel-title">
            <Hash size={18} style={{ color: '#38bdf8' }} />
            <span>SHA-256 content hashes</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Showing {Math.min(15, records.length)} of {records.length} records
          </span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Unit Join Key</th>
                <th>PO Line</th>
                <th>Status</th>
                <th>SHA-256 content hash</th>
                <th style={{ textAlign: 'center' }}>Contract</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 15).map((r) => (
                <tr key={r.recordId}>
                  <td className="font-mono" style={{ fontWeight: 600, color: '#38bdf8' }}>
                    {r.recordId}
                  </td>
                  <td className="font-mono" style={{ color: '#cbd5e1' }}>
                    {r.unitId}
                  </td>
                  <td className="font-mono">
                    {r.poNumber} #{r.poLine}
                  </td>
                  <td>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <code
                      className="font-mono"
                      style={{
                        fontSize: '0.75rem',
                        backgroundColor: '#0a0f1d',
                        padding: '0.2rem 0.4rem',
                        borderRadius: '4px',
                        color: '#34d399',
                        overflowWrap: 'anywhere',
                        display: 'inline-block',
                        maxWidth: 360,
                      }}
                    >
                      {r.contentHash}
                    </code>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={() => setSelectedRecordForContract(r)}
                    >
                      <FileCode size={13} />
                      JSON
                    </button>
                  </td>
                </tr>
              ))}
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
    </div>
  );
};
