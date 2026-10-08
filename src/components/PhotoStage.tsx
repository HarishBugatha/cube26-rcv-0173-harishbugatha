import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { ClaimStatus } from '../types/receiving';

export interface StageBox {
  claimId: string;
  bbox: number[];
  label: string;
  /** undefined while the finding is still being debated */
  status?: ClaimStatus;
}

interface PhotoStageProps {
  src?: string;
  boxes: StageBox[];
  scanning: boolean;
  hud?: React.ReactNode;
  emptyText?: React.ReactNode;
  onBoxClick?: (claimId: string) => void;
  onNaturalSize?: (size: { w: number; h: number }) => void;
}

export const isWholeFrame = (b: number[]) => b[0] <= 0.001 && b[1] <= 0.001 && b[2] >= 0.999 && b[3] >= 0.999;

/** The delivery photo with live overlays: scan line while the Prosecutor works, finding regions as they arrive. */
export const PhotoStage: React.FC<PhotoStageProps> = ({ src, boxes, scanning, hud, emptyText, onBoxClick, onNaturalSize }) => {
  const [showBoxes, setShowBoxes] = useState(true);
  // Whole-frame "regions" (undeterminable facts, nominal check) are listed in the findings, not drawn
  const drawable = boxes.filter((b) => Array.isArray(b.bbox) && b.bbox.length === 4 && !isWholeFrame(b.bbox));

  return (
    <div className="stage stage-corners">
      {src ? (
        <div className="stage-img-wrap">
          <img
            src={src}
            alt="Delivery photo under inspection"
            onLoad={(e) => onNaturalSize?.({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {scanning && <div className="scan-clip" aria-hidden="true"><div className="scanline" /></div>}
          {showBoxes &&
            drawable.map((b) => {
              const [ymin, xmin, ymax, xmax] = b.bbox;
              return (
                <button
                  type="button"
                  key={b.claimId}
                  className={`box ${b.status ? `s-${b.status}` : 'pending'}`}
                  style={{ top: `${ymin * 100}%`, left: `${xmin * 100}%`, width: `${(xmax - xmin) * 100}%`, height: `${(ymax - ymin) * 100}%` }}
                  onClick={() => onBoxClick?.(b.claimId)}
                  aria-label={`${b.claimId}: ${b.label}${b.status ? ` (${b.status})` : ''}`}
                  title={`${b.claimId} · ${b.label}`}
                >
                  <span className="box-tag">{b.claimId.replace('CLM-', '')}{b.status ? ` · ${b.status}` : ''}</span>
                </button>
              );
            })}
        </div>
      ) : (
        <div className="stage-empty">
          <ImageOff size={34} />
          {emptyText || 'No photo yet'}
        </div>
      )}

      {src && drawable.length > 0 && (
        <div className="stage-toggle">
          <div className="segmented" role="group" aria-label="Finding regions">
            <button type="button" className={showBoxes ? 'active' : ''} aria-pressed={showBoxes} onClick={() => setShowBoxes(true)}>Regions</button>
            <button type="button" className={!showBoxes ? 'active' : ''} aria-pressed={!showBoxes} onClick={() => setShowBoxes(false)}>Clean</button>
          </div>
        </div>
      )}
      {hud && <div className="stage-hud">{hud}</div>}
    </div>
  );
};

export default PhotoStage;
