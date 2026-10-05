import React, { useState, useEffect } from 'react';
import { 
  Scale, 
  ShieldAlert, 
  ShieldCheck, 
  EyeOff, 
  Maximize2 
} from 'lucide-react';
import { DebatedClaim } from '../types/receiving';

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
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
        <Scale size={48} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '1.1rem', color: '#94a3b8', marginBottom: '6px' }}>Adversarial Verification Pipeline Idle</h3>
        <p style={{ fontSize: '0.85rem' }}>Select a PRD test scenario or upload receiving photos to initiate 3-Role DEBATE verification.</p>
      </div>
    );
  }

  const activeClaim = debatedClaims.find(c => c.claimId === activeTabClaimId) || debatedClaims[0];

  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Title & Classification Guide */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #a855f7, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--glow-purple)'
          }}>
            <Scale size={20} color="#ffffff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc' }}>
              PRD-3 DEBATE Adversarial Verification Pipeline
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Prosecutor vs. Defender vs. Isolated Blind Verifier (No PO context leaked)
            </p>
          </div>
        </div>

        {/* Claim status pills */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '0.74rem', padding: '3px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            VERIFIED → EXCEPTION
          </span>
          <span style={{ fontSize: '0.74rem', padding: '3px 8px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            CHALLENGED → UNCERTAIN
          </span>
          <span style={{ fontSize: '0.74rem', padding: '3px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            REJECTED → DISCARD
          </span>
        </div>
      </div>

      {/* Claim Selector Tabs */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '18px', borderBottom: '1px solid var(--border-subtle)' }}>
        {debatedClaims.map((claim) => {
          const isActive = claim.claimId === activeClaim.claimId;
          const statusBadgeClass = `claim-badge-${claim.status}`;

          return (
            <button
              type="button"
              key={claim.claimId}
              onClick={() => setActiveTabClaimId(claim.claimId)}
              style={{
                background: isActive ? 'rgba(30, 41, 59, 0.9)' : 'rgba(15, 23, 42, 0.6)',
                border: isActive ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '8px 14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{ fontSize: '0.82rem', fontWeight: isActive ? '700' : '500', color: isActive ? '#ffffff' : '#94a3b8' }}>
                {claim.claimId}: {claim.claimTitle.slice(0, 24)}...
              </span>
              <span className={statusBadgeClass} style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                {claim.status}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Claim Detail Header */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '20px', borderLeft: `4px solid ${activeClaim.status === 'VERIFIED' ? '#ef4444' : activeClaim.status === 'CHALLENGED' ? '#f59e0b' : '#10b981'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc' }}>
                {activeClaim.claimId}: {activeClaim.claimTitle}
              </h3>
              <span className={`claim-badge-${activeClaim.status}`} style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', fontWeight: '800' }}>
                {activeClaim.status}
              </span>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#cbd5e1', marginTop: '4px' }}>
              <strong>Classification Rationale:</strong> {activeClaim.classificationRationale}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onClaimClick(activeClaim)}
            className="btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
          >
            <Maximize2 size={14} />
            Inspect Dossier
          </button>
        </div>
      </div>

      {/* 3-Role Grid: Prosecutor, Defender, Blind Verifier */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '16px' }}>
        
        {/* ROLE 1: PROSECUTOR */}
        <div className="glass-card" style={{
          padding: '18px',
          borderTop: '3px solid #ef4444',
          background: 'rgba(239, 68, 68, 0.04)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ padding: '5px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
                <ShieldAlert size={16} />
              </div>
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f87171' }}>1. PROSECUTOR</h4>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Defect Advocate</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>CONFIDENCE</span>
              <strong style={{ fontSize: '0.9rem', color: '#f87171' }}>
                {((activeClaim.prosecutor?.confidence || 0.9) * 100).toFixed(0)}%
              </strong>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: '600', marginBottom: '8px' }}>
            {activeClaim.prosecutor?.thesis}
          </p>

          <ul style={{ paddingLeft: '16px', fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(activeClaim.prosecutor?.arguments || []).map((arg, idx) => (
              <li key={idx}>{arg}</li>
            ))}
          </ul>

          <div style={{ marginTop: '12px', padding: '8px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.6)', fontSize: '0.74rem', color: '#94a3b8' }}>
            <strong>Evidence Focus:</strong> {activeClaim.prosecutor?.evidenceFocus}
          </div>
        </div>

        {/* ROLE 2: DEFENDER */}
        <div className="glass-card" style={{
          padding: '18px',
          borderTop: '3px solid #0284c7',
          background: 'rgba(2, 132, 199, 0.04)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ padding: '5px', borderRadius: '6px', background: 'rgba(2, 132, 199, 0.2)', color: '#38bdf8' }}>
                <ShieldCheck size={16} />
              </div>
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#38bdf8' }}>2. DEFENDER</h4>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Counter-Advocate (Full Context)</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>PLAUSIBILITY</span>
              <strong style={{ fontSize: '0.9rem', color: '#38bdf8' }}>
                {((activeClaim.defender?.defensePlausibility || 0.3) * 100).toFixed(0)}%
              </strong>
            </div>
          </div>

          <div style={{
            display: 'inline-block',
            fontSize: '0.72rem',
            padding: '2px 8px',
            borderRadius: '4px',
            background: activeClaim.defender?.stance === 'CONCEDE_DEFECT' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(2, 132, 199, 0.15)',
            color: activeClaim.defender?.stance === 'CONCEDE_DEFECT' ? '#f87171' : '#38bdf8',
            fontWeight: '700',
            marginBottom: '8px'
          }}>
            STANCE: {activeClaim.defender?.stance}
          </div>

          <ul style={{ paddingLeft: '16px', fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(activeClaim.defender?.arguments || []).map((arg, idx) => (
              <li key={idx}>{arg}</li>
            ))}
          </ul>
        </div>

        {/* ROLE 3: BLIND VERIFIER (STRICT ISOLATION) */}
        <div className="glass-card" style={{
          padding: '18px',
          borderTop: '3px solid #a855f7',
          background: 'rgba(168, 85, 247, 0.05)',
          boxShadow: 'var(--glow-purple)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ padding: '5px', borderRadius: '6px', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' }}>
                <EyeOff size={16} />
              </div>
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#c084fc' }}>3. BLIND VERIFIER</h4>
                <span style={{ fontSize: '0.7rem', color: '#a855f7', fontWeight: '600' }}>
                  🔒 STRICT CROP ISOLATION
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>OBS. CONFIDENCE</span>
              <strong style={{ fontSize: '0.9rem', color: '#c084fc' }}>
                {((activeClaim.blindVerifier?.observationalConfidence || 0.95) * 100).toFixed(0)}%
              </strong>
            </div>
          </div>

          {/* Visual Crop Patch */}
          {activeClaim.evidence?.cropBase64 && (
            <div style={{
              background: '#090d16',
              borderRadius: '6px',
              border: '1px solid #475569',
              padding: '6px',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <img 
                src={activeClaim.evidence.cropBase64} 
                alt="Blind Isolated Patch" 
                style={{
                  width: '90px',
                  height: '65px',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  background: '#1e293b'
                }}
              />
              <div style={{ fontSize: '0.72rem', overflow: 'hidden' }}>
                <span style={{ color: '#a855f7', fontWeight: '700', display: 'block' }}>
                  ISOLATED IMAGE CROP
                </span>
                <span style={{ color: '#94a3b8', display: 'block' }}>
                  Size: {activeClaim.evidence.pixelCoords?.width}x{activeClaim.evidence.pixelCoords?.height}px
                </span>
                <span style={{ fontFamily: 'monospace', color: '#64748b', fontSize: '0.68rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  SHA: {activeClaim.evidence.cropHash?.slice(0, 16)}...
                </span>
              </div>
            </div>
          )}

          <div style={{ fontSize: '0.78rem', color: '#e2e8f0', marginBottom: '8px' }}>
            <strong>Independent Observations:</strong>
          </div>

          <ul style={{ paddingLeft: '16px', fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(activeClaim.blindVerifier?.observations || []).map((obs, idx) => (
              <li key={idx}>{obs}</li>
            ))}
          </ul>

          <div style={{ marginTop: '10px', padding: '6px 10px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', fontSize: '0.72rem', color: '#e9d5ff' }}>
            <strong>Proof of Isolation:</strong> Zero PO strings, claim titles, or prosecutor thesis was delivered to this verifier.
          </div>
        </div>

      </div>

    </div>
  );
};

export default DebatePipelineVisualizer;
