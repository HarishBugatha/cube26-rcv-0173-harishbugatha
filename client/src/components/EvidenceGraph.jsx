import React, { useState } from 'react';
import { 
  GitFork, 
  ShieldAlert, 
  ShieldCheck, 
  EyeOff, 
  Image as ImageIcon, 
  Hash, 
  ChevronRight, 
  Maximize2, 
  Layers 
} from 'lucide-react';

export default function EvidenceGraph({ 
  evidenceGraph, 
  onClaimClick, 
  onVerdictClick 
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  if (!evidenceGraph || !evidenceGraph.nodes || evidenceGraph.nodes.length === 0) {
    return null;
  }

  const { nodes, edges, masterImageHash } = evidenceGraph;
  const verdictNode = nodes.find(n => n.type === 'VERDICT') || nodes[0];
  const claimNodes = nodes.filter(n => n.type === 'CLAIM');

  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0284c7, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--glow-cyan)'
          }}>
            <GitFork size={20} color="#ffffff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc' }}>
              Interactive Evidence Graph
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Verdict ➔ Claim ➔ Counter-argument ➔ Blind verification ➔ Image crop ➔ SHA-256 image hash
            </p>
          </div>
        </div>

        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
          Click on any node to inspect full cryptographic and adversarial dossier
        </div>
      </div>

      {/* Graph Visual Canvas */}
      <div style={{
        background: 'rgba(9, 13, 22, 0.85)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        padding: '24px',
        overflowX: 'auto'
      }}>
        <div style={{ minWidth: '820px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* LEVEL 1: ROOT VERDICT NODE */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              onClick={() => onVerdictClick && onVerdictClick(verdictNode)}
              className="glass-card glass-card-interactive"
              style={{
                padding: '14px 28px',
                borderRadius: '12px',
                border: `2px solid ${verdictNode.status === 'EXCEPTION' ? '#ef4444' : verdictNode.status === 'UNCERTAIN' ? '#f59e0b' : '#10b981'}`,
                background: verdictNode.status === 'EXCEPTION' ? 'rgba(239, 68, 68, 0.15)' : verdictNode.status === 'UNCERTAIN' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                boxShadow: verdictNode.status === 'EXCEPTION' ? 'var(--glow-red)' : verdictNode.status === 'UNCERTAIN' ? 'var(--glow-amber)' : 'var(--glow-emerald)',
                textAlign: 'center',
                cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.08em', display: 'block' }}>
                FINAL DECISION NODE
              </span>
              <strong style={{
                fontSize: '1.4rem',
                fontWeight: '800',
                color: verdictNode.status === 'EXCEPTION' ? '#fca5a5' : verdictNode.status === 'UNCERTAIN' ? '#fde68a' : '#6ee7b7'
              }}>
                {verdictNode.label}
              </strong>
              <p style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '4px' }}>
                {verdictNode.description}
              </p>
            </div>
          </div>

          {/* CONNECTOR DOWN */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '-12px 0' }}>
            <div style={{ width: '2px', height: '24px', background: '#475569' }}></div>
          </div>

          {/* LEVEL 2: CLAIM CARDS WITH COMPLETE ADVERSARIAL CHAIN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {claimNodes.map((claimNode, idx) => {
              const prosNode = nodes.find(n => n.id === `node-pros-${idx}`);
              const defNode = nodes.find(n => n.id === `node-def-${idx}`);
              const blindNode = nodes.find(n => n.id === `node-blind-${idx}`);
              const cropNode = nodes.find(n => n.id === `node-crop-${idx}`);

              const isFail = claimNode.status === 'VERIFIED';
              const isChallenged = claimNode.status === 'CHALLENGED';
              const isClean = claimNode.status === 'REJECTED';

              let borderColor = '#ef4444';
              let badgeColor = '#f87171';
              let bgGlow = 'rgba(239, 68, 68, 0.05)';
              if (isClean) {
                borderColor = '#10b981';
                badgeColor = '#34d399';
                bgGlow = 'rgba(16, 185, 129, 0.05)';
              } else if (isChallenged) {
                borderColor = '#f59e0b';
                badgeColor = '#fbbf24';
                bgGlow = 'rgba(245, 158, 11, 0.05)';
              }

              return (
                <div 
                  key={claimNode.id}
                  style={{
                    background: bgGlow,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '18px',
                    position: 'relative'
                  }}
                >
                  {/* Claim Banner (Clickable) */}
                  <div 
                    onClick={() => onClaimClick && onClaimClick({
                      claimId: claimNode.data.id,
                      claimTitle: claimNode.label,
                      status: claimNode.status,
                      severity: claimNode.severity,
                      poExpected: claimNode.data.expected,
                      physicalObserved: claimNode.data.observed,
                      classificationRationale: claimNode.data.rationale,
                      prosecutor: prosNode?.data,
                      defender: defNode?.data,
                      blindVerifier: blindNode?.data,
                      evidence: cropNode?.data
                    })}
                    className="glass-card glass-card-interactive"
                    style={{
                      padding: '12px 18px',
                      marginBottom: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: `1px solid ${borderColor}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: badgeColor, textTransform: 'uppercase' }}>
                          CLAIM NODE {idx + 1}
                        </span>
                        <strong style={{ fontSize: '0.95rem', color: '#ffffff' }}>
                          {claimNode.label}
                        </strong>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                        Observed: <span style={{ color: '#e2e8f0' }}>{claimNode.data?.observed}</span>
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`claim-badge-${claimNode.status}`} style={{ fontSize: '0.75rem', fontWeight: '800', padding: '4px 8px', borderRadius: '4px' }}>
                        {claimNode.status}
                      </span>
                      <Maximize2 size={16} color="#94a3b8" />
                    </div>
                  </div>

                  {/* Flow Chain Grid: Prosecutor -> Defender -> Blind Verifier -> Crop ROI */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 24px 1fr 24px 1.2fr 24px 1fr',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    
                    {/* Prosecutor Node */}
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '0.75rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontWeight: '700', marginBottom: '4px' }}>
                        <ShieldAlert size={14} />
                        <span>Prosecutor Argument</span>
                      </div>
                      <p style={{ color: '#cbd5e1', fontSize: '0.72rem', lineHeight: '1.3' }}>
                        {prosNode?.data?.arguments?.[0] || 'Alleges physical defect'}
                      </p>
                      <div style={{ marginTop: '6px', color: '#f87171', fontWeight: '600', fontSize: '0.7rem' }}>
                        P(pros): {((prosNode?.confidence || 0.9) * 100).toFixed(0)}%
                      </div>
                    </div>

                    <ChevronRight size={18} color="#64748b" style={{ margin: '0 auto' }} />

                    {/* Defender Counter-Argument Node */}
                    <div style={{
                      background: 'rgba(2, 132, 199, 0.1)',
                      border: '1px solid rgba(2, 132, 199, 0.4)',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '0.75rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: '700', marginBottom: '4px' }}>
                        <ShieldCheck size={14} />
                        <span>Counter-Argument</span>
                      </div>
                      <p style={{ color: '#cbd5e1', fontSize: '0.72rem', lineHeight: '1.3' }}>
                        {defNode?.data?.arguments?.[0] || 'Adversarial counter-evaluation'}
                      </p>
                      <div style={{ marginTop: '6px', color: '#38bdf8', fontWeight: '600', fontSize: '0.7rem' }}>
                        Stance: {defNode?.data?.stance}
                      </div>
                    </div>

                    <ChevronRight size={18} color="#64748b" style={{ margin: '0 auto' }} />

                    {/* Blind Verifier Node (Isolated) */}
                    <div style={{
                      background: 'rgba(168, 85, 247, 0.12)',
                      border: '1px solid rgba(168, 85, 247, 0.5)',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '0.75rem',
                      boxShadow: '0 0 12px rgba(168, 85, 247, 0.2)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#c084fc', fontWeight: '700', marginBottom: '4px' }}>
                        <EyeOff size={14} />
                        <span>Blind Verification (Crop Only)</span>
                      </div>
                      <p style={{ color: '#e9d5ff', fontSize: '0.72rem', lineHeight: '1.3' }}>
                        {blindNode?.data?.observations?.[0] || 'Unbiased visual observation'}
                      </p>
                      <div style={{ marginTop: '6px', color: '#c084fc', fontWeight: '600', fontSize: '0.7rem' }}>
                        Obs. Conf: {((blindNode?.confidence || 0.95) * 100).toFixed(0)}%
                      </div>
                    </div>

                    <ChevronRight size={18} color="#64748b" style={{ margin: '0 auto' }} />

                    {/* Image Crop Node */}
                    <div style={{
                      background: '#0f172a',
                      border: '1px solid #475569',
                      borderRadius: '8px',
                      padding: '8px',
                      textAlign: 'center',
                      fontSize: '0.72rem'
                    }}>
                      {cropNode?.data?.cropBase64 ? (
                        <img 
                          src={cropNode.data.cropBase64} 
                          alt="Crop ROI" 
                          style={{
                            width: '100%',
                            height: '50px',
                            objectFit: 'contain',
                            borderRadius: '4px',
                            marginBottom: '4px',
                            background: '#1e293b'
                          }}
                        />
                      ) : (
                        <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                          <ImageIcon size={20} />
                        </div>
                      )}
                      <span style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: '0.65rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        SHA: {cropNode?.sha256?.slice(0, 10)}...
                      </span>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          {/* CONNECTOR DOWN */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '-12px 0' }}>
            <div style={{ width: '2px', height: '24px', background: '#475569' }}></div>
          </div>

          {/* LEVEL 3: MASTER IMAGE HASH NODE */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="glass-card" style={{
              padding: '12px 24px',
              borderRadius: '10px',
              border: '1px solid #38bdf8',
              background: 'rgba(56, 189, 248, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Hash size={20} color="#38bdf8" />
              <div>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>
                  Root Image Cryptographic Anchor (SHA-256)
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#f8fafc', fontWeight: 'bold' }}>
                  {masterImageHash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
