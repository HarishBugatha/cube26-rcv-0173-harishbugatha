import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  AlertCircle,
  X,
  UploadCloud,
  Info,
  Layers,
} from 'lucide-react';
import {
  PRDScenario,
  PRDScenarioPo,
  DebateInspectionReport,
  DebatedClaim,
  ReceivingRecord,
  TenantId
} from '../types/receiving';
import { buildRecordFromInspection, buildPendingRecordFromInspection, isVisuallyVerified } from '../services/inspectionRecord';
import ScenarioSelector from '../components/ScenarioSelector';
import POEditorPanel from '../components/POEditorPanel';
import VisualEvidenceViewer from '../components/VisualEvidenceViewer';
import DebatePipelineVisualizer from '../components/DebatePipelineVisualizer';
import EvidenceGraph from '../components/EvidenceGraph';
import DossierModal from '../components/DossierModal';
import StructuredReportView from '../components/StructuredReportView';
import InspectionHistory, { InspectionHistoryEntry } from '../components/InspectionHistory';
import { EmptyState } from '../components/ui';

interface DebateWorkspaceViewProps {
  tenantId: TenantId;
  operatorId: string;
  onSubmitRecord: (record: ReceivingRecord) => void;
  onNavigateToDashboard: () => void;
  history: InspectionHistoryEntry[];
  openInspectionId: string | null;
  onOpenInspection: (inspectionId: string | null) => void;
  onInspectionComplete: (entry: InspectionHistoryEntry) => void;
  onInspectionIngested: (inspectionId: string, recordId: string) => void;
}

const DEFAULT_PO: PRDScenarioPo = {
  poNumber: 'PO-2026-9041',
  vendor: 'MetaOptics Global Ltd',
  expectedSku: 'SKU-VR-8800',
  productName: 'Spatial Computing Headset Pro',
  expectedQuantity: 4,
  expectedVariant: 'Matte Titanium / 256GB',
  expectedComponents: ['HMD Unit', '2x Hand Controllers', 'USB-C 45W Adapter', 'High-Speed Tether Cable'],
  carrierTracking: '1Z9999999999999999',
  notes: 'Verify pristine retail seal on all 4 master boxes.'
};

const readErrorMessage = async (res: Response): Promise<string> => {
  try {
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        return parsed.error || parsed.message || `Server returned status ${res.status}.`;
      } catch {
        if (!text.trimStart().startsWith('<')) return text.slice(0, 200);
      }
    }
  } catch {
    // fall through
  }
  if (res.status === 502 || res.status === 504) {
    return 'The verification server is not reachable. Start it with "node server/server.js" (port 3001).';
  }
  return `The server returned an error (status ${res.status}). Check the server log for details.`;
};

export const DebateWorkspaceView: React.FC<DebateWorkspaceViewProps> = ({
  tenantId,
  operatorId,
  onSubmitRecord,
  onNavigateToDashboard,
  history,
  openInspectionId,
  onOpenInspection,
  onInspectionComplete,
  onInspectionIngested
}) => {
  const [scenarios, setScenarios] = useState<PRDScenario[]>([]);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [visionModel, setVisionModel] = useState<string | null>(null);

  // Ask the server whether a vision model is configured (shown in upload mode)
  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setVisionModel(data?.vision?.configured ? data.vision.model : null))
      .catch(() => setVisionModel(null));
  }, []);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('scenario-1-correct');
  const [currentPo, setCurrentPo] = useState<PRDScenarioPo>(DEFAULT_PO);

  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [currentImageBase64, setCurrentImageBase64] = useState<string>('');
  const [annotatedImageBase64, setAnnotatedImageBase64] = useState<string>('');
  const [currentSha256, setCurrentSha256] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [report, setReport] = useState<DebateInspectionReport | null>(null);
  const [selectedDossierClaim, setSelectedDossierClaim] = useState<DebatedClaim | null>(null);

  const appliedInspectionRef = useRef<string | null>(null);
  const initialOpenRef = useRef<string | null>(openInspectionId);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const historyEntry = report ? history.find((h) => h.report.inspectionId === report.inspectionId) : undefined;
  const ingested = !!historyEntry?.ingested;
  const selectedScenarioDetails = scenarios.find(s => s.id === selectedScenarioId);

  // Fetch all scenarios from backend API
  useEffect(() => {
    const fetchScenarios = async () => {
      try {
        const res = await fetch('/api/scenarios');
        if (!res.ok) {
          setScenariosError(await readErrorMessage(res));
          return;
        }
        const data = await res.json();
        const scenariosList: PRDScenario[] = Array.isArray(data) ? data : (data.scenarios || []);
        setScenarios(scenariosList);
        setScenariosError(null);
        if (scenariosList.length > 0 && !initialOpenRef.current) {
          await loadScenario(scenariosList[0].id, scenariosList[0]);
        }
      } catch (err) {
        console.warn('Backend server not reachable on /api/scenarios:', err);
        setScenariosError('The verification server is not reachable. Start it with "node server/server.js" (port 3001).');
      }
    };
    fetchScenarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreEntry = (entry: InspectionHistoryEntry) => {
    appliedInspectionRef.current = entry.report.inspectionId;
    setReport(entry.report);
    setCurrentPo({ ...entry.po });
    setIsCustomMode(!!entry.report.isCustomUpload);
    if (entry.report.scenarioId) setSelectedScenarioId(entry.report.scenarioId);
    setCurrentImageBase64(entry.rawImageUrl);
    setAnnotatedImageBase64(entry.report.annotatedImageBase64 || '');
    setCurrentSha256(entry.report.securityAudit?.cleanImageSha256 || '');
    setErrorMessage(null);
  };

  // Open an inspection requested from elsewhere (dashboard / history), or reset for a new one
  useEffect(() => {
    if (openInspectionId === appliedInspectionRef.current) return;
    appliedInspectionRef.current = openInspectionId;
    if (openInspectionId) {
      const entry = history.find((h) => h.report.inspectionId === openInspectionId);
      if (entry) restoreEntry(entry);
    } else {
      setReport(null);
      setAnnotatedImageBase64('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInspectionId]);

  const loadScenario = async (scenarioId: string, fallback?: PRDScenario) => {
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}`);
      if (res.ok) {
        const data = await res.json();
        const scenario: PRDScenario = data.scenario || data;
        setCurrentPo({ ...scenario.po });
        setCurrentImageBase64(scenario.imageDataUrl || '');
        setCurrentSha256(scenario.sha256 || '');
      } else if (fallback) {
        setCurrentPo({ ...fallback.po });
      }
    } catch (err) {
      console.error('Error fetching scenario details:', err);
      if (fallback) setCurrentPo({ ...fallback.po });
    }
  };

  const clearResult = () => {
    setReport(null);
    setAnnotatedImageBase64('');
    setErrorMessage(null);
  };

  // Handle Scenario Selection
  const handleSelectScenario = async (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    setIsCustomMode(false);
    clearResult();
    await loadScenario(scenarioId);
  };

  const handleModeChange = (custom: boolean) => {
    if (custom === isCustomMode) return;
    setIsCustomMode(custom);
    clearResult();
    if (custom) {
      setCurrentImageBase64(customFile ? URL.createObjectURL(customFile) : '');
      setCurrentSha256('');
    } else {
      loadScenario(selectedScenarioId);
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
    setCurrentImageBase64(URL.createObjectURL(file));
    setCurrentSha256('');
    clearResult();
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  };

  const applyReport = (verificationReport: DebateInspectionReport) => {
    setReport(verificationReport);
    if (verificationReport.annotatedImageBase64) {
      setAnnotatedImageBase64(verificationReport.annotatedImageBase64);
    }
    if (verificationReport.securityAudit?.cleanImageSha256) {
      setCurrentSha256(verificationReport.securityAudit.cleanImageSha256);
    }

    const sourceLabel = isCustomMode
      ? `Uploaded photo · ${customFile?.name || 'image'}`
      : (selectedScenarioDetails?.name || 'Test scenario').replace(/^\d+\.\s*/, '');

    appliedInspectionRef.current = verificationReport.inspectionId;
    onInspectionComplete({
      report: { ...verificationReport, scenarioId: verificationReport.scenarioId || (isCustomMode ? undefined : selectedScenarioId) },
      po: { ...currentPo },
      tenantId,
      sourceLabel,
      rawImageUrl: currentImageBase64,
      ingested: false
    });

    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  // Run Verification
  const handleRunVerification = async () => {
    setErrorMessage(null);

    if (isCustomMode && !customFile) {
      setErrorMessage('Add a receiving photo before running the inspection.');
      return;
    }

    setIsLoading(true);
    try {
      let res: Response;
      if (isCustomMode && customFile) {
        const formData = new FormData();
        // Field name must match the server's multer upload.single('photo')
        formData.append('photo', customFile);
        formData.append('poNumber', currentPo.poNumber || 'PO-CUSTOM');
        formData.append('vendor', currentPo.vendor || 'Custom Vendor');
        formData.append('expectedSku', currentPo.expectedSku || 'SKU-CUSTOM');
        formData.append('productName', currentPo.productName || 'Custom Product');
        formData.append('expectedQuantity', String(currentPo.expectedQuantity || 1));
        formData.append('expectedVariant', currentPo.expectedVariant || '');
        formData.append('expectedComponents', JSON.stringify(currentPo.expectedComponents || []));

        res = await fetch('/api/verify/custom', {
          method: 'POST',
          headers: { 'X-Org-Id': tenantId },
          body: formData
        });
      } else {
        res = await fetch(`/api/verify/scenario/${selectedScenarioId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Org-Id': tenantId },
          body: JSON.stringify({ po: currentPo, poOverride: currentPo })
        });
      }

      if (res.ok) {
        const data = await res.json();
        applyReport(data.report || data);
      } else {
        setErrorMessage(await readErrorMessage(res));
      }
    } catch (err: any) {
      console.error('Debate verification failed:', err);
      setErrorMessage('Could not reach the verification server. Check that it is running on port 3001. ' + (err?.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  // Record the inspection to the receiving log. A verified inspection is built from the
  // report's observed features and verified findings; one whose verification did not
  // complete is still recorded (Rule 3, fail open) as PENDING_REVIEW with the reason.
  const handleIngestToTerminal = () => {
    if (!report || ingested) return;
    // Use the PO snapshot the inspection ran against, not later form edits
    const po = historyEntry?.po || currentPo;
    const ctx = {
      tenantId,
      operatorId,
      capturedAt: new Date().toISOString(),
      // unitId left empty: dataService assigns the next deterministic UNIT-####
      imageSha256: report.securityAudit?.cleanImageSha256 || currentSha256 || undefined
    };
    const newRecord = isVisuallyVerified(report, po)
      ? buildRecordFromInspection(report, po, ctx)
      : buildPendingRecordFromInspection(report, po, ctx);
    onSubmitRecord(newRecord);
    onInspectionIngested(report.inspectionId, newRecord.recordId);
  };

  const handleNewInspection = () => {
    clearResult();
    appliedInspectionRef.current = null;
    onOpenInspection(null);
  };

  const runLabel = isLoading ? 'Running inspection…' : 'Run inspection';

  return (
    <div className="stack">

      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="page-eyebrow">Inbound dock · Stage 01 of 05</div>
          <h1 className="page-title">New receiving inspection</h1>
          <p className="page-subtitle">
            Compare a delivery photo against its purchase order line. Each finding is argued by a Prosecutor,
            challenged by a Defender and checked by a Blind Verifier that only sees the cropped image region.
          </p>
        </div>
        <div className="page-actions">
          {report && (
            <button type="button" className="btn-secondary" onClick={handleNewInspection}>
              <RotateCcw size={15} />
              New inspection
            </button>
          )}
          <button type="button" className="btn-primary btn-lg" onClick={handleRunVerification} disabled={isLoading}>
            {isLoading ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
            {runLabel}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="notice notice-error fade-in" role="alert">
          <AlertCircle size={16} />
          <div style={{ flex: 1 }}>{errorMessage}</div>
          <button type="button" className="btn-ghost btn-icon" onClick={() => setErrorMessage(null)} aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Step 1 — choose shipment source */}
      <section className="panel">
        <div className="panel-header">
          <div className="row" style={{ gap: 10 }}>
            <span className="step-num done">1</span>
            <div>
              <div className="panel-title">Select shipment</div>
              <div className="panel-subtitle">
                {isCustomMode ? 'Upload a photo taken at the dock.' : 'Pick one of the 10 reference scenarios, or upload your own photo.'}
              </div>
            </div>
          </div>
          <div className="segmented" role="tablist" aria-label="Inspection source">
            <button type="button" role="tab" aria-selected={!isCustomMode} className={!isCustomMode ? 'active' : ''} onClick={() => handleModeChange(false)}>
              <Layers size={14} />
              Test scenarios
            </button>
            <button type="button" role="tab" aria-selected={isCustomMode} className={isCustomMode ? 'active' : ''} onClick={() => handleModeChange(true)}>
              <UploadCloud size={14} />
              Upload photo
            </button>
          </div>
        </div>

        <div className="panel-body">
          {!isCustomMode ? (
            scenariosError ? (
              <div className="notice notice-error">
                <AlertCircle size={16} />
                <div>{scenariosError}</div>
              </div>
            ) : (
              <ScenarioSelector
                scenarios={scenarios}
                selectedScenarioId={selectedScenarioId}
                onSelectScenario={handleSelectScenario}
              />
            )
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              <div
                className={`dropzone ${dragActive ? 'active' : ''} ${customFile ? 'has-file' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('custom-file-input')?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    document.getElementById('custom-file-input')?.click();
                  }
                }}
              >
                <input
                  type="file"
                  id="custom-file-input"
                  style={{ display: 'none' }}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) handleFileSelect(e.target.files[0]);
                  }}
                />
                <UploadCloud size={26} color={customFile ? 'var(--ok-text)' : 'var(--text-dim)'} style={{ margin: '0 auto 6px', display: 'block' }} />
                {customFile ? (
                  <>
                    <div style={{ fontWeight: 500, color: 'var(--ok-text)' }}>{customFile.name}</div>
                    <div className="xsmall muted">{(customFile.size / 1024).toFixed(1)} KB · click to replace</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 500 }}>Drop a receiving photo here, or click to browse</div>
                    <div className="xsmall dim">JPEG, PNG or WEBP · up to 15 MB · EXIF/GPS metadata is stripped before hashing</div>
                  </>
                )}
              </div>
              <div className="notice notice-info">
                <Info size={16} />
                <div>
                  {visionModel ? (
                    <>
                      Uploaded photos are sanitised (EXIF removed), SHA-256 hashed and inspected by the vision model
                      <strong> {visionModel}</strong> (Prosecutor, Defender and an isolated Blind Verifier). If the model fails,
                      times out or cannot determine something from the photo, the result is <strong>UNCERTAIN</strong> and
                      can only be recorded as pending review.
                    </>
                  ) : (
                    <>
                      No vision model is configured on the server. Uploaded photos are sanitised (EXIF removed) and SHA-256
                      hashed, but they are not compared with the purchase order, so an upload returns
                      <strong> UNCERTAIN</strong> (visual verification unavailable), is never reported as a match, and can
                      only be recorded as pending review.
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Step 2 — expected vs evidence */}
      <div className="inspect-layout">
        <POEditorPanel
          po={currentPo}
          onPoChange={handlePoChange}
          onRunVerification={handleRunVerification}
          isLoading={isLoading}
          scenarioDetails={isCustomMode ? undefined : selectedScenarioDetails}
        />

        <VisualEvidenceViewer
          rawImageDataUrl={currentImageBase64}
          annotatedImageDataUrl={annotatedImageBase64}
          sha256Hash={currentSha256}
          debatedClaims={report?.debatedClaims || []}
          onClaimClick={(claim) => setSelectedDossierClaim(claim)}
        />
      </div>

      {/* Step 3 — results */}
      <div ref={resultsRef} style={{ scrollMarginTop: 120 }} className="stack">
        {report ? (
          <>
            <StructuredReportView
              report={report}
              po={historyEntry?.po || currentPo}
              tenantId={tenantId}
              ingested={ingested}
              recordId={historyEntry?.recordId}
              onIngest={handleIngestToTerminal}
              onViewDashboard={onNavigateToDashboard}
              onClaimClick={(claim) => setSelectedDossierClaim(claim)}
            />

            <DebatePipelineVisualizer
              debatedClaims={report.debatedClaims}
              onClaimClick={(claim) => setSelectedDossierClaim(claim)}
            />

            {report.evidenceGraph && (
              <EvidenceGraph
                evidenceGraph={report.evidenceGraph}
                debatedClaims={report.debatedClaims}
                onClaimClick={(claim) => setSelectedDossierClaim(claim)}
              />
            )}
          </>
        ) : (
          <section className="panel">
            <div className="panel-header">
              <div className="row" style={{ gap: 10 }}>
                <span className="step-num">3</span>
                <div className="panel-title">Inspection results</div>
              </div>
            </div>
            {isLoading ? (
              <EmptyState icon={RefreshCw} title="Running inspection…">
                Generating claims, running the three verification roles and building the evidence graph.
              </EmptyState>
            ) : (
              <EmptyState icon={ScanSearch} title="No result yet">
                Review the purchase order and photo above, then select <strong>Run inspection</strong>.
              </EmptyState>
            )}
          </section>
        )}
      </div>

      <InspectionHistory
        entries={history}
        activeId={report?.inspectionId}
        onOpen={(id) => {
          const entry = history.find((h) => h.report.inspectionId === id);
          if (entry) restoreEntry(entry);
          onOpenInspection(id);
        }}
      />

      {/* Claim dossier */}
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
