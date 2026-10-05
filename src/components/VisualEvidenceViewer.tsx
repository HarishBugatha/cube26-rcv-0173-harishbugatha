import React, { useState } from 'react';
import { Image as ImageIcon, Copy, Check, Eye, Hash } from 'lucide-react';
import { DebatedClaim } from '../types/receiving';

interface VisualEvidenceViewerProps {
  rawImageDataUrl?: string;
  annotatedImageDataUrl?: string;
  sha256Hash?: string;
  debatedClaims?: DebatedClaim[];
  onClaimClick: (claim: DebatedClaim) => void;
}

export const VisualEvidenceViewer: React.FC<VisualEvidenceViewerProps> = ({ 
  rawImageDataUrl, 
  annotatedImageDataUrl, 
  sha256Hash, 
  debatedClaims = [], 
  onClaimClick 
}) => {
  const [showAnnotation, setShowAnnotation] = useState(true);
  const [copied, setCopied] = useState(false);

  const displayImage = (showAnnotation && annotatedImageDataUrl) ? annotatedImageDataUrl : rawImageDataUrl;

  const handleCopyHash = () => {
    if (sha256Hash) {
      navigator.clipboard.writeText(sha256Hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '22px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ImageIcon size={20} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc' }}>
            Physical Receiving Visual Evidence
          </h2>
        </div>

        {/* Toggle View Mode */}
        {annotatedImageDataUrl && (
          <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setShowAnnotation(true)}
              style={{
                background: showAnnotation ? 'var(--accent-cyan)' : 'transparent',
                color: showAnnotation ? '#0f172a' : '#94a3b8',
                fontWeight: showAnnotation ? '700' : '500',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Annotated (Bounding Boxes)
            </button>
            <button
              type="button"
              onClick={() => setShowAnnotation(false)}
              style={{
                background: !showAnnotation ? 'var(--accent-cyan)' : 'transparent',
                color: !showAnnotation ? '#0f172a' : '#94a3b8',
                fontWeight: !showAnnotation ? '700' : '500',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Raw Image
            </button>
          </div>
        )}
      </div>

      {/* Main Image Container */}
      <div style={{
        position: 'relative',
        width: '100%',
        flexGrow: 1,
        minHeight: '340px',
        maxHeight: '480px',
        background: '#090d16',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {displayImage ? (
          <img 
            src={displayImage} 
            alt="Receiving Physical Inspection"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block'
            }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#64748b' }}>
            <ImageIcon size={48} style={{ opacity: 0.3, margin: '0 auto 10px' }} />
            <p>No receiving photo loaded.</p>
          </div>
        )}
      </div>

      {/* Cryptographic Hash Bar */}
      <div style={{
        marginTop: '12px',
        padding: '10px 14px',
        background: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <Hash size={16} color="#38bdf8" style={{ flexShrink: 0 }} />
          <div style={{ overflow: 'hidden' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
              Master Image SHA-256 Checksum
            </span>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '0.78rem',
              color: '#94a3b8',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              display: 'block'
            }}>
              {sha256Hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyHash}
          title="Copy SHA-256 Hash"
          style={{
            background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(51, 65, 85, 0.5)',
            border: `1px solid ${copied ? '#10b981' : 'var(--border-subtle)'}`,
            color: copied ? '#34d399' : '#cbd5e1',
            padding: '6px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Clickable Claim Chips under visual */}
      {debatedClaims && debatedClaims.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
            Detected ROI Bounding Boxes (Click to Inspect Dossier):
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {debatedClaims.map((claim) => {
              let badgeColor = '#ef4444';
              let badgeBg = 'rgba(239, 68, 68, 0.15)';
              if (claim.status === 'REJECTED') {
                badgeColor = '#10b981';
                badgeBg = 'rgba(16, 185, 129, 0.15)';
              } else if (claim.status === 'CHALLENGED') {
                badgeColor = '#f59e0b';
                badgeBg = 'rgba(245, 158, 11, 0.15)';
              }

              return (
                <button
                  type="button"
                  key={claim.claimId}
                  onClick={() => onClaimClick(claim)}
                  style={{
                    background: badgeBg,
                    border: `1px solid ${badgeColor}`,
                    color: badgeColor,
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Eye size={12} />
                  <span>{claim.claimId}: {claim.claimTitle.slice(0, 26)}...</span>
                  <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '3px', background: 'rgba(0,0,0,0.3)' }}>
                    {claim.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

export default VisualEvidenceViewer;
