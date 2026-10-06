import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Camera } from 'lucide-react';
import { DebatedClaim } from '../types/receiving';
import { HashField, checkName } from './ui';

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

  // Default back to the annotated view whenever a new annotated image arrives
  useEffect(() => {
    if (annotatedImageDataUrl) setShowAnnotation(true);
  }, [annotatedImageDataUrl]);

  const displayImage = (showAnnotation && annotatedImageDataUrl) ? annotatedImageDataUrl : rawImageDataUrl;

  return (
    <section className="panel" aria-labelledby="evidence-panel-title">
      <div className="panel-header">
        <div>
          <div className="panel-title" id="evidence-panel-title">
            <Camera size={16} />
            Observed · receiving photo
          </div>
          <div className="panel-subtitle">
            {annotatedImageDataUrl ? 'Boxes mark the regions each finding was checked against.' : 'The image the inspection will be run on.'}
          </div>
        </div>

        {annotatedImageDataUrl && (
          <div className="segmented" role="tablist" aria-label="Image view">
            <button type="button" role="tab" aria-selected={showAnnotation} className={showAnnotation ? 'active' : ''} onClick={() => setShowAnnotation(true)}>
              Annotated
            </button>
            <button type="button" role="tab" aria-selected={!showAnnotation} className={!showAnnotation ? 'active' : ''} onClick={() => setShowAnnotation(false)}>
              Original
            </button>
          </div>
        )}
      </div>

      <div className="panel-body stack" style={{ gap: 12 }}>
        <div className="image-stage">
          {displayImage ? (
            <img src={displayImage} alt={showAnnotation && annotatedImageDataUrl ? 'Receiving photo with finding regions marked' : 'Receiving photo'} />
          ) : (
            <div className="image-stage-empty">
              <ImageIcon size={40} style={{ opacity: 0.35, margin: '0 auto 8px', display: 'block' }} />
              No photo loaded yet.
            </div>
          )}
        </div>

        <HashField label="Image SHA-256 content hash" value={sha256Hash} />

        {debatedClaims.length > 0 && (
          <div>
            <span className="form-label">Checked regions — select one to open its evidence</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {debatedClaims.map((claim) => (
                <button
                  type="button"
                  key={claim.claimId}
                  onClick={() => onClaimClick(claim)}
                  className="claim-tab"
                  title={claim.claimTitle}
                >
                  <span className={`status-dot status-dot-${claim.status}`} aria-hidden="true" />
                  <span className="mono xsmall dim">{claim.claimId}</span>
                  {checkName(claim.claimType)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default VisualEvidenceViewer;
