import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  ArrowRightCircle, 
  CheckCircle2, 
  ShieldCheck, 
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { 
  PRDScenario, 
  PRDScenarioPo, 
  DebateInspectionReport, 
  DebatedClaim, 
  ReceivingRecord, 
  TenantId, 
  ReceivingStatus, 
  DispositionAction, 
  DamageGrade, 
  QualityFlag 
} from '../types/receiving';
import ScenarioSelector from '../components/ScenarioSelector';
import POEditorPanel from '../components/POEditorPanel';
import VisualEvidenceViewer from '../components/VisualEvidenceViewer';
import DebatePipelineVisualizer from '../components/DebatePipelineVisualizer';
import EvidenceGraph from '../components/EvidenceGraph';
import DossierModal from '../components/DossierModal';
import StructuredReportView from '../components/StructuredReportView';

interface DebateWorkspaceViewProps {
  tenantId: TenantId;
  operatorId: string;
  onSubmitRecord: (record: ReceivingRecord) => void;
  onNavigateToTerminal: () => void;
}

export const DebateWorkspaceView: React.FC<DebateWorkspaceViewProps> = ({
  tenantId,
  operatorId,
  onSubmitRecord,
  onNavigateToTerminal
}) => {
  const [scenarios, setScenarios] = useState<PRDScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('scenario-1-correct');
  const [currentPo, setCurrentPo] = useState<PRDScenarioPo>({
    poNumber: 'PO-2026-9041',
    vendor: 'MetaOptics Global Ltd',
    expectedSku: 'SKU-VR-8800',
    productName: 'Spatial Computing Headset Pro',
    expectedQuantity: 4,
    expectedVariant: 'Matte Titanium / 256GB',
    expectedComponents: ['HMD Unit', '2x Hand Controllers', 'USB-C 45W Adapter', 'High-Speed Tether Cable'],
    carrierTracking: '1Z9999999999999999',
    notes: 'Verify pristine retail seal on all 4 master boxes.'
  });

  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customFile, setCustomFile] = useState<File | null>(null);

  const [currentImageBase64, setCurrentImageBase64] = useState<string>('');
  const [annotatedImageBase64, setAnnotatedImageBase64] = useState<string>('');
  const [currentSha256, setCurrentSha256] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [report, setReport] = useState<DebateInspectionReport | null>(null);
  const [selectedDossierClaim, setSelectedDossierClaim] = useState<DebatedClaim | null>(null);
  const [ingestedSuccess, setIngestedSuccess] = useState<boolean>(false);

  // Fetch all scenarios from backend API
  useEffect(() => {
    const fetchScenarios = async () => {
      try {
        const res = await fetch('/api/scenarios');
        if (res.ok) {
          const data = await res.json();
          const scenariosList: PRDScenario[] = Array.isArray(data) ? data : (data.scenarios || []);
          if (scenariosList.length > 0) {
            setScenarios(scenariosList);
            const first = scenariosList[0];
            setSelectedScenarioId(first.id);
            setCurrentPo({ ...first.po });
            setCurrentImageBase64(first.imageDataUrl || '');
            setCurrentSha256(first.sha256 || '');
          }
        }
      } catch (err) {
        console.warn('Backend server not reachable on /api/scenarios, checking scenario direct load:', err);
      }
    };
    fetchScenarios();
  }, []);

  // Handle Scenario Selection
  const handleSelectScenario = async (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    setIsCustomMode(false);
    setIngestedSuccess(false);

    try {
      const res = await fetch(`/api/scenarios/${scenarioId}`);
      if (res.ok) {
        const data = await res.json();
        const scenario: PRDScenario = data.scenario || data;
        setCurrentPo({ ...scenario.po });
        setCurrentImageBase64(scenario.imageDataUrl || '');
        setAnnotatedImageBase64('');
        setCurrentSha256(scenario.sha256 || '');
        setReport(null);
      }
    } catch (err) {
      console.error('Error fetching scenario details:', err);
    }
  };

  // Handle PO Field Changes
  const handlePoChange = (field: keyof PRDScenarioPo, value: any) => {
    setCurrentPo((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle Custom File Selection
  const handleFileSelect = (file: File) => {
    setCustomFile(file);
    const previewUrl = URL.createObjectURL(file);
    setCurrentImageBase64(previewUrl);
    setAnnotatedImageBase64('');
    setReport(null);
    setIngestedSuccess(false);
  };

  // Run Verification
  const handleRunVerification = async () => {
    setIsLoading(true);
    setIngestedSuccess(false);

    try {
      if (isCustomMode) {
        if (!customFile) {
          alert('Please upload a receiving photo first.');
          setIsLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('image', customFile);
        formData.append('poNumber', currentPo.poNumber || 'PO-CUSTOM');
        formData.append('vendor', currentPo.vendor || 'Custom Vendor');
        formData.append('expectedSku', currentPo.expectedSku || 'SKU-CUSTOM');
        formData.append('productName', currentPo.productName || 'Custom Product');
        formData.append('expectedQuantity', String(currentPo.expectedQuantity || 1));
        formData.append('expectedVariant', currentPo.expectedVariant || '');
        formData.append('expectedComponents', JSON.stringify(currentPo.expectedComponents || []));

        const res = await fetch('/api/verify/custom', {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          const data = await res.json();
          const verificationReport: DebateInspectionReport = data.report || data;
          setReport(verificationReport);
          if (verificationReport.annotatedImageBase64) {
            setAnnotatedImageBase64(verificationReport.annotatedImageBase64);
          }
          if (verificationReport.securityAudit?.cleanImageSha256) {
            setCurrentSha256(verificationReport.securityAudit.cleanImageSha256);
          }
          if (verificationReport.finalVerdict === 'ACCEPT') {
            confetti({ particleCount: 75, spread: 60, origin: { y: 0.7 } });
          }
        } else {
          const err = await res.json();
          alert(`Verification error: ${err.error || 'Server processing failed'}`);
        }

      } else {
        const res = await fetch(`/api/verify/scenario/${selectedScenarioId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ po: currentPo, poOverride: currentPo })
        });

        if (res.ok) {
          const data = await res.json();
          const verificationReport: DebateInspectionReport = data.report || data;
          setReport(verificationReport);
          if (verificationReport.annotatedImageBase64) {
            setAnnotatedImageBase64(verificationReport.annotatedImageBase64);
          }
          if (verificationReport.securityAudit?.cleanImageSha256) {
            setCurrentSha256(verificationReport.securityAudit.cleanImageSha256);
          }
          if (verificationReport.finalVerdict === 'ACCEPT') {
            confetti({ particleCount: 75, spread: 60, origin: { y: 0.7 } });
          }
        } else {
          const err = await res.json();
          alert(`Verification error: ${err.error || 'Server processing failed'}`);
        }
      }
    } catch (err: any) {
      console.error('Debate verification failed:', err);
      alert('Network or processing error during debate execution: ' + (err.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  // Ingest to Warehouse Terminal
  const handleIngestToTerminal = () => {
    if (!report) return;

    let recStatus: ReceivingStatus = 'MATCHED';
    let dispAction: DispositionAction = 'ACCEPT_TO_PREP';
    let cartonDamage: DamageGrade = 'none';
    let unitDamage: DamageGrade = 'none';
    const qualityFlags: QualityFlag[] = [];

    if (report.finalVerdict === 'EXCEPTION') {
      const topClaim = report.debatedClaims.find(c => c.status === 'VERIFIED');
      if (topClaim) {
        if (topClaim.claimType === 'QUANTITY_SHORT') {
          recStatus = 'SHORT_RECEIVED';
          dispAction = 'HOLD_QUARANTINE_RECOVERY';
        } else if (topClaim.claimType === 'QUANTITY_OVER') {
          recStatus = 'OVER_RECEIVED';
          dispAction = 'HOLD_SURPLUS';
        } else if (topClaim.claimType === 'SKU_MISMATCH') {
          recStatus = 'WRONG_PRODUCT';
          dispAction = 'HOLD_QUARANTINE_RECOVERY';
        } else if (topClaim.claimType === 'VARIANT_MISMATCH') {
          recStatus = 'QUALITY_DISCREPANCY';
          qualityFlags.push('wrong_variant');
          dispAction = 'HOLD_QUARANTINE_RECOVERY';
        } else if (topClaim.claimType === 'DAMAGE_CRUSH') {
          recStatus = 'DAMAGED';
          cartonDamage = 'crushing';
          dispAction = 'HOLD_QUARANTINE_RECOVERY';
        } else if (topClaim.claimType === 'DAMAGE_WATER') {
          recStatus = 'DAMAGED';
          cartonDamage = 'water';
          dispAction = 'HOLD_QUARANTINE_RECOVERY';
        } else if (topClaim.claimType === 'DAMAGE_TEAR') {
          recStatus = 'DAMAGED';
          cartonDamage = 'tears';
          dispAction = 'HOLD_QUARANTINE_RECOVERY';
        } else if (topClaim.claimType === 'MISSING_COMPONENT') {
          recStatus = 'QUALITY_DISCREPANCY';
          qualityFlags.push('missing_components');
          dispAction = 'HOLD_QUARANTINE_RECOVERY';
        } else {
          recStatus = 'QUALITY_DISCREPANCY';
          dispAction = 'HOLD_QUARANTINE_RECOVERY';
        }
      } else {
        recStatus = 'QUALITY_DISCREPANCY';
        dispAction = 'HOLD_QUARANTINE_RECOVERY';
      }
    } else if (report.finalVerdict === 'UNCERTAIN') {
      recStatus = 'UNCERTAIN';
      dispAction = 'SUPERVISOR_REVIEW';
      cartonDamage = 'uncertain';
    }

    const newRecord: ReceivingRecord = {
      recordId: `RCV-${Date.now().toString().slice(-4)}`,
      unitId: `UNIT-${Math.floor(1000 + Math.random() * 9000)}`,
      orgId: tenantId,
      poNumber: report.poNumber,
      poLine: 1,
      supplier: report.vendor,
      sku: report.expectedSku,
      asin: 'B0DEBATE01',
      productTitle: currentPo.productName || 'Verified Product',
      specColour: currentPo.expectedVariant || 'Standard',
      specVariant: currentPo.expectedVariant || 'Standard',
      specComponents: (currentPo.expectedComponents || []).join(', '),
      cartonsOrdered: 1,
      unitsPerCartonOrdered: report.expectedQuantity,
      qtyOrdered: report.expectedQuantity,
      cartonsReceived: 1,
      unitsPerCartonCounted: recStatus === 'SHORT_RECEIVED' ? Math.max(0, report.expectedQuantity - 1) : recStatus === 'OVER_RECEIVED' ? report.expectedQuantity + 1 : report.expectedQuantity,
      qtyReceived: recStatus === 'SHORT_RECEIVED' ? Math.max(0, report.expectedQuantity - 1) : recStatus === 'OVER_RECEIVED' ? report.expectedQuantity + 1 : report.expectedQuantity,
      receivedSku: recStatus === 'WRONG_PRODUCT' ? 'SKU-VR-7200' : report.expectedSku,
      identityMatch: recStatus === 'WRONG_PRODUCT' ? 'no' : recStatus === 'UNCERTAIN' ? 'uncertain' : 'yes',
      cartonDamage,
      unitDamage,
      qualityFlags,
      photoRefs: [`evidence-${report.inspectionId}.png`],
      operatorId,
      capturedAt: new Date().toISOString(),
      status: recStatus,
      qtyDifference: recStatus === 'SHORT_RECEIVED' ? -1 : recStatus === 'OVER_RECEIVED' ? 1 : 0,
      disposition: dispAction,
      notes: `PRD-3 DEBATE Inspection ${report.inspectionId} [${report.finalVerdict}]: ${report.decisionRationale}`,
      contentHash: currentSha256 || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    };

    onSubmitRecord(newRecord);
    setIngestedSuccess(true);
  };

  const selectedScenarioDetails = scenarios.find(s => s.id === selectedScenarioId);

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px 20px 48px' }}>
      
      {/* Flagship Header Banner */}
      <div className="glass-panel" style={{
        padding: '24px',
        marginBottom: '24px',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)',
        border: '1px solid rgba(6, 182, 212, 0.3)',
        boxShadow: '0 8px 32px rgba(6, 182, 212, 0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{
                background: 'linear-gradient(135deg, #06b6d4, #a855f7)',
                color: '#ffffff',
                padding: '3px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: '800',
                letterSpacing: '0.06em'
              }}>
                PRD-3 SPECIFICATION
              </span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Stage 01 of 05 · Inbound Receiving &amp; Condition on Arrival
              </span>
            </div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.02em' }}>
              Adversarial Multi-Role Receiving Verification Terminal
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '780px', marginTop: '4px' }}>
              Three AI agents (Prosecutor, Defender, and an isolated Blind Verifier receiving pixel ROI crops with zero PO context) evaluate physical intake to eliminate single-pass vision hallucinations.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '10px 16px',
              textAlign: 'right'
            }}>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>
                CURRENT TENANT SCOPE
              </span>
              <strong style={{ color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                {tenantId}
              </strong>
            </div>

            <button
              type="button"
              onClick={handleRunVerification}
              disabled={isLoading}
              className="btn-primary"
              style={{
                padding: '12px 24px',
                fontSize: '0.95rem',
                fontWeight: '700',
                boxShadow: 'var(--glow-cyan)'
              }}
            >
              {isLoading ? (
                <>
                  <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Run Adversarial DEBATE</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Scenario Carousel / Preset Selector */}
      <ScenarioSelector
        scenarios={scenarios}
        selectedScenarioId={selectedScenarioId}
        onSelectScenario={handleSelectScenario}
        isCustomMode={isCustomMode}
        onToggleCustomMode={() => setIsCustomMode(!isCustomMode)}
      />

      {/* Top Split Layout: Left = PO Specification Panel | Right = Visual Evidence Viewer */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 420px) 1fr',
        gap: '24px',
        marginBottom: '24px'
      }}>
        <POEditorPanel
          po={currentPo}
          onPoChange={handlePoChange}
          onRunVerification={handleRunVerification}
          isLoading={isLoading}
          isCustomMode={isCustomMode}
          customFile={customFile}
          onFileSelect={handleFileSelect}
          scenarioDetails={selectedScenarioDetails}
        />

        <VisualEvidenceViewer
          rawImageDataUrl={currentImageBase64}
          annotatedImageDataUrl={annotatedImageBase64}
          sha256Hash={currentSha256}
          debatedClaims={report?.debatedClaims || []}
          onClaimClick={(claim) => setSelectedDossierClaim(claim)}
        />
      </div>

      {/* Ingestion to Warehouse Confirmation Banner */}
      {report && (
        <div className="glass-panel" style={{
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          border: ingestedSuccess ? '1px solid #10b981' : '1px solid var(--border-subtle)',
          background: ingestedSuccess ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.75)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {ingestedSuccess ? (
              <CheckCircle2 size={24} color="#10b981" />
            ) : (
              <ShieldCheck size={24} color="var(--accent-cyan)" />
            )}
            <div>
              <strong style={{ fontSize: '0.95rem', color: '#f8fafc' }}>
                {ingestedSuccess ? 'Verified Receiving Unit Ingested into Tenant Log' : 'Verification Complete • Ready to Record Intake'}
              </strong>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {ingestedSuccess ? (
                  <>Unit logged under <span style={{ color: '#38bdf8' }}>{tenantId}</span> with SHA-256 evidence anchor. Available in Dashboard, Discrepancies, and Audit Trail.</>
                ) : (
                  <>Ingest this audited outcome directly to generate an immutable receiving record feeding 02 Prep and 05 Recovery.</>
                )}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handleIngestToTerminal}
              disabled={ingestedSuccess}
              className={ingestedSuccess ? 'btn-secondary' : 'btn-primary'}
              style={{ fontSize: '0.85rem', padding: '8px 16px' }}
            >
              {ingestedSuccess ? (
                <>✓ Ingested to {tenantId}</>
              ) : (
                <>
                  <ArrowRightCircle size={16} />
                  Ingest to Warehouse Log
                </>
              )}
            </button>

            {ingestedSuccess && (
              <button
                type="button"
                onClick={onNavigateToTerminal}
                className="btn-secondary"
                style={{ fontSize: '0.85rem', padding: '8px 16px' }}
              >
                View in Inbound Terminal
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3-Role DEBATE Adversarial Pipeline Visualizer */}
      <DebatePipelineVisualizer
        debatedClaims={report?.debatedClaims || []}
        onClaimClick={(claim) => setSelectedDossierClaim(claim)}
      />

      {/* Interactive Evidence Graph */}
      {report?.evidenceGraph && (
        <EvidenceGraph
          evidenceGraph={report.evidenceGraph}
          onClaimClick={(claim) => setSelectedDossierClaim(claim)}
          onVerdictClick={() => {}}
        />
      )}

      {/* Structured Inspection Report & Audit Downloads */}
      {report && (
        <StructuredReportView report={report} />
      )}

      {/* Full Dossier Deep Dive Modal */}
      {selectedDossierClaim && (
        <DossierModal
          claim={selectedDossierClaim}
          onClose={() => setSelectedDossierClaim(null)}
          masterImageHash={currentSha256}
        />
      )}

    </div>
  );
};

export default DebateWorkspaceView;
