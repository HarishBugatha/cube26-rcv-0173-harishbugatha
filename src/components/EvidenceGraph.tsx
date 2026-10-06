import React from 'react';
import {
  GitFork,
  Gavel,
  ShieldCheck,
  EyeOff,
  Image as ImageIcon,
  Hash,
  ChevronRight,
  Flag,
} from 'lucide-react';
import { EvidenceGraph as EvidenceGraphType, DebatedClaim, PRDVerdict, ClaimStatus } from '../types/receiving';
import { VERDICT_META, ClaimStatusPill, HashField, checkName } from './ui';

interface EvidenceGraphProps {
  evidenceGraph?: EvidenceGraphType;
  debatedClaims?: DebatedClaim[];
  onClaimClick?: (claim: DebatedClaim) => void;
}

/**
 * Renders the evidence graph returned by the DEBATE engine:
 * Verdict → Claim → (Prosecutor, Defender, Blind Verifier) → Image crop → Master image hash.
 * Presentation only — node/edge structure comes from server/debateEngine.js.
 */
export const EvidenceGraph: React.FC<EvidenceGraphProps> = ({
  evidenceGraph,
  debatedClaims = [],
  onClaimClick,
}) => {
  if (!evidenceGraph || !evidenceGraph.nodes || evidenceGraph.nodes.length === 0) {
    return null;
  }

  const { nodes, edges, masterImageHash, rawImageHash } = evidenceGraph;
  const verdictNode = nodes.find(n => n.type === 'VERDICT') || nodes[0];
  const claimNodes = nodes.filter(n => n.type === 'CLAIM');
  const verdict = (verdictNode.status as PRDVerdict) || 'UNCERTAIN';
  const verdictMeta = VERDICT_META[verdict] || VERDICT_META.UNCERTAIN;

  const openClaim = (idx: number) => {
    const claim = debatedClaims[idx];
    if (claim && onClaimClick) onClaimClick(claim);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">
            <GitFork size={16} />
            Evidence graph
          </div>
          <div className="panel-subtitle">
            Verdict → finding → Prosecutor / Defender / Blind Verifier → image crop → source image hash
          </div>
        </div>
        <span className="chip">{nodes.length} nodes · {edges?.length || 0} links</span>
      </div>

      <div className="panel-body">
        <div className="eg-canvas">
          {/* Root: verdict */}
          <div className="eg-root">
            <div className={`eg-node eg-verdict v-${verdict}`}>
              <div className="eg-node-type" style={{ justifyContent: 'center' }}>
                <Flag size={12} />
                Final verdict
              </div>
              <div className={`verdict-word`} style={{ fontSize: '1.15rem', color: `var(--${verdictMeta.tone}-text)` }}>
                {verdict}
              </div>
              <div className="xsmall muted" style={{ marginTop: 2 }}>{verdictNode.description}</div>
            </div>
          </div>

          <div className="eg-vline" />

          {/* Branches: one per claim */}
          <div className="eg-branches">
            {claimNodes.map((claimNode, idx) => {
              const prosNode = nodes.find(n => n.id === `node-pros-${idx}`);
              const defNode = nodes.find(n => n.id === `node-def-${idx}`);
              const blindNode = nodes.find(n => n.id === `node-blind-${idx}`);
              const cropNode = nodes.find(n => n.id === `node-crop-${idx}`);
              const status = (claimNode.status as ClaimStatus) || 'CHALLENGED';
              const claimType = claimNode.data?.type || debatedClaims[idx]?.claimType || '';
              const clickable = !!debatedClaims[idx] && !!onClaimClick;

              return (
                <div key={claimNode.id} className={`eg-branch s-${status}`}>
                  <button
                    type="button"
                    className="row-between"
                    style={{ width: '100%', textAlign: 'left', cursor: clickable ? 'pointer' : 'default' }}
                    onClick={() => openClaim(idx)}
                    disabled={!clickable}
                    title={clickable ? 'Open full evidence' : undefined}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="eg-node-type" style={{ marginBottom: 2 }}>
                        Finding {idx + 1} · {checkName(claimType)}
                      </div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 500 }} className="truncate">{claimNode.label}</div>
                      {claimNode.data?.observed && (
                        <div className="xsmall muted truncate">Observed: {claimNode.data.observed}</div>
                      )}
                    </div>
                    <div className="row">
                      <ClaimStatusPill status={status} />
                      {clickable && <ChevronRight size={16} className="dim" />}
                    </div>
                  </button>

                  <div className="eg-chain">
                    <div className="eg-node">
                      <div className="eg-node-type" style={{ color: 'var(--role-prosecutor)' }}>
                        <Gavel size={12} /> Prosecutor
                      </div>
                      <div className="eg-node-text">{prosNode?.data?.arguments?.[0] || '—'}</div>
                      <div className="eg-node-metric">Confidence {((prosNode?.confidence ?? 0) * 100).toFixed(0)}%</div>
                    </div>

                    <div className="eg-arrow" aria-hidden="true"><ChevronRight size={14} /></div>

                    <div className="eg-node">
                      <div className="eg-node-type" style={{ color: 'var(--role-defender)' }}>
                        <ShieldCheck size={12} /> Defender
                      </div>
                      <div className="eg-node-text">{defNode?.data?.arguments?.[0] || '—'}</div>
                      <div className="eg-node-metric">{String(defNode?.data?.stance || '—').replace(/_/g, ' ')}</div>
                    </div>

                    <div className="eg-arrow" aria-hidden="true"><ChevronRight size={14} /></div>

                    <div className="eg-node">
                      <div className="eg-node-type" style={{ color: 'var(--role-blind)' }}>
                        <EyeOff size={12} /> Blind Verifier
                      </div>
                      <div className="eg-node-text">{blindNode?.data?.observations?.[0] || '—'}</div>
                      <div className="eg-node-metric">Confidence {((blindNode?.confidence ?? 0) * 100).toFixed(0)}%</div>
                    </div>

                    <div className="eg-arrow" aria-hidden="true"><ChevronRight size={14} /></div>

                    <div className="eg-node eg-crop">
                      <div className="eg-node-type">
                        <ImageIcon size={12} /> Image crop
                      </div>
                      {cropNode?.data?.cropBase64 ? (
                        <img src={cropNode.data.cropBase64} alt={`Crop for finding ${idx + 1}`} />
                      ) : (
                        <div className="xsmall dim" style={{ height: 56, display: 'flex', alignItems: 'center' }}>No crop</div>
                      )}
                      <div className="mono xsmall dim truncate" title={cropNode?.sha256}>
                        {cropNode?.sha256 ? `${cropNode.sha256.slice(0, 12)}…` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="eg-vline" />

          {/* Leaf: master image hash */}
          <div className="eg-node" style={{ maxWidth: 640, margin: '0 auto' }}>
            <div className="eg-node-type">
              <Hash size={12} /> Source image · all crops extracted from
            </div>
            <div className="grid-2" style={{ gap: 8, marginTop: 6 }}>
              <HashField label="Sanitised image SHA-256" value={masterImageHash} />
              <HashField label="Raw upload SHA-256" value={rawImageHash} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EvidenceGraph;
