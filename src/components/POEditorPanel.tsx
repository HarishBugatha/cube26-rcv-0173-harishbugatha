import React, { useState } from 'react';
import { 
  FileText, 
  Play, 
  RefreshCw, 
  UploadCloud
} from 'lucide-react';
import { PRDScenario, PRDScenarioPo } from '../types/receiving';

interface POEditorPanelProps {
  po: PRDScenarioPo;
  onPoChange: (field: keyof PRDScenarioPo, value: any) => void;
  onRunVerification: () => void;
  isLoading: boolean;
  isCustomMode: boolean;
  customFile: File | null;
  onFileSelect: (file: File) => void;
  scenarioDetails?: PRDScenario;
}

export const POEditorPanel: React.FC<POEditorPanelProps> = ({ 
  po, 
  onPoChange, 
  onRunVerification, 
  isLoading, 
  isCustomMode, 
  customFile, 
  onFileSelect,
  scenarioDetails 
}) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '22px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Panel Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={20} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc' }}>
            {isCustomMode ? 'Custom PO & Photo Ingestion' : 'Purchase Order Specification'}
          </h2>
        </div>
        {scenarioDetails && !isCustomMode && (
          <span style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.05)',
            color: '#94a3b8',
            fontFamily: 'monospace'
          }}>
            {scenarioDetails.category}
          </span>
        )}
      </div>

      {/* Custom Upload Dropzone if in Custom Mode */}
      {isCustomMode && (
        <div 
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragActive ? 'var(--accent-cyan)' : customFile ? '#10b981' : '#475569'}`,
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            textAlign: 'center',
            marginBottom: '18px',
            background: dragActive ? 'rgba(6, 182, 212, 0.1)' : customFile ? 'rgba(16, 185, 129, 0.05)' : 'rgba(15, 23, 42, 0.4)',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
          onClick={() => {
            const input = document.getElementById('custom-file-input') as HTMLInputElement | null;
            if (input) input.click();
          }}
        >
          <input 
            type="file" 
            id="custom-file-input" 
            style={{ display: 'none' }} 
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onFileSelect(e.target.files[0]);
              }
            }}
          />
          <UploadCloud size={32} color={customFile ? '#10b981' : '#94a3b8'} style={{ margin: '0 auto 8px' }} />
          {customFile ? (
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: '600', color: '#34d399' }}>
                ✓ {customFile.name} ({(customFile.size / 1024).toFixed(1)} KB)
              </p>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                EXIF metadata will be stripped automatically before hashing.
              </p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: '600', color: '#e2e8f0' }}>
                Click to upload or drag & drop receiving photo
              </p>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                JPEG, PNG, WEBP (Max 15MB) • Automatic EXIF Sanitization
              </p>
            </div>
          )}
        </div>
      )}

      {/* PO Form Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        
        {/* PO Number */}
        <div>
          <label style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
            PO NUMBER
          </label>
          <input 
            type="text" 
            value={po.poNumber || ''} 
            onChange={(e) => onPoChange('poNumber', e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '8px 10px',
              color: '#ffffff',
              fontFamily: 'monospace',
              fontSize: '0.85rem'
            }}
          />
        </div>

        {/* Expected SKU */}
        <div>
          <label style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
            EXPECTED SKU
          </label>
          <input 
            type="text" 
            value={po.expectedSku || ''} 
            onChange={(e) => onPoChange('expectedSku', e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '8px 10px',
              color: '#38bdf8',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              fontSize: '0.85rem'
            }}
          />
        </div>

        {/* Expected Quantity */}
        <div>
          <label style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
            EXPECTED QUANTITY
          </label>
          <input 
            type="number" 
            value={po.expectedQuantity ?? 1} 
            onChange={(e) => onPoChange('expectedQuantity', parseInt(e.target.value, 10) || 0)}
            style={{
              width: '100%',
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '8px 10px',
              color: '#ffffff',
              fontFamily: 'monospace',
              fontSize: '0.85rem'
            }}
          />
        </div>

        {/* Vendor */}
        <div>
          <label style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
            VENDOR
          </label>
          <input 
            type="text" 
            value={po.vendor || ''} 
            onChange={(e) => onPoChange('vendor', e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '8px 10px',
              color: '#ffffff',
              fontSize: '0.85rem'
            }}
          />
        </div>

      </div>

      {/* Product Name */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
          PRODUCT TITLE / CATALOG ITEM
        </label>
        <input 
          type="text" 
          value={po.productName || ''} 
          onChange={(e) => onPoChange('productName', e.target.value)}
          style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '8px 10px',
            color: '#f8fafc',
            fontSize: '0.85rem'
          }}
        />
      </div>

      {/* Variant Specifications */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
          EXPECTED VARIANT (COLOR / MODEL / SPEC)
        </label>
        <input 
          type="text" 
          value={po.expectedVariant || ''} 
          onChange={(e) => onPoChange('expectedVariant', e.target.value)}
          style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '8px 10px',
            color: '#f8fafc',
            fontSize: '0.85rem'
          }}
        />
      </div>

      {/* Expected Components */}
      {po.expectedComponents && po.expectedComponents.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
            EXPECTED KIT COMPONENTS ({po.expectedComponents.length})
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {po.expectedComponents.map((comp, idx) => (
              <span key={idx} style={{
                background: 'rgba(51, 65, 85, 0.5)',
                border: '1px solid var(--border-subtle)',
                color: '#cbd5e1',
                fontSize: '0.74rem',
                padding: '3px 8px',
                borderRadius: '4px'
              }}>
                • {comp}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes / Special Instructions */}
      <div style={{ marginBottom: '18px', flexGrow: 1 }}>
        <label style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
          RECEIVING NOTES / PRD SCENARIO CRITERIA
        </label>
        <div style={{
          background: 'rgba(15, 23, 42, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '6px',
          padding: '8px 12px',
          color: '#94a3b8',
          fontSize: '0.8rem',
          minHeight: '44px'
        }}>
          {scenarioDetails?.description || po.notes || 'Strict verification enabled.'}
        </div>
      </div>

      {/* Execution Trigger Button */}
      <button
        type="button"
        onClick={onRunVerification}
        disabled={isLoading}
        className="btn-primary"
        style={{
          width: '100%',
          justifyContent: 'center',
          padding: '14px',
          fontSize: '1rem',
          background: isLoading ? 'rgba(51, 65, 85, 0.8)' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
        }}
      >
        {isLoading ? (
          <>
            <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Executing 3-Role DEBATE Workflow...</span>
          </>
        ) : (
          <>
            <Play size={18} />
            <span>Run DEBATE Adversarial Verification</span>
          </>
        )}
      </button>

    </div>
  );
};

export default POEditorPanel;
