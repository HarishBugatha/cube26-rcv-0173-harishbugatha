import React, { useState, useEffect } from 'react';
import {
  Barcode,
  Camera,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  PlusCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  PurchaseOrderLine,
  DamageGrade,
  QualityFlag,
  ReceivingRecord,
  TenantId,
} from '../types/receiving';
import {
  compareShipment,
  generateContentHash,
} from '../services/comparisonEngine';
import {
  validateReceivingForm,
  ReceivingFormData,
} from '../services/validation';

export interface FormLiveValues {
  receivedSku: string;
  cartonsReceived: number | '';
  unitsPerCartonCounted: number | '';
  cartonDamage: DamageGrade;
  unitDamage: DamageGrade;
  qualityFlags: QualityFlag[];
  notes: string;
}

interface ReceivingFormProps {
  poLines: PurchaseOrderLine[];
  selectedPOLine: PurchaseOrderLine | null;
  onSelectPOLine: (po: PurchaseOrderLine) => void;
  onSubmitRecord: (record: ReceivingRecord) => void;
  operatorId: string;
  tenantId: TenantId;
  onLiveValuesChange?: (values: FormLiveValues) => void;
  onAddNewPOLine?: (po: PurchaseOrderLine) => void;
}

export const ReceivingForm: React.FC<ReceivingFormProps> = ({
  poLines,
  selectedPOLine,
  onSelectPOLine,
  onSubmitRecord,
  operatorId,
  tenantId,
  onLiveValuesChange,
  onAddNewPOLine,
}) => {
  // Form input state
  const [receivedSku, setReceivedSku] = useState('');
  const [cartonsReceived, setCartonsReceived] = useState<number | ''>('');
  const [unitsPerCartonCounted, setUnitsPerCartonCounted] = useState<number | ''>('');
  const [cartonDamage, setCartonDamage] = useState<DamageGrade>('none');
  const [unitDamage, setUnitDamage] = useState<DamageGrade>('none');
  const [qualityFlags, setQualityFlags] = useState<QualityFlag[]>([]);
  const [notes, setNotes] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Manual PO entry modal state
  const [showManualPOModal, setShowManualPOModal] = useState(false);
  const [manualPO, setManualPO] = useState({
    poNumber: '',
    supplier: '',
    sku: '',
    productTitle: '',
    cartonsOrdered: 2,
    unitsPerCartonOrdered: 12,
  });

  // Sync when selected PO changes
  useEffect(() => {
    if (selectedPOLine) {
      setReceivedSku(selectedPOLine.sku);
      setCartonsReceived(selectedPOLine.cartonsOrdered);
      setUnitsPerCartonCounted(selectedPOLine.unitsPerCartonOrdered);
      setCartonDamage('none');
      setUnitDamage('none');
      setQualityFlags([]);
      setFormErrors({});

      if (onLiveValuesChange) {
        onLiveValuesChange({
          receivedSku: selectedPOLine.sku,
          cartonsReceived: selectedPOLine.cartonsOrdered,
          unitsPerCartonCounted: selectedPOLine.unitsPerCartonOrdered,
          cartonDamage: 'none',
          unitDamage: 'none',
          qualityFlags: [],
          notes: '',
        });
      }
    }
  }, [selectedPOLine]);

  // Notify parent on any input change
  const notifyChange = (updated: Partial<FormLiveValues>) => {
    if (!onLiveValuesChange) return;
    onLiveValuesChange({
      receivedSku: updated.receivedSku !== undefined ? updated.receivedSku : receivedSku,
      cartonsReceived: updated.cartonsReceived !== undefined ? updated.cartonsReceived : cartonsReceived,
      unitsPerCartonCounted: updated.unitsPerCartonCounted !== undefined ? updated.unitsPerCartonCounted : unitsPerCartonCounted,
      cartonDamage: updated.cartonDamage !== undefined ? updated.cartonDamage : cartonDamage,
      unitDamage: updated.unitDamage !== undefined ? updated.unitDamage : unitDamage,
      qualityFlags: updated.qualityFlags !== undefined ? updated.qualityFlags : qualityFlags,
      notes: updated.notes !== undefined ? updated.notes : notes,
    });
  };

  const totalReceived =
    cartonsReceived !== '' && unitsPerCartonCounted !== ''
      ? Number(cartonsReceived) * Number(unitsPerCartonCounted)
      : 0;

  // Toggle quality flag
  const toggleQualityFlag = (flag: QualityFlag) => {
    const updated = qualityFlags.includes(flag)
      ? qualityFlags.filter((f) => f !== flag)
      : [...qualityFlags, flag];
    setQualityFlags(updated);
    notifyChange({ qualityFlags: updated });
  };

  // Quick preset test scenarios for buildathon evaluation
  const applyPresetScenario = (scenario: 'matched' | 'short' | 'over' | 'wrong_sku' | 'damaged' | 'uncertain') => {
    if (!selectedPOLine) return;
    setFormErrors({});
    let newSku = selectedPOLine.sku;
    let newCartons = selectedPOLine.cartonsOrdered;
    let newUnits = selectedPOLine.unitsPerCartonOrdered;
    let newCartonDamage: DamageGrade = 'none';
    let newUnitDamage: DamageGrade = 'none';
    let newFlags: QualityFlag[] = [];

    switch (scenario) {
      case 'matched':
        break;
      case 'short':
        newUnits = Math.max(1, selectedPOLine.unitsPerCartonOrdered - 2);
        break;
      case 'over':
        newCartons = selectedPOLine.cartonsOrdered + 1;
        break;
      case 'wrong_sku':
        newSku = `${selectedPOLine.sku}-ERR`;
        break;
      case 'damaged':
        newCartonDamage = 'crushing';
        newUnitDamage = 'water';
        break;
      case 'uncertain':
        newCartonDamage = 'uncertain';
        newUnitDamage = 'uncertain';
        break;
    }

    setReceivedSku(newSku);
    setCartonsReceived(newCartons);
    setUnitsPerCartonCounted(newUnits);
    setCartonDamage(newCartonDamage);
    setUnitDamage(newUnitDamage);
    setQualityFlags(newFlags);

    notifyChange({
      receivedSku: newSku,
      cartonsReceived: newCartons,
      unitsPerCartonCounted: newUnits,
      cartonDamage: newCartonDamage,
      unitDamage: newUnitDamage,
      qualityFlags: newFlags,
    });
  };

  const handleManualPOSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPO.poNumber || !manualPO.sku) return;

    const newPO: PurchaseOrderLine = {
      id: `${tenantId}_${manualPO.poNumber}_1`,
      poNumber: manualPO.poNumber.trim().toUpperCase(),
      poLine: 1,
      orgId: tenantId,
      supplier: manualPO.supplier || 'Dock Inbound Supplier',
      sku: manualPO.sku.trim().toUpperCase(),
      asin: 'B0CUSTOM001',
      productTitle: manualPO.productTitle || 'Manual Dock Delivery Item',
      specColour: 'standard',
      specVariant: 'standard',
      specComponents: 'unit',
      cartonsOrdered: Number(manualPO.cartonsOrdered) || 1,
      unitsPerCartonOrdered: Number(manualPO.unitsPerCartonOrdered) || 1,
      qtyOrdered: (Number(manualPO.cartonsOrdered) || 1) * (Number(manualPO.unitsPerCartonOrdered) || 1),
      status: 'PENDING',
    };

    if (onAddNewPOLine) {
      onAddNewPOLine(newPO);
    }
    onSelectPOLine(newPO);
    setShowManualPOModal(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPOLine) {
      setFormErrors({ poNumber: 'Please select a Purchase Order line item.' });
      return;
    }

    const formData: ReceivingFormData = {
      poNumber: selectedPOLine.poNumber,
      poLine: selectedPOLine.poLine,
      expectedSku: selectedPOLine.sku,
      receivedSku,
      cartonsReceived,
      unitsPerCartonCounted,
      cartonDamage,
      unitDamage,
      qualityFlags,
      operatorId,
      notes,
    };

    const validation = validateReceivingForm(formData);
    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    setFormErrors({});

    // Evaluate shipment
    const comparison = compareShipment({
      expectedSku: selectedPOLine.sku,
      receivedSku,
      qtyOrdered: selectedPOLine.qtyOrdered,
      qtyReceived: totalReceived,
      cartonDamage,
      unitDamage,
      qualityFlags,
    });

    const now = new Date().toISOString();
    const unitSeq = Math.floor(1000 + Math.random() * 9000);
    const unitId = `UNIT-${unitSeq}`;
    const recordId = `RCV-${unitSeq}`;

    const newRecord: ReceivingRecord = {
      recordId,
      unitId,
      orgId: tenantId,
      poNumber: selectedPOLine.poNumber,
      poLine: selectedPOLine.poLine,
      supplier: selectedPOLine.supplier,
      sku: selectedPOLine.sku,
      asin: selectedPOLine.asin,
      productTitle: selectedPOLine.productTitle,
      specColour: selectedPOLine.specColour,
      specVariant: selectedPOLine.specVariant,
      specComponents: selectedPOLine.specComponents,
      cartonsOrdered: selectedPOLine.cartonsOrdered,
      unitsPerCartonOrdered: selectedPOLine.unitsPerCartonOrdered,
      qtyOrdered: selectedPOLine.qtyOrdered,
      cartonsReceived: Number(cartonsReceived),
      unitsPerCartonCounted: Number(unitsPerCartonCounted),
      qtyReceived: totalReceived,
      receivedSku: receivedSku.trim().toUpperCase(),
      identityMatch: comparison.isSkuMatched ? 'yes' : 'no',
      cartonDamage,
      unitDamage,
      qualityFlags,
      photoRefs: [
        `fixtures/receiving/${unitId}_pallet.jpg`,
        `fixtures/receiving/${unitId}_carton.jpg`,
        `fixtures/receiving/${unitId}_unit.jpg`,
      ],
      operatorId,
      capturedAt: now,
      status: comparison.status,
      qtyDifference: comparison.qtyDifference,
      disposition: comparison.disposition,
      notes,
      contentHash: generateContentHash({
        poNumber: selectedPOLine.poNumber,
        poLine: selectedPOLine.poLine,
        sku: selectedPOLine.sku,
        qtyReceived: totalReceived,
        status: comparison.status,
        operatorId,
        capturedAt: now,
      }),
    };

    onSubmitRecord(newRecord);
    setSuccessToast(`Receiving Record ${recordId} confirmed! Status: ${comparison.status}`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  return (
    <div className="card-panel">
      {/* Header */}
      <div className="card-panel-header">
        <div className="card-panel-title">
          <Barcode size={19} style={{ color: '#38bdf8' }} />
          <span>Inbound Dock Receiving Terminal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderColor: '#3b82f6', color: '#93c5fd' }}
            onClick={() => setShowManualPOModal(true)}
            title="Create manual PO for incoming shipment"
          >
            <PlusCircle size={13} />
            + Custom PO
          </button>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
            STATION: BAY-03
          </span>
        </div>
      </div>

      <div className="card-panel-body">
        {/* Success Alert */}
        {successToast && (
          <div
            style={{
              padding: '0.85rem 1rem',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid #10b981',
              borderRadius: 'var(--radius-sm)',
              color: '#34d399',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <CheckCircle2 size={18} />
            <div>
              <strong>Record Logged Successfully:</strong> {successToast}
            </div>
          </div>
        )}

        {/* Step 1: PO Line Selection */}
        <div className="form-group">
          <label className="form-label" htmlFor="po-selector">
            <span className="step-badge">1</span>
            Select Inbound Purchase Order Line <span className="required">*</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select
              id="po-selector"
              className={`form-select ${formErrors.poNumber ? 'error' : ''}`}
              value={selectedPOLine ? selectedPOLine.id : ''}
              onChange={(e) => {
                const found = poLines.find((p) => p.id === e.target.value);
                if (found) onSelectPOLine(found);
              }}
            >
              <option value="">-- Choose Inbound PO Line ({poLines.length} active) --</option>
              {poLines.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber} [Line #{po.poLine}] — {po.supplier} — {po.productTitle} ({po.sku}) [{po.qtyOrdered} units]
                </option>
              ))}
            </select>
          </div>
          {formErrors.poNumber && (
            <div className="form-error-msg">
              <AlertCircle size={14} /> {formErrors.poNumber}
            </div>
          )}
        </div>

        {/* Expected Product Information Banner */}
        {selectedPOLine && (
          <div
            style={{
              backgroundColor: '#0a0f1d',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.725rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Supplier & Product Description
                </span>
                <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.925rem' }}>
                  {selectedPOLine.productTitle}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  Supplier: <strong style={{ color: '#cbd5e1' }}>{selectedPOLine.supplier}</strong>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.725rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Expected Units
                </span>
                <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8' }}>
                  {selectedPOLine.qtyOrdered} <span style={{ fontSize: '0.75rem' }}>units</span>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                flexWrap: 'wrap',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: '0.5rem',
                fontSize: '0.775rem',
                color: '#cbd5e1',
              }}
            >
              <div>
                SKU: <code className="font-mono" style={{ color: '#38bdf8', fontWeight: 600 }}>{selectedPOLine.sku}</code>
              </div>
              <div>•</div>
              <div>
                Packaging: <strong style={{ color: '#f8fafc' }}>{selectedPOLine.cartonsOrdered}</strong> ctns @ <strong style={{ color: '#f8fafc' }}>{selectedPOLine.unitsPerCartonOrdered}</strong> units/ctn
              </div>
              <div>•</div>
              <div>
                Spec: <span style={{ color: '#a5b4fc' }}>{selectedPOLine.specColour} / {selectedPOLine.specVariant}</span>
              </div>
            </div>
          </div>
        )}

        {/* Buildathon Test Scenario Presets */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div
            style={{
              fontSize: '0.725rem',
              fontWeight: 700,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Sparkles size={13} style={{ color: '#f59e0b' }} />
            Buildathon Test Presets (Instant Simulation):
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              onClick={() => applyPresetScenario('matched')}
            >
              Exact Match
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.4)' }}
              onClick={() => applyPresetScenario('short')}
            >
              Short (-10)
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', color: '#a5b4fc', borderColor: 'rgba(99, 102, 241, 0.4)' }}
              onClick={() => applyPresetScenario('over')}
            >
              Over (+10)
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', color: '#fda4af', borderColor: 'rgba(225, 29, 72, 0.4)' }}
              onClick={() => applyPresetScenario('wrong_sku')}
            >
              Wrong SKU
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
              onClick={() => applyPresetScenario('damaged')}
            >
              Damaged
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', color: '#c7d2fe', borderColor: 'rgba(79, 70, 229, 0.4)' }}
              onClick={() => applyPresetScenario('uncertain')}
            >
              Uncertain
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Step 2: SKU Verification */}
          <div className="form-group">
            <label className="form-label" htmlFor="received-sku">
              <span className="step-badge">2</span>
              Scanned / Received Product SKU <span className="required">*</span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="received-sku"
                type="text"
                className={`form-input font-mono ${formErrors.receivedSku ? 'error' : ''}`}
                placeholder="Scan barcode or type SKU..."
                value={receivedSku}
                onChange={(e) => {
                  const val = e.target.value;
                  setReceivedSku(val);
                  notifyChange({ receivedSku: val });
                }}
              />
              {selectedPOLine && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '0.5rem 0.85rem' }}
                  onClick={() => {
                    setReceivedSku(selectedPOLine.sku);
                    notifyChange({ receivedSku: selectedPOLine.sku });
                  }}
                  title="Populate SKU from PO line"
                >
                  Match PO
                </button>
              )}
            </div>
            {formErrors.receivedSku && (
              <div className="form-error-msg">
                <AlertCircle size={14} /> {formErrors.receivedSku}
              </div>
            )}
          </div>

          {/* Step 3: Carton & Unit Counts */}
          <div className="grid-2col form-group">
            <div>
              <label className="form-label" htmlFor="cartons-received">
                <span className="step-badge">3</span>
                Cartons Received <span className="required">*</span>
              </label>
              <input
                id="cartons-received"
                type="number"
                min="0"
                step="1"
                className={`form-input font-mono ${formErrors.cartonsReceived ? 'error' : ''}`}
                value={cartonsReceived}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                  setCartonsReceived(val);
                  notifyChange({ cartonsReceived: val });
                }}
              />
              {formErrors.cartonsReceived && (
                <div className="form-error-msg">
                  <AlertCircle size={14} /> {formErrors.cartonsReceived}
                </div>
              )}
            </div>

            <div>
              <label className="form-label" htmlFor="units-counted">
                Units Counted / Carton <span className="required">*</span>
              </label>
              <input
                id="units-counted"
                type="number"
                min="0"
                step="1"
                className={`form-input font-mono ${formErrors.unitsPerCartonCounted ? 'error' : ''}`}
                value={unitsPerCartonCounted}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                  setUnitsPerCartonCounted(val);
                  notifyChange({ unitsPerCartonCounted: val });
                }}
              />
              {formErrors.unitsPerCartonCounted && (
                <div className="form-error-msg">
                  <AlertCircle size={14} /> {formErrors.unitsPerCartonCounted}
                </div>
              )}
            </div>
          </div>

          {/* Real-time calculated total units banner */}
          <div
            style={{
              padding: '0.6rem 0.85rem',
              backgroundColor: '#0a0f1d',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ color: '#94a3b8' }}>
              Packaging Multiplication: {cartonsReceived || 0} cartons × {unitsPerCartonCounted || 0} units
            </span>
            <span className="font-mono" style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>
              = {totalReceived} Total Units
            </span>
          </div>

          {/* Step 4: Condition & Quality Check */}
          <div className="grid-2col form-group">
            <div>
              <label className="form-label" htmlFor="carton-damage">
                <span className="step-badge">4</span>
                Carton Damage Check
              </label>
              <select
                id="carton-damage"
                className="form-select"
                value={cartonDamage}
                onChange={(e) => {
                  const val = e.target.value as DamageGrade;
                  setCartonDamage(val);
                  notifyChange({ cartonDamage: val });
                }}
              >
                <option value="none">None (Undamaged)</option>
                <option value="crushing">Crushing / Compression</option>
                <option value="water">Water / Moisture Intrusion</option>
                <option value="tears">Tears / Punctures</option>
                <option value="uncertain">Uncertain (Inconclusive)</option>
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="unit-damage">
                Unit Internal Condition
              </label>
              <select
                id="unit-damage"
                className="form-select"
                value={unitDamage}
                onChange={(e) => {
                  const val = e.target.value as DamageGrade;
                  setUnitDamage(val);
                  notifyChange({ unitDamage: val });
                }}
              >
                <option value="none">None (Pristine)</option>
                <option value="crushing">Crushing / Dents</option>
                <option value="water">Water / Moisture Damage</option>
                <option value="tears">Tears / Broken Seals</option>
                <option value="uncertain">Uncertain (Inconclusive)</option>
              </select>
            </div>
          </div>

          {/* Quality Non-Conformance Flags */}
          <div className="form-group">
            <label className="form-label">Specification Quality Flags</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(
                [
                  { id: 'wrong_colour', label: 'Wrong Colour' },
                  { id: 'wrong_variant', label: 'Wrong Variant / Pack' },
                  { id: 'missing_components', label: 'Missing Components' },
                  { id: 'obvious_defect', label: 'Obvious Defect' },
                ] as const
              ).map((flag) => {
                const isActive = qualityFlags.includes(flag.id);
                return (
                  <button
                    key={flag.id}
                    type="button"
                    onClick={() => toggleQualityFlag(flag.id)}
                    style={{
                      padding: '0.45rem 0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      border: isActive ? '1px solid #e11d48' : '1px solid var(--border-subtle)',
                      backgroundColor: isActive ? 'rgba(225, 29, 72, 0.25)' : '#0d1526',
                      color: isActive ? '#fda4af' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isActive ? '✓ ' : '+ '}
                    {flag.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 5: Evidence Capture */}
          <div className="form-group">
            <label className="form-label">
              <span className="step-badge">5</span>
              Photographic Proof of Delivery
            </label>
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                padding: '0.85rem',
                backgroundColor: '#0a0f1d',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.825rem',
                color: '#cbd5e1',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '4px',
                  backgroundColor: '#1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38bdf8',
                }}
              >
                <Camera size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Standard Multi-Angle Fixture Attached</div>
                <div style={{ fontSize: '0.725rem', color: '#64748b' }}>
                  pallet_view.jpg, carton_label.jpg, unit_barcode.jpg
                </div>
              </div>
              <span className="badge" style={{ backgroundColor: '#1e293b', color: '#93c5fd' }}>
                3 PHOTOS ATTACHED
              </span>
            </div>
          </div>

          {/* Receiving Agent Notes */}
          <div className="form-group">
            <label className="form-label" htmlFor="receiving-notes">
              Dock Receiving Notes (Optional)
            </label>
            <textarea
              id="receiving-notes"
              rows={2}
              className="form-textarea"
              placeholder="e.g. Pallet seal intact; outer wrap damp on bottom corner..."
              value={notes}
              onChange={(e) => {
                const val = e.target.value;
                setNotes(val);
                notifyChange({ notes: val });
              }}
            />
          </div>

          {/* Submit Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1, padding: '0.75rem 1.25rem' }}>
              <CheckCircle2 size={18} />
              Confirm & Submit Receiving Record
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (selectedPOLine) {
                  setReceivedSku(selectedPOLine.sku);
                  setCartonsReceived(selectedPOLine.cartonsOrdered);
                  setUnitsPerCartonCounted(selectedPOLine.unitsPerCartonOrdered);
                  setCartonDamage('none');
                  setUnitDamage('none');
                  setQualityFlags([]);
                  setNotes('');
                  notifyChange({
                    receivedSku: selectedPOLine.sku,
                    cartonsReceived: selectedPOLine.cartonsOrdered,
                    unitsPerCartonCounted: selectedPOLine.unitsPerCartonOrdered,
                    cartonDamage: 'none',
                    unitDamage: 'none',
                    qualityFlags: [],
                    notes: '',
                  });
                }
              }}
              title="Reset fields to PO default"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </form>

        {/* Modal for adding custom PO */}
        {showManualPOModal && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowManualPOModal(false);
            }}
          >
            <div className="modal-content" style={{ maxWidth: '520px' }}>
              <div className="modal-header">
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                  Create Inbound Purchase Order
                </h3>
                <button
                  type="button"
                  onClick={() => setShowManualPOModal(false)}
                  style={{ color: '#94a3b8' }}
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleManualPOSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="form-label">PO Number <span className="required">*</span></label>
                    <input
                      type="text"
                      className="form-input font-mono"
                      placeholder="e.g. PO-9001"
                      required
                      value={manualPO.poNumber}
                      onChange={(e) => setManualPO({ ...manualPO, poNumber: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Supplier Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Acme Logistics"
                      value={manualPO.supplier}
                      onChange={(e) => setManualPO({ ...manualPO, supplier: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Product SKU <span className="required">*</span></label>
                    <input
                      type="text"
                      className="form-input font-mono"
                      placeholder="e.g. SKU-CUSTOM-01"
                      required
                      value={manualPO.sku}
                      onChange={(e) => setManualPO({ ...manualPO, sku: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Product Title</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Industrial Solar Lamp"
                      value={manualPO.productTitle}
                      onChange={(e) => setManualPO({ ...manualPO, productTitle: e.target.value })}
                    />
                  </div>
                  <div className="grid-2col">
                    <div className="form-group">
                      <label className="form-label">Cartons Ordered</label>
                      <input
                        type="number"
                        min="1"
                        className="form-input font-mono"
                        value={manualPO.cartonsOrdered}
                        onChange={(e) =>
                          setManualPO({ ...manualPO, cartonsOrdered: parseInt(e.target.value, 10) })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Units / Carton</label>
                      <input
                        type="number"
                        min="1"
                        className="form-input font-mono"
                        value={manualPO.unitsPerCartonOrdered}
                        onChange={(e) =>
                          setManualPO({ ...manualPO, unitsPerCartonOrdered: parseInt(e.target.value, 10) })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowManualPOModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Create & Select PO
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
