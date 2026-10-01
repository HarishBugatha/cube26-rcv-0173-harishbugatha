import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import Header from './components/Header';
import ScenarioSelector from './components/ScenarioSelector';
import POEditorPanel from './components/POEditorPanel';
import VisualEvidenceViewer from './components/VisualEvidenceViewer';
import DebatePipelineVisualizer from './components/DebatePipelineVisualizer';
import EvidenceGraph from './components/EvidenceGraph';
import DossierModal from './components/DossierModal';
import StructuredReportView from './components/StructuredReportView';

export default function App() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('scenario-1-correct');
  const [scenarioDetails, setScenarioDetails] = useState(null);
  
  // Custom upload state
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customFile, setCustomFile] = useState(null);
  const [customImageDataUrl, setCustomImageDataUrl] = useState(null);

  // Active PO state
  const [po, setPo] = useState({
    poNumber: 'PO-2026-9041',
    vendor: 'Nexus Industrial Tech Corp',
    expectedSku: 'SKU-EL-1044',
    productName: 'Industrial Ethernet Gateway (Steel Blue, 4-Port)',
    expectedQuantity: 4,
    expectedVariant: 'Steel Blue / 4-Port Gigabit / DIN-Rail',
    expectedComponents: ['Gateway Unit', '24V Power Adapter', 'DIN Rail Mount', 'Terminal Block'],
    carrierTracking: '1Z999AA10123456784',
    notes: 'Standard warehouse receiving. Verify all 4 units and intact seal.'
  });

  // Verification & Report state
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [selectedClaimForDossier, setSelectedClaimForDossier] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);

  // Fetch scenarios and health on mount
  useEffect(() => {
    fetch('/api/scenarios')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setScenarios(data.scenarios);
          loadScenarioDetails('scenario-1-correct');
        }
      })
      .catch(err => console.error('Failed to load scenarios:', err));

    fetch('/api/health')
      .then(r => r.json())
      .then(health => setSystemHealth(health))
      .catch(err => console.error('Health check error:', err));
  }, []);

  // Load a scenario's visual and PO details
  const loadScenarioDetails = async (id) => {
    try {
      const res = await fetch(`/api/scenarios/${id}`);
      const data = await res.json();
      if (data.success) {
        setScenarioDetails(data.scenario);
        setPo({ ...data.scenario.po });
        // Automatically run verification on scenario selection for instant feedback
        runScenarioVerification(id, data.scenario.po);
      }
    } catch (err) {
      console.error('Failed to load scenario details:', err);
    }
  };

  const handleSelectScenario = (id) => {
    setSelectedScenarioId(id);
    setIsCustomMode(false);
    setCustomFile(null);
    loadScenarioDetails(id);
  };

  const handlePoChange = (field, value) => {
    setPo(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomFileSelect = (file) => {
    setCustomFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setCustomImageDataUrl(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const toggleCustomMode = () => {
    setIsCustomMode(prev => !prev);
    if (!isCustomMode) {
      setPo({
        poNumber: `PO-${Date.now().toString().slice(-6)}`,
        vendor: 'Custom Industrial Supplier Ltd',
        expectedSku: 'SKU-CUSTOM-900',
        productName: 'Custom Receiving Package',
        expectedQuantity: 1,
        expectedVariant: 'Standard',
        expectedComponents: ['Primary Unit', 'Accessory Pack'],
        carrierTracking: '1Z999CUSTOM123',
        notes: 'Custom inspection upload.'
      });
      setReport(null);
      setScenarioDetails(null);
    } else {
      loadScenarioDetails(selectedScenarioId);
    }
  };

  // Run verification for Scenario
  const runScenarioVerification = async (id = selectedScenarioId, currentPo = po) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/verify/scenario/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ po: currentPo })
      });
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
        if (data.report.finalVerdict === 'ACCEPT') {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      }
    } catch (err) {
      console.error('Error running verification:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Run verification for Custom Upload
  const runCustomVerification = async () => {
    if (!customFile && !customImageDataUrl) {
      alert('Please upload a receiving photo first.');
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      if (customFile) {
        formData.append('photo', customFile);
      } else {
        formData.append('imageDataUrl', customImageDataUrl);
      }
      formData.append('poNumber', po.poNumber);
      formData.append('vendor', po.vendor);
      formData.append('expectedSku', po.expectedSku);
      formData.append('productName', po.productName);
      formData.append('expectedQuantity', po.expectedQuantity);
      formData.append('expectedVariant', po.expectedVariant);
      formData.append('expectedComponents', JSON.stringify(po.expectedComponents || []));
      formData.append('carrierTracking', po.carrierTracking);
      formData.append('notes', po.notes);

      const res = await fetch('/api/verify/custom', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
        if (data.report.finalVerdict === 'ACCEPT') {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        }
      } else {
        alert(data.error || 'Verification failed');
      }
    } catch (err) {
      console.error('Error running custom verification:', err);
      alert('Verification error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunVerification = () => {
    if (isCustomMode) {
      runCustomVerification();
    } else {
      runScenarioVerification(selectedScenarioId, po);
    }
  };

  const currentRawImage = isCustomMode 
    ? customImageDataUrl 
    : scenarioDetails?.imageDataUrl;
  
  const currentAnnotatedImage = report?.annotatedImageBase64;
  const currentMasterHash = report?.securityAudit?.cleanImageSha256 || scenarioDetails?.sha256;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 20px 60px' }}>
      
      {/* Top Header & Security Bar */}
      <Header systemHealth={systemHealth} />

      {/* PRD-3 Test Scenario Carousel */}
      <ScenarioSelector 
        scenarios={scenarios}
        selectedScenarioId={selectedScenarioId}
        onSelectScenario={handleSelectScenario}
        isCustomMode={isCustomMode}
        onToggleCustomMode={toggleCustomMode}
      />

      {/* Main Two-Column Layout: PO Input vs Visual Evidence */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(360px, 1fr) minmax(420px, 1.3fr)',
        gap: '24px',
        marginBottom: '24px'
      }}>
        
        {/* Left Column: PO Editor & Ingestion */}
        <POEditorPanel 
          po={po}
          onPoChange={handlePoChange}
          onRunVerification={handleRunVerification}
          isLoading={isLoading}
          isCustomMode={isCustomMode}
          customFile={customFile}
          onFileSelect={handleCustomFileSelect}
          scenarioDetails={scenarioDetails}
        />

        {/* Right Column: Visual Evidence & Bounding Boxes */}
        <VisualEvidenceViewer 
          rawImageDataUrl={currentRawImage}
          annotatedImageDataUrl={currentAnnotatedImage}
          sha256Hash={currentMasterHash}
          debatedClaims={report?.debatedClaims || []}
          onClaimClick={(claim) => setSelectedClaimForDossier(claim)}
        />

      </div>

      {/* 3-Role DEBATE Adversarial Pipeline Visualizer */}
      {report && (
        <DebatePipelineVisualizer 
          debatedClaims={report.debatedClaims || []}
          onClaimClick={(claim) => setSelectedClaimForDossier(claim)}
        />
      )}

      {/* Interactive Evidence Graph */}
      {report && report.evidenceGraph && (
        <EvidenceGraph 
          evidenceGraph={report.evidenceGraph}
          onClaimClick={(claim) => setSelectedClaimForDossier(claim)}
          onVerdictClick={() => {
            if (report.debatedClaims?.length > 0) {
              setSelectedClaimForDossier(report.debatedClaims[0]);
            }
          }}
        />
      )}

      {/* Structured Report & Export Actions */}
      {report && (
        <StructuredReportView report={report} />
      )}

      {/* Dossier Modal when clicking on any claim / FAIL */}
      {selectedClaimForDossier && (
        <DossierModal 
          claim={selectedClaimForDossier}
          onClose={() => setSelectedClaimForDossier(null)}
          masterImageHash={currentMasterHash}
        />
      )}

    </div>
  );
}
