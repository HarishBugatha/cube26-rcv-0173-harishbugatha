import React, { useState, useEffect } from 'react';
import { X, Copy, Download, Check, FileJson } from 'lucide-react';
import { ReceivingRecord } from '../types/receiving';
import { buildEvidenceContract } from '../services/comparisonEngine';

interface CrossPodExportModalProps {
  record: ReceivingRecord | null;
  onClose: () => void;
}

export const CrossPodExportModal: React.FC<CrossPodExportModalProps> = ({
  record,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!record) return null;

  const contract = buildEvidenceContract(record);
  const jsonString = JSON.stringify(contract, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CUBE26_RCV_${record.unitId}_contract.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content" style={{ maxWidth: '720px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileJson size={20} style={{ color: '#38bdf8' }} />
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                Cross-Pod Evidence Contract Payload
              </h2>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Stage 01 Receiving ➔ Feeds Prep (02) and Recovery (05) Managers
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#94a3b8' }} aria-label="Close Modal">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#0a0f1d',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1rem',
              fontSize: '0.8rem',
              color: '#cbd5e1',
            }}
          >
            <strong>Standard Evidence Interoperability:</strong> This contract binds the physical inspection verdict to unit <code className="font-mono" style={{ color: '#38bdf8' }}>{record.unitId}</code>. Downstream pods consume this record to either enforce prep compliance or dispute supplier shortages.
          </div>

          <pre
            className="font-mono"
            style={{
              backgroundColor: '#070b14',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #1e293b',
              color: '#34d399',
              fontSize: '0.785rem',
              maxHeight: '380px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {jsonString}
          </pre>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleCopy}>
            {copied ? <Check size={16} style={{ color: '#10b981' }} /> : <Copy size={16} />}
            {copied ? 'Copied to Clipboard' : 'Copy JSON'}
          </button>
          <button className="btn-primary" onClick={handleDownload}>
            <Download size={16} />
            Download Contract (.json)
          </button>
        </div>
      </div>
    </div>
  );
};
