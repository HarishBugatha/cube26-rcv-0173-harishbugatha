import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { ReceivingRecord, ReceivingStatus, OperatorOverride } from '../types/receiving';
import { validateOverrideReason } from '../services/validation';
import { DiscrepancyBadge } from './DiscrepancyBadge';

interface OverrideModalProps {
  record: ReceivingRecord | null;
  onClose: () => void;
  onConfirmOverride: (override: OperatorOverride) => void;
  activeOperatorId: string;
}

export const OverrideModal: React.FC<OverrideModalProps> = ({
  record,
  onClose,
  onConfirmOverride,
  activeOperatorId,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!record) return null;

  const [newStatus, setNewStatus] = useState<ReceivingStatus>(
    record.status === 'MATCHED' ? 'SHORT_RECEIVED' : 'MATCHED'
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateOverrideReason(reason);
    if (!validation.isValid) {
      setError(validation.error || 'Mandatory justification required.');
      return;
    }

    const override: OperatorOverride = {
      originalStatus: record.status,
      newStatus,
      reason: reason.trim(),
      operatorId: activeOperatorId,
      timestamp: new Date().toISOString(),
    };

    onConfirmOverride(override);
    onClose();
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
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShieldAlert size={20} style={{ color: '#f59e0b' }} />
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                Operator Judgment Override
              </h2>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Engineering Honesty Rule: Overrides are preserved as data.
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#94a3b8' }} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#0a0f1d',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.25rem',
                fontSize: '0.825rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#94a3b8' }}>Record ID / Unit:</span>
                <span className="font-mono" style={{ color: '#38bdf8', fontWeight: 600 }}>
                  {record.recordId} ({record.unitId})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8' }}>Automated Agent Verdict:</span>
                <DiscrepancyBadge status={record.status} size="sm" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="override-status">
                New Supervised Verdict <span className="required">*</span>
              </label>
              <select
                id="override-status"
                className="form-select"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as ReceivingStatus)}
              >
                <option value="MATCHED">MATCHED (Accept to Prep)</option>
                <option value="SHORT_RECEIVED">SHORT_RECEIVED (Accept with Shortage)</option>
                <option value="OVER_RECEIVED">OVER_RECEIVED (Hold Surplus)</option>
                <option value="WRONG_PRODUCT">WRONG_PRODUCT (Hold Quarantine)</option>
                <option value="DAMAGED">DAMAGED (Hold Quarantine)</option>
                <option value="QUALITY_DISCREPANCY">QUALITY_DISCREPANCY (Hold Quarantine)</option>
                <option value="UNCERTAIN">UNCERTAIN (Supervisor Review)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="override-reason">
                Mandatory Operational Justification <span className="required">*</span>
              </label>
              <textarea
                id="override-reason"
                rows={3}
                className={`form-textarea ${error ? 'error' : ''}`}
                placeholder="Explain why automated comparison was overridden (e.g. Supplier sent pre-authorized replacement SKU PO-AMEND-12; carton crushed on exterior only, internal items verified pristine...)"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError(null);
                }}
              />
              {error && <div className="form-error-msg">{error}</div>}
            </div>

            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Authorized by active operator: <strong style={{ color: '#cbd5e1' }}>{activeOperatorId}</strong>. The record's SHA-256 content hash is recalculated and an override entry (original verdict, new verdict, reason) is appended to the audit hash chain.
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              <CheckCircle2 size={16} />
              Commit Override
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
