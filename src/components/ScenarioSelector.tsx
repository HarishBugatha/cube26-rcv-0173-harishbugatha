import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  PackageMinus,
  PackagePlus,
  Barcode,
  Tag,
  Boxes,
  Droplets,
  Scissors,
  Puzzle
} from 'lucide-react';
import { PRDScenario } from '../types/receiving';
import { VERDICT_META } from './ui';

const SCENARIO_ICONS: Record<string, React.ElementType> = {
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

interface ScenarioSelectorProps {
  scenarios: PRDScenario[];
  selectedScenarioId: string;
  onSelectScenario: (id: string) => void;
}

export const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
  scenarios = [],
  selectedScenarioId,
  onSelectScenario,
}) => {
  if (scenarios.length === 0) {
    return <div className="small dim">Loading scenarios…</div>;
  }

  return (
    <div className="scenario-grid" role="listbox" aria-label="Reference scenarios">
      {scenarios.map((scenario) => {
        const isSelected = selectedScenarioId === scenario.id;
        const Icon = SCENARIO_ICONS[scenario.id] || AlertTriangle;
        const tone = VERDICT_META[scenario.expectedVerdict]?.tone || 'warn';

        return (
          <button
            type="button"
            key={scenario.id}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelectScenario(scenario.id)}
            className={`scenario-card ${isSelected ? 'selected' : ''}`}
            title={scenario.description}
          >
            <span className="scenario-card-title">
              <Icon size={15} />
              <span className="truncate" style={{ whiteSpace: 'normal' }}>
                {scenario.name.replace(/^\d+\.\s*/, '')}
              </span>
            </span>
            <span className="scenario-card-meta">
              <span className="mono truncate">{scenario.po?.expectedSku}</span>
              <span className={`pill pill-${tone}`} style={{ height: 18, fontSize: '0.64rem', padding: '0 6px' }} title="Expected outcome">
                {scenario.expectedVerdict}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ScenarioSelector;
