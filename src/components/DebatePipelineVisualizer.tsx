import React, { useState, useEffect } from 'react';
import {
  Scale,
  Gavel,
  ShieldCheck,
  EyeOff,
  Maximize2
} from 'lucide-react';
import { DebatedClaim } from '../types/receiving';
import { ClaimStatusPill, Meter, EmptyState, checkName } from './ui';

interface DebatePipelineVisualizerProps {
  debatedClaims?: DebatedClaim[];
  onClaimClick: (claim: DebatedClaim) => void;
}

export const DebatePipelineVisualizer: React.FC<DebatePipelineVisualizerProps> = ({
  debatedClaims = [],
  onClaimClick
}) => {
  const [activeTabClaimId, setActiveTabClaimId] = useState<string | null>(
    debatedClaims.length > 0 ? debatedClaims[0].claimId : null
  );

  // Sync active tab if claim list changes
  useEffect(() => {
    if (debatedClaims.length > 0 && (!activeTabClaimId || !debatedClaims.some(c => c.claimId === activeTabClaimId))) {
      setActiveTabClaimId(debatedClaims[0].claimId);
    }
  }, [debatedClaims, activeTabClaimId]);

  if (!debatedClaims || debatedClaims.length === 0) {
    return (
      <section className="panel">
        <EmptyState icon={Scale} title="No findings to review">
          Run an inspection to see the Prosecutor, Defender and Blind Verifier reasoning.
        </EmptyState>
      </section>
    );
  }

  const activeClaim = debatedClaims.find(c => c.claimId === activeTabClaimId) || debatedClaims[0];
  const prosecutorConfidence = activeClaim.prosecutor?.confidence ?? 0;
  const defenderPlausibility = activeClaim.defender?.defensePlausibility ?? 0;
  const blindConfidence = activeClaim.blindVerifier?.observationalConfidence ?? 0;
  const defenderConcedes = activeClaim.defender?.stance === 'CONCEDE_DEFECT';

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">
            <Scale size={16} />
            Verification breakdown
          </div>
          <div className="panel-subtitle">
            How each finding was argued, challenged and independently checked.
          </div>
        </div>
        <button type="button" onClick={() => onClaimClick(activeClaim)} className="btn-secondary btn-sm">
          <Maximize2 size={14} />
          Open full evidence
        </button>
      </div>

      <div className="panel-body stack" style={{ gap: 16 }}>
        {debatedClaims.length > 1 && (
          <div className="claim-tabs" role="tablist" aria-label="Findings">
            {debatedClaims.map((claim) => (
              <button
                type="button"
                role="tab"
                aria-selected={claim.claimId === activeClaim.claimId}
                key={claim.claimId}
                onClick={() => setActiveTabClaimId(claim.claimId)}
                className={`claim-tab ${claim.claimId === activeClaim.claimId ? 'active' : ''}`}
                title={claim.claimTitle}
              >
                <span className={`status-dot status-dot-${claim.status}`} aria-hidden="true" />
                {checkName(claim.claimType)}
              </button>
            ))}
          </div>
        )}

        {/* Finding summary */}
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span className="mono xsmall dim">{activeClaim.claimId}</span>
              <strong style={{ fontSize: '0.95rem', fontWeight: 600 }}>{activeClaim.claimTitle}</strong>
            </div>
            <p className="small muted" style={{ marginTop: 4 }}>
              {activeClaim.classificationRationale}
            </p>
          </div>
          <ClaimStatusPill status={activeClaim.status} showMeaning />
        </div>

        {/* Three roles */}
        <div className="role-grid">
          <div className="role-card role-prosecutor">
            <div className="role-head">
              <div className="role-name">
                <span className="role-icon"><Gavel size={15} /></span>
                <div>
                  Prosecutor
                  <div className="role-sub">Argues the defect exists</div>
                </div>
              </div>
              <Meter label="Confidence" value={prosecutorConfidence} color="var(--role-prosecutor)" />
            </div>
            {activeClaim.prosecutor?.thesis && (
              <p style={{ fontSize: '0.82rem', fontWeight: 500 }}>{activeClaim.prosecutor.thesis}</p>
            )}
            <ul className="role-list">
              {(activeClaim.prosecutor?.arguments || []).map((arg, idx) => (
                <li key={idx}>{arg}</li>
              ))}
            </ul>
            {activeClaim.prosecutor?.evidenceFocus && (
              <div className="role-note"><strong>Evidence focus:</strong> {activeClaim.prosecutor.evidenceFocus}</div>
            )}
          </div>

          <div className="role-card role-defender">
            <div className="role-head">
              <div className="role-name">
                <span className="role-icon"><ShieldCheck size={15} /></span>
                <div>
                  Defender
                  <div className="role-sub">Looks for innocent explanations</div>
                </div>
              </div>
              <Meter label="Plausibility" value={defenderPlausibility} color="var(--role-defender)" />
            </div>
            {activeClaim.defender?.stance && (
              <span className={`pill ${defenderConcedes ? 'pill-bad' : 'pill-info'}`} style={{ alignSelf: 'flex-start' }}>
                {activeClaim.defender.stance.replace(/_/g, ' ')}
              </span>
            )}
            <ul className="role-list">
              {(activeClaim.defender?.arguments || []).map((arg, idx) => (
                <li key={idx}>{arg}</li>
              ))}
            </ul>
          </div>

          <div className="role-card role-blind">
            <div className="role-head">
              <div className="role-name">
                <span className="role-icon"><EyeOff size={15} /></span>
                <div>
                  Blind Verifier
                  <div className="role-sub">Sees only the image crop</div>
                </div>
              </div>
              <Meter label="Confidence" value={blindConfidence} color="var(--role-blind)" />
            </div>

            {activeClaim.evidence?.cropBase64 && (
              <button type="button" className="crop-thumb" onClick={() => onClaimClick(activeClaim)} title="Open full evidence" style={{ textAlign: 'left' }}>
                <img src={activeClaim.evidence.cropBase64} alt={`Image crop for ${activeClaim.claimId}`} />
                <div style={{ minWidth: 0 }} className="xsmall">
                  <div style={{ fontWeight: 500, color: 'var(--text-main)' }}>Isolated crop</div>
                  <div className="dim">
                    {activeClaim.evidence.pixelCoords?.width} × {activeClaim.evidence.pixelCoords?.height} px
                  </div>
                  <div className="mono dim truncate">{activeClaim.evidence.cropHash?.slice(0, 16)}…</div>
                </div>
              </button>
            )}

            <ul className="role-list">
              {(activeClaim.blindVerifier?.observations || []).map((obs, idx) => (
                <li key={idx}>{obs}</li>
              ))}
            </ul>
            <div className="role-note">
              Received no PO number, SKU, claim text or Prosecutor output — only the cropped pixels.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DebatePipelineVisualizer;
