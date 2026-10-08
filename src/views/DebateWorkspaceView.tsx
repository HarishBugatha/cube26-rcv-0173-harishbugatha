import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Play, RotateCcw, Square, AlertCircle, X, UploadCloud, Layers, Plus, Info } from 'lucide-react';
import {
  PRDScenario,
  PRDScenarioPo,
  DebateInspectionReport,
  DebatedClaim,
  ReceivingRecord,
  TenantId,
} from '../types/receiving';
import { buildRecordFromInspection, buildPendingRecordFromInspection, isVisuallyVerified } from '../services/inspectionRecord';
import { streamInspection, InspectionRequestError } from '../services/inspectionStream';
import ScenarioSelector from '../components/ScenarioSelector';
import PhotoStage, { StageBox, isWholeFrame } from '../components/PhotoStage';
import LiveRun, { initialRun, runReducer } from '../components/LiveRun';
import DebatePipelineVisualizer from '../components/DebatePipelineVisualizer';
import EvidenceGraph from '../components/EvidenceGraph';
import DossierModal from '../components/DossierModal';
import StructuredReportView from '../components/StructuredReportView';
import InspectionHistory, { InspectionHistoryEntry } from '../components/InspectionHistory';

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

/** A real delivery starts with an empty order: the operator enters what was ordered. */
const EMPTY_PO: PRDScenarioPo = {
  poNumber: '',
  vendor: '',
  expectedSku: '',
  productName: '',
  expectedQuantity: 1,
  expectedVariant: '',
  expectedComponents: [],
  carrierTracking: '',
  notes: '',
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
const MAX_BYTES = 15 * 1024 * 1024;

function checkFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    return heic
      ? 'HEIC photos (iPhone default) are not supported. Export the photo as JPEG, or set the camera to "Most Compatible".'
      : `"${file.name}" is not a JPEG, PNG, WEBP or TIFF image.`;
  }
  if (file.size > MAX_BYTES) return `"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB; the limit is 15 MB.`;
  return null;
}

export const DebateWorkspaceView: React.FC<DebateWorkspaceViewProps> = ({
  tenantId,
  operatorId,
  onSubmitRecord,
  onNavigateToDashboard,
  history,
  openInspectionId,
  onOpenInspection,
  onInspectionComplete,
  onInspectionIngested,
}) => {
  const [mode, setMode] = useState<'upload' | 'scenario'>('upload');
  const [scenarios, setScenarios] = useState<PRDScenario[]>([]);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState('scenario-1-correct');
  const [scenarioImage, setScenarioImage] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadPo, setUploadPo] = useState<PRDScenarioPo>(EMPTY_PO);
  const [scenarioPo, setScenarioPo] = useState<PRDScenarioPo>(EMPTY_PO);
  const [componentDraft, setComponentDraft] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [run, dispatch] = useReducer(runReducer, initialRun);
  const [report, setReport] = useState<DebateInspectionReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dossierClaim, setDossierClaim] = useState<DebatedClaim | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | undefined>();
  const [restoredImage, setRestoredImage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const appliedRef = useRef<string | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const po = mode === 'upload' ? uploadPo : scenarioPo;
  const setPo = mode === 'upload' ? setUploadPo : setScenarioPo;
  const running = run.phase === 'running';
  const photo = restoredImage ?? (mode === 'upload' ? fileUrl : scenarioImage);
  const historyEntry = report ? history.find((h) => h.report.inspectionId === report.inspectionId) : undefined;
  const scenario = scenarios.find((s) => s.id === scenarioId);

  // Scenario list (test fixtures)
  useEffect(() => {
    fetch('/api/scenarios')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((d) => {
        setScenarios(d.scenarios || []);
        setScenariosError(null);
      })
      .catch(() => setScenariosError('The inspection server is not reachable. Start it with "node server/server.js" (port 3001).'));
  }, []);

  useEffect(() => {
    if (mode !== 'scenario') return;
    let alive = true;
    fetch(`/api/scenarios/${scenarioId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.scenario) return;
        setScenarioImage(d.scenario.imageDataUrl || '');
        setScenarioPo({ ...EMPTY_PO, ...d.scenario.po });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [mode, scenarioId]);

  // ponytail: object URLs of earlier uploads are kept (history entries show them); fine for a session
  // Cancel an in-flight run when leaving the page
  useEffect(() => () => abortRef.current?.abort(), []);

  const clearResult = () => {
    // Detach first so the cancelled run's late callbacks see they are stale and stay silent
    const pending = abortRef.current;
    abortRef.current = null;
    pending?.abort();
    dispatch({ type: 'reset' });
    setReport(null);
    setErrorMessage(null);
    setRestoredImage(null);
    appliedRef.current = null;
  };

  const restoreEntry = (inspectionId: string) => {
    const entry = history.find((h) => h.report.inspectionId === inspectionId);
    if (!entry) return;
    clearResult(); // also cancels any run in flight
    appliedRef.current = inspectionId;
    setReport(entry.report);
    setRestoredImage(entry.rawImageUrl);
  };

  // Open an inspection from history / dashboard
  useEffect(() => {
    if (openInspectionId === appliedRef.current) return;
    if (!openInspectionId) {
      if (appliedRef.current) clearResult();
      return;
    }
    restoreEntry(openInspectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInspectionId]);

  const chooseFile = (f: File) => {
    if (running) return;
    const problem = checkFile(f);
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    clearResult();
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
  };

  const updatePo = (field: keyof PRDScenarioPo, value: any) => {
    setPo((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const addComponent = () => {
    const parts = componentDraft.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    updatePo('expectedComponents', [...(po.expectedComponents || []), ...parts].slice(0, 50));
    setComponentDraft('');
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (mode === 'upload' && !file) errs.file = 'Add a delivery photo.';
    if (!po.expectedSku.trim()) errs.expectedSku = 'Enter the SKU that was ordered.';
    if (!Number.isInteger(po.expectedQuantity) || po.expectedQuantity < 1) errs.expectedQuantity = 'Enter a whole number of units (1 or more).';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const runInspection = async () => {
    if (running || !validate()) return;
    clearResult();
    const runPhoto = mode === 'upload' ? fileUrl : scenarioImage; // not a restored history image
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'start' });

    let url: string;
    let init: RequestInit;
    if (mode === 'upload' && file) {
      const form = new FormData();
      form.append('photo', file);
      if (po.poNumber.trim()) form.append('poNumber', po.poNumber.trim());
      if (po.vendor.trim()) form.append('vendor', po.vendor.trim());
      form.append('expectedSku', po.expectedSku.trim());
      if (po.productName.trim()) form.append('productName', po.productName.trim());
      form.append('expectedQuantity', String(po.expectedQuantity));
      if (po.expectedVariant.trim()) form.append('expectedVariant', po.expectedVariant.trim());
      form.append('expectedComponents', JSON.stringify(po.expectedComponents || []));
      url = '/api/verify/custom';
      init = { method: 'POST', headers: { 'X-Org-Id': tenantId }, body: form };
    } else {
      url = `/api/verify/scenario/${scenarioId}`;
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Org-Id': tenantId },
        body: JSON.stringify({ po }),
      };
    }

    try {
      const result = await streamInspection(
        url,
        init,
        (event) => { if (abortRef.current === controller) dispatch({ type: 'event', event }); },
        controller.signal
      );
      if (abortRef.current !== controller) return; // superseded while finishing
      dispatch({ type: 'finish' });
      const poSnapshot = { ...po };
      appliedRef.current = result.inspectionId;
      setReport(result);
      onInspectionComplete({
        report: { ...result, scenarioId: mode === 'scenario' ? scenarioId : undefined },
        po: poSnapshot,
        tenantId,
        sourceLabel: mode === 'upload' ? `Photo · ${file?.name || 'upload'}` : (scenario?.name || 'Test scenario').replace(/^\d+\.\s*/, ''),
        rawImageUrl: runPhoto,
        ingested: false,
      });
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      if (abortRef.current !== controller) return; // a newer action replaced this run
      if ((err as Error)?.name === 'AbortError') {
        dispatch({ type: 'error', message: 'Cancelled by the operator.' });
        return;
      }
      const message = err instanceof InspectionRequestError ? err.message : 'The inspection failed unexpectedly.';
      dispatch({ type: 'error', message });
      setErrorMessage(message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  // Cancel keeps abortRef so the run's catch reports "Cancelled by the operator"
  const cancelRun = () => abortRef.current?.abort();

  const recordInspection = () => {
    if (!report || historyEntry?.ingested) return;
    const poUsed = historyEntry?.po || po;
    const ctx = {
      tenantId,
      operatorId,
      capturedAt: new Date().toISOString(),
      imageSha256: report.securityAudit?.cleanImageSha256 || undefined,
    };
    const record = isVisuallyVerified(report, poUsed)
      ? buildRecordFromInspection(report, poUsed, ctx)
      : buildPendingRecordFromInspection(report, poUsed, ctx);
    onSubmitRecord(record);
    onInspectionIngested(report.inspectionId, record.recordId);
  };

  const newInspection = () => {
    clearResult();
    onOpenInspection(null);
  };

  const openClaim = (claimId: string) => {
    const claim = report?.debatedClaims.find((c) => c.claimId === claimId);
    if (claim) setDossierClaim(claim);
  };

  // Regions on the photo: live from the stream, final from the report
  const boxes: StageBox[] = useMemo(() => {
    if (report) {
      return report.debatedClaims.map((c) => ({ claimId: c.claimId, bbox: c.bbox, label: c.claimTitle, status: c.status }));
    }
    return run.prosecutor.claims.map((c) => ({
      claimId: c.claimId,
      bbox: c.bbox,
      label: c.claimTitle,
      status: run.claims[c.claimId]?.status,
    }));
  }, [report, run.prosecutor.claims, run.claims]);

  const scanning = running && (run.prosecutor.status === 'active' || run.prosecutor.status === 'idle');
  const hud = running
    ? <><span className="live-dot" />{run.prosecutor.status === 'done' ? 'Debating findings' : 'Scanning'}</>
    : report
      ? <>
          {report.debatedClaims.length} finding(s)
          {boxes.some((b) => !isWholeFrame(b.bbox)) ? ' · click a region for evidence' : ' · see the report below'}
        </>
      : photo
        ? <>{mode === 'upload' ? file?.name : 'Scripted test image'}</>
        : null;

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="page-eyebrow">Inbound dock · stage 01 of 05</div>
          <h1 className="page-title">Inspect a delivery</h1>
          <p className="page-subtitle">
            Photograph what arrived, enter what was ordered, run. Three agents argue each difference and you see every step as it happens.
          </p>
        </div>
        <div className="page-actions">
          {(report || run.phase !== 'idle') && !running && (
            <button type="button" className="btn-secondary" onClick={newInspection}>
              <RotateCcw size={15} />
              New inspection
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="notice notice-error fade-in" role="alert">
          <AlertCircle size={16} />
          <div style={{ flex: 1 }}>{errorMessage}</div>
          <button type="button" className="btn-ghost btn-icon" onClick={() => setErrorMessage(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="run-layout">
        {/* ---------- Left: source + order ---------- */}
        <section className="panel" aria-label="Delivery and purchase order">
          <div className="panel-header">
            <div className="segmented" role="tablist" aria-label="Photo source">
              <button type="button" role="tab" aria-selected={mode === 'upload'} className={mode === 'upload' ? 'active' : ''}
                onClick={() => { if (!running) { clearResult(); setMode('upload'); } }}>
                <UploadCloud size={14} /> Photo
              </button>
              <button type="button" role="tab" aria-selected={mode === 'scenario'} className={mode === 'scenario' ? 'active' : ''}
                onClick={() => { if (!running) { clearResult(); setMode('scenario'); } }}>
                <Layers size={14} /> Test scenarios
              </button>
            </div>
          </div>

          <div className="panel-body">
            {mode === 'upload' ? (
              <div className="form-group">
                <span className="form-label">Delivery photo<span className="required">*</span></span>
                <div
                  className={`dropzone ${dragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files?.[0]) chooseFile(e.dataTransfer.files[0]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp,image/tiff"
                    onChange={(e) => { if (e.target.files?.[0]) chooseFile(e.target.files[0]); e.target.value = ''; }}
                  />
                  {file ? (
                    <>
                      <div style={{ fontWeight: 700 }} className="truncate">{file.name}</div>
                      <div className="xsmall muted">{(file.size / 1048576).toFixed(2)} MB · click to replace</div>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={24} style={{ margin: '0 auto 6px', display: 'block' }} />
                      <div style={{ fontWeight: 700 }}>Drop a photo or click to take / choose one</div>
                      <div className="xsmall dim">JPEG · PNG · WEBP · TIFF, up to 15 MB</div>
                    </>
                  )}
                </div>
                {fieldErrors.file && <div className="form-error-msg">{fieldErrors.file}</div>}
              </div>
            ) : scenariosError ? (
              <div className="notice notice-error"><AlertCircle size={16} /><div>{scenariosError}</div></div>
            ) : (
              <div className="form-group">
                <div className="notice notice-info" style={{ marginBottom: 10 }}>
                  <Info size={16} />
                  <div>Test scenarios replay scripted observations; no model is called. Use them to check the decision rules.</div>
                </div>
                <ScenarioSelector scenarios={scenarios} selectedScenarioId={scenarioId} onSelectScenario={(id) => { if (running) return; clearResult(); setScenarioId(id); }} />
              </div>
            )}

            <div className="row-between" style={{ margin: '6px 0 12px', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              <span className="panel-title">Ordered</span>
              <span className="xsmall dim">from the purchase order</span>
            </div>

            <div className="grid-2col">
              <div className="form-group">
                <label className="form-label" htmlFor="po-sku">SKU<span className="required">*</span></label>
                <input id="po-sku" className={`form-input mono ${fieldErrors.expectedSku ? 'error' : ''}`} value={po.expectedSku}
                  placeholder="e.g. SKU-4410" onChange={(e) => updatePo('expectedSku', e.target.value)} disabled={running} />
                {fieldErrors.expectedSku && <div className="form-error-msg">{fieldErrors.expectedSku}</div>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="po-qty">Units<span className="required">*</span></label>
                <input id="po-qty" className={`form-input mono ${fieldErrors.expectedQuantity ? 'error' : ''}`} type="number" min={1} step={1}
                  value={Number.isFinite(po.expectedQuantity) ? po.expectedQuantity : ''}
                  onChange={(e) => updatePo('expectedQuantity', e.target.value === '' ? NaN : Number(e.target.value))} disabled={running} />
                {fieldErrors.expectedQuantity && <div className="form-error-msg">{fieldErrors.expectedQuantity}</div>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="po-variant">Variant / spec</label>
              <input id="po-variant" className="form-input" value={po.expectedVariant} placeholder="colour, capacity, model"
                onChange={(e) => updatePo('expectedVariant', e.target.value)} disabled={running} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="po-product">Product</label>
              <input id="po-product" className="form-input" value={po.productName} onChange={(e) => updatePo('productName', e.target.value)} disabled={running} />
            </div>
            <div className="grid-2col">
              <div className="form-group">
                <label className="form-label" htmlFor="po-number">PO number</label>
                <input id="po-number" className="form-input mono" value={po.poNumber} onChange={(e) => updatePo('poNumber', e.target.value)} disabled={running} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="po-vendor">Supplier</label>
                <input id="po-vendor" className="form-input" value={po.vendor} onChange={(e) => updatePo('vendor', e.target.value)} disabled={running} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="po-comp">Kit components</label>
              <div className="row">
                <input id="po-comp" className="form-input" value={componentDraft} placeholder="add, comma separated"
                  onChange={(e) => setComponentDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComponent(); } }} disabled={running} />
                <button type="button" className="btn-secondary btn-icon" onClick={addComponent} aria-label="Add component" disabled={running}>
                  <Plus size={15} />
                </button>
              </div>
              {(po.expectedComponents || []).length > 0 && (
                <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {po.expectedComponents.map((c, i) => (
                    <span key={`${c}-${i}`} className="chip">
                      {c}
                      {!running && (
                        <button type="button" className="chip-remove" aria-label={`Remove ${c}`}
                          onClick={() => updatePo('expectedComponents', po.expectedComponents.filter((_, j) => j !== i))}>
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel-footer">
            {running ? (
              <button type="button" className="btn-secondary btn-block btn-lg" onClick={cancelRun}>
                <Square size={14} /> Cancel run
              </button>
            ) : (
              <button type="button" className="btn-primary btn-block btn-lg" onClick={runInspection}>
                <Play size={15} /> Run inspection
              </button>
            )}
          </div>
        </section>

        {/* ---------- Right: photo + live run ---------- */}
        <div className="run-main">
          <PhotoStage
            src={photo || undefined}
            boxes={boxes}
            scanning={scanning}
            hud={hud}
            onNaturalSize={setNaturalSize}
            onBoxClick={openClaim}
            emptyText={mode === 'upload' ? 'Add a delivery photo to start' : 'Loading test image…'}
          />
          <LiveRun run={run} photoUrl={photo || undefined} naturalSize={naturalSize} />
        </div>
      </div>

      <div ref={resultsRef} style={{ scrollMarginTop: 120 }} className="stack">
        {report && (
          <>
            <StructuredReportView
              report={report}
              po={historyEntry?.po || po}
              tenantId={tenantId}
              ingested={!!historyEntry?.ingested}
              recordId={historyEntry?.recordId}
              onIngest={recordInspection}
              onViewDashboard={onNavigateToDashboard}
              onClaimClick={setDossierClaim}
            />
            <DebatePipelineVisualizer debatedClaims={report.debatedClaims} onClaimClick={setDossierClaim} />
            {report.evidenceGraph && (
              <EvidenceGraph evidenceGraph={report.evidenceGraph} debatedClaims={report.debatedClaims} onClaimClick={setDossierClaim} />
            )}
          </>
        )}
      </div>

      <InspectionHistory
        entries={history}
        activeId={report?.inspectionId}
        onOpen={(id) => {
          restoreEntry(id); // works even when the parent's selected id has not changed
          onOpenInspection(id);
        }}
      />

      {dossierClaim && (
        <DossierModal
          claim={dossierClaim}
          onClose={() => setDossierClaim(null)}
          masterImageHash={report?.securityAudit?.cleanImageSha256 || ''}
        />
      )}
    </div>
  );
};

export default DebateWorkspaceView;
