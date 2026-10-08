import React, { useEffect } from 'react';
import { X, Package } from 'lucide-react';
import { PurchaseOrderLine, ReceivingRecord } from '../types/receiving';
import { DiscrepancyBadge } from './DiscrepancyBadge';

interface PODetailModalProps {
  poLine: PurchaseOrderLine | null;
  records: ReceivingRecord[];
  onClose: () => void;
  onReceiveThis: (poLine: PurchaseOrderLine) => void;
}

export const PODetailModal: React.FC<PODetailModalProps> = ({
  poLine,
  records,
  onClose,
  onReceiveThis,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!poLine) return null;

  const linkedRecords = records.filter(
    (r) => r.poNumber === poLine.poNumber && r.poLine === poLine.poLine
  );

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content" style={{ maxWidth: '750px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Package size={20} style={{ color: 'var(--info-text)' }} />
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Purchase Order {poLine.poNumber} — Line #{poLine.poLine}
              </h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Supplier: {poLine.supplier} · Tenant: {poLine.orgId}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Order Details Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              backgroundColor: 'var(--bg-inset)',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '1.25rem',
              fontSize: '0.85rem',
            }}
          >
            <div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>PRODUCT SPECIFICATION:</div>
              <div style={{ fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                {poLine.productTitle}
              </div>
              <div className="font-mono" style={{ color: 'var(--info-text)', fontSize: '0.8rem', marginTop: '4px' }}>
                SKU: {poLine.sku} · ASIN: {poLine.asin}
              </div>
            </div>

            <div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>SPECIFICATION DETAILS:</div>
              <div style={{ color: 'var(--text-main)', marginTop: '2px' }}>
                Color: <strong>{poLine.specColour}</strong> · Variant: <strong>{poLine.specVariant}</strong>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.775rem', marginTop: '4px' }}>
                Components: {poLine.specComponents}
              </div>
            </div>

            <div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>ORDERED CARTON PACKAGING:</div>
              <div style={{ color: 'var(--text-main)', marginTop: '2px' }}>
                <strong>{poLine.cartonsOrdered}</strong> cartons @ <strong>{poLine.unitsPerCartonOrdered}</strong> units/carton
              </div>
            </div>

            <div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>TOTAL EXPECTED UNITS:</div>
              <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ok-text)' }}>
                {poLine.qtyOrdered} units
              </div>
            </div>
          </div>

          {/* Linked Receiving Records */}
          <div>
            <h3
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '0.5rem',
              }}
            >
              Dock Receipts Recorded ({linkedRecords.length})
            </h3>

            {linkedRecords.length === 0 ? (
              <div
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-inset)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-dim)',
                  fontSize: '0.85rem',
                }}
              >
                No receiving records submitted for this PO line yet. It is ready for receiving at the dock.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {linkedRecords.map((r) => (
                  <div
                    key={r.recordId}
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: 'var(--bg-inset)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="font-mono" style={{ fontWeight: 600, color: 'var(--info-text)' }}>
                          {r.recordId}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Unit: {r.unitId}
                        </span>
                        <DiscrepancyBadge status={r.status} size="sm" />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        Counted: {r.qtyReceived} units ({r.cartonsReceived} ctn × {r.unitsPerCartonCounted}/ctn) · Op: {r.operatorId}
                      </div>
                    </div>

                    <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(r.capturedAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              onReceiveThis(poLine);
              onClose();
            }}
          >
            Open in Receiving Terminal
          </button>
        </div>
      </div>
    </div>
  );
};
