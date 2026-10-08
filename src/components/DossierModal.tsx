import React, { useEffect, useState } from 'react';
import { X, Gavel, ShieldCheck, EyeOff, ZoomIn, ZoomOut, Hash } from 'lucide-react';
import { DebatedClaim } from '../types/receiving';
import { ClaimStatusPill, HashField, Meter, checkName } from './ui';

interface DossierModalProps {
  claim: DebatedClaim | null;
  onClose: () => void;
  masterImageHash?: string;
}

export const DossierModal: React.FC<DossierModalProps> = ({ claim, onClose, masterImageHash }) => {
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!claim) return null;

  const coords = claim.evidence?.pixelCoords;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content dossier-modal fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dossier-title"
      >
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="page-eyebrow" style={{ marginBottom: 2 }}>
              Finding evidence · {claim.claimId} · {checkName(claim.claimType)}
            </div>
            <h2 id="dossier-title" style={{ fontSize: '1.1rem', fontWeight: 600 }}>{claim.claimTitle}</h2>
            <div style={{ marginTop: 6 }}>
              <ClaimStatusPill status={claim.status} showMeaning />
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-icon" aria-label="Close" autoFocus style={{ flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body stack" style={{ gap: 16 }}>
          {/* Expected vs observed */}
          <div className="kv-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div>
              <div className="kv-label">Expected (purchase order)</div>
              <div className="small" style={{ marginTop: 2 }}>{claim.poExpected || '—'}</div>
            </div>
            <div>
              <div className="kv-label">Observed</div>
              <div className={`small eo-observed s-${claim.status}`} style={{ marginTop: 2 }}>{claim.physicalObserved || '—'}</div>
            </div>
          </div>

          <div className={`notice ${claim.status === 'VERIFIED' ? 'notice-error' : claim.status === 'REJECTED' ? 'notice-success' : ''}`}
            style={claim.status === 'CHALLENGED' ? { borderColor: 'var(--warn-border)', background: 'var(--warn-bg)', color: 'var(--warn-text)' } : undefined}
          >
            <div>
              <strong>Why this result: </strong>
              {claim.classificationRationale || '—'}
            </div>
          </div>

          {/* Crop + blind verifier */}
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="role-card" style={{ gap: 8 }}>
              <div className="row-between">
                <span className="form-label" style={{ margin: 0 }}>Isolated image crop</span>
                {claim.evidence?.cropBase64 && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setZoomLevel(zoomLevel === 1 ? 2 : 1)}>
                    {zoomLevel === 1 ? <ZoomIn size={13} /> : <ZoomOut size={13} />}
                    {zoomLevel === 1 ? 'Zoom 2×' : 'Fit'}
                  </button>
                )}
              </div>
              <div className="image-stage" style={{ aspectRatio: '4 / 3', maxHeight: 260 }}>
                {claim.evidence?.cropBase64 ? (
                  <img
                    src={claim.evidence.cropBase64}
                    alt={`Isolated crop for ${claim.claimId}`}
                    style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.2s ease' }}
                  />
                ) : (
                  <span className="image-stage-empty">No crop available</span>
                )}
              </div>
              {coords && (
                <div className="row xsmall dim mono" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span>x {coords.left}px</span>
                  <span>y {coords.top}px</span>
                  <span>w {coords.width}px</span>
                  <span>h {coords.height}px</span>
                </div>
              )}
            </div>

            <div className="role-card role-blind">
              <div className="role-head">
                <div className="role-name">
                  <span className="role-icon"><EyeOff size={15} /></span>
                  <div>
                    Blind Verifier
                    <div className="role-sub">Saw only the crop on the left</div>
                  </div>
                </div>
                <Meter label="Confidence" value={claim.blindVerifier?.observationalConfidence ?? 0} color="var(--role-blind)" />
              </div>
              <ul className="role-list">
                {(claim.blindVerifier?.observations || []).map((obs, idx) => (
                  <li key={idx}>{obs}</li>
                ))}
              </ul>
              {claim.blindVerifier?.independentVerdict && (
                <div className="small"><strong>Independent read:</strong> <span className="muted">{claim.blindVerifier.independentVerdict}</span></div>
              )}
              <div className="role-note">
                The prompt sent to this role contained no SKU, supplier, PO number or defect allegation.
              </div>
            </div>
          </div>

          {/* Prosecutor + defender */}
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="role-card role-prosecutor">
              <div className="role-head">
                <div className="role-name">
                  <span className="role-icon"><Gavel size={15} /></span>
                  <div>
                    Prosecutor
                    <div className="role-sub">Argues the defect exists</div>
                  </div>
                </div>
                <Meter label="Confidence" value={claim.prosecutor?.confidence ?? 0} color="var(--role-prosecutor)" />
              </div>
              <ul className="role-list">
                {(claim.prosecutor?.arguments || []).map((arg, i) => (
                  <li key={i}>{arg}</li>
                ))}
              </ul>
            </div>

            <div className="role-card role-defender">
              <div className="role-head">
                <div className="role-name">
                  <span className="role-icon"><ShieldCheck size={15} /></span>
                  <div>
                    Defender
                    <div className="role-sub">{String(claim.defender?.stance || '').replace(/_/g, ' ') || 'Counter-analysis'}</div>
                  </div>
                </div>
                <Meter label="Plausibility" value={claim.defender?.defensePlausibility ?? 0} color="var(--role-defender)" />
              </div>
              <ul className="role-list">
                {(claim.defender?.arguments || []).map((arg, i) => (
                  <li key={i}>{arg}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Hashes */}
          <div>
            <div className="form-label row" style={{ gap: 6 }}><Hash size={13} /> Content hashes (SHA-256)</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <HashField label="Source image" value={masterImageHash || claim.evidence?.masterImageHash} />
              <HashField label="This crop" value={claim.evidence?.cropHash} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default DossierModal;
