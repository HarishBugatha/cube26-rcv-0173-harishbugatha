import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  Layers, 
  UploadCloud, 
  PackageMinus, 
  PackagePlus, 
  Barcode, 
  Tag, 
  Boxes, 
  Droplets, 
  Scissors, 
  Puzzle, 
  EyeOff
} from 'lucide-react';

const SCENARIO_ICONS = {
  'scenario-1-correct': CheckCircle2,
  'scenario-2-short-quantity': PackageMinus,
  'scenario-3-extra-quantity': PackagePlus,
  'scenario-4-wrong-sku': Barcode,
  'scenario-5-wrong-variant': Tag,
  'scenario-6-crushed-packaging': Boxes,
  'scenario-7-water-damage': Droplets,
  'scenario-8-torn-packaging': Scissors,
  'scenario-9-missing-component': Puzzle,
  'scenario-10-ambiguous': HelpCircle
};

export default function ScenarioSelector({ 
  scenarios = [], 
  selectedScenarioId, 
  onSelectScenario, 
  isCustomMode, 
  onToggleCustomMode 
}) {
  return (
    <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="var(--accent-cyan)" />
            PRD-3 Verification Test Suite (10 Standard Scenarios)
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Select any predefined PRD scenario to test automated adversarial verification or upload custom receiving photos.
          </p>
        </div>

        <button
          onClick={onToggleCustomMode}
          className={isCustomMode ? 'btn-primary' : 'btn-secondary'}
          style={{ fontSize: '0.85rem', padding: '8px 16px' }}
        >
          <UploadCloud size={16} />
          {isCustomMode ? 'Preset Scenarios Mode' : 'Upload Custom Receiving Photo'}
        </button>
      </div>

      {!isCustomMode && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '10px'
        }}>
          {scenarios.map((scenario) => {
            const isSelected = selectedScenarioId === scenario.id;
            const Icon = SCENARIO_ICONS[scenario.id] || AlertTriangle;
            
            let verdictColor = '#10b981';
            let verdictBg = 'rgba(16, 185, 129, 0.15)';
            if (scenario.expectedVerdict === 'EXCEPTION') {
              verdictColor = '#ef4444';
              verdictBg = 'rgba(239, 68, 68, 0.15)';
            } else if (scenario.expectedVerdict === 'UNCERTAIN') {
              verdictColor = '#f59e0b';
              verdictBg = 'rgba(245, 158, 11, 0.15)';
            }

            return (
              <div
                key={scenario.id}
                onClick={() => onSelectScenario(scenario.id)}
                className={`glass-card glass-card-interactive ${isSelected ? 'selected-scenario' : ''}`}
                style={{
                  padding: '12px 14px',
                  border: isSelected ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  background: isSelected ? 'rgba(6, 182, 212, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                  boxShadow: isSelected ? 'var(--glow-cyan)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      padding: '6px',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? '#22d3ee' : '#94a3b8'
                    }}>
                      <Icon size={16} />
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: isSelected ? '#ffffff' : '#e2e8f0', lineHeight: '1.2' }}>
                      {scenario.name.replace(/^\d+\.\s*/, '')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{
                    fontSize: '0.68rem',
                    fontFamily: 'monospace',
                    color: '#94a3b8'
                  }}>
                    {scenario.po?.expectedSku}
                  </span>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: '700',
                    color: verdictColor,
                    background: verdictBg,
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    {scenario.expectedVerdict}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
