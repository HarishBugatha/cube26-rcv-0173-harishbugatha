import React from 'react';
import { ClipboardList, Play, RefreshCw } from 'lucide-react';
import { PRDScenario, PRDScenarioPo } from '../types/receiving';

interface POEditorPanelProps {
  po: PRDScenarioPo;
  onPoChange: (field: keyof PRDScenarioPo, value: any) => void;
  onRunVerification: () => void;
  isLoading: boolean;
  scenarioDetails?: PRDScenario;
}

export const POEditorPanel: React.FC<POEditorPanelProps> = ({
  po,
  onPoChange,
  onRunVerification,
  isLoading,
  scenarioDetails
}) => {
  return (
    <section className="panel" aria-labelledby="po-panel-title">
      <div className="panel-header">
        <div className="row" style={{ gap: 10 }}>
          <span className="step-num done">2</span>
          <div>
            <div className="panel-title" id="po-panel-title">
              <ClipboardList size={16} />
              Expected · purchase order
            </div>
            <div className="panel-subtitle">What the supplier was asked to deliver.</div>
          </div>
        </div>
        {scenarioDetails && <span className="chip">{scenarioDetails.category}</span>}
      </div>

      <div className="panel-body">
        <div className="grid-2col">
          <div className="form-group">
            <label className="form-label" htmlFor="po-number">PO number</label>
            <input
              id="po-number"
              className="form-input font-mono"
              type="text"
              value={po.poNumber || ''}
              onChange={(e) => onPoChange('poNumber', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="po-sku">Expected SKU</label>
            <input
              id="po-sku"
              className="form-input font-mono"
              type="text"
              value={po.expectedSku || ''}
              onChange={(e) => onPoChange('expectedSku', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="po-qty">Expected quantity</label>
            <input
              id="po-qty"
              className="form-input font-mono"
              type="number"
              min={0}
              value={po.expectedQuantity ?? 1}
              onChange={(e) => onPoChange('expectedQuantity', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="po-vendor">Supplier</label>
            <input
              id="po-vendor"
              className="form-input"
              type="text"
              value={po.vendor || ''}
              onChange={(e) => onPoChange('vendor', e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="po-product">Product</label>
          <input
            id="po-product"
            className="form-input"
            type="text"
            value={po.productName || ''}
            onChange={(e) => onPoChange('productName', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="po-variant">Variant / spec (colour, model, capacity)</label>
          <input
            id="po-variant"
            className="form-input"
            type="text"
            value={po.expectedVariant || ''}
            onChange={(e) => onPoChange('expectedVariant', e.target.value)}
          />
        </div>

        {po.expectedComponents && po.expectedComponents.length > 0 && (
          <div className="form-group">
            <span className="form-label">Kit components ({po.expectedComponents.length})</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {po.expectedComponents.map((comp, idx) => (
                <span key={idx} className="chip">{comp}</span>
              ))}
            </div>
          </div>
        )}

        {(scenarioDetails?.description || po.notes) && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <span className="form-label">{scenarioDetails ? 'Scenario notes' : 'Receiving notes'}</span>
            <div className="field-readonly">{scenarioDetails?.description || po.notes}</div>
          </div>
        )}
      </div>

      <div className="panel-footer">
        <button type="button" className="btn-primary btn-block btn-lg" onClick={onRunVerification} disabled={isLoading}>
          {isLoading ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
          {isLoading ? 'Running inspection…' : 'Run inspection'}
        </button>
      </div>
    </section>
  );
};

export default POEditorPanel;
