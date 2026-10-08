import React, { useState, useMemo } from 'react';
import { Search, Building2, ArrowRight, Eye } from 'lucide-react';
import { PurchaseOrderLine, ReceivingRecord } from '../types/receiving';
import { PODetailModal } from '../components/PODetailModal';

interface OrdersViewProps {
  poLines: PurchaseOrderLine[];
  records: ReceivingRecord[];
  onSelectForReceiving: (poLine: PurchaseOrderLine) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  poLines,
  records,
  onSelectForReceiving,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
  const [activeModalPOLine, setActiveModalPOLine] = useState<PurchaseOrderLine | null>(null);

  // Distinct suppliers
  const suppliers = useMemo(() => {
    return Array.from(new Set(poLines.map((p) => p.supplier)));
  }, [poLines]);

  const filteredPOs = useMemo(() => {
    return poLines.filter((p) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        term === '' ||
        p.poNumber.toLowerCase().includes(term) ||
        p.supplier.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.productTitle.toLowerCase().includes(term);

      const matchesSupplier =
        selectedSupplier === 'ALL' || p.supplier === selectedSupplier;

      return matchesSearch && matchesSupplier;
    });
  }, [poLines, searchTerm, selectedSupplier]);

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
          Purchase Order Line Registry
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Authoritative purchase orders received from ERP/Procurement for dock verification.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card-panel"
        style={{ marginBottom: '1.25rem', padding: '1rem', backgroundColor: 'var(--bg-inset)' }}
      >
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 300px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.4rem' }}
              placeholder="Search by PO #, Supplier, SKU, Product Title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Supplier Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={16} style={{ color: 'var(--text-muted)' }} />
            <select
              className="form-select"
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
            >
              <option value="ALL">All Suppliers ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card-panel">
        <div className="card-panel-header">
          <div className="card-panel-title">
            <span>Authoritative PO Catalog</span>
            <span
              className="font-mono"
              style={{
                fontSize: '0.75rem',
                backgroundColor: 'var(--bg-card-subtle)',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                color: 'var(--text-muted)',
              }}
            >
              {filteredPOs.length} Line Items
            </span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Line</th>
                <th>Supplier</th>
                <th>SKU / ASIN</th>
                <th>Product Description</th>
                <th>Specification</th>
                <th style={{ textAlign: 'right' }}>Cartons</th>
                <th style={{ textAlign: 'right' }}>Units / Ctn</th>
                <th style={{ textAlign: 'right' }}>Total Units</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPOs.map((p) => {
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 600, color: 'var(--info-text)' }}>
                        {p.poNumber}
                      </span>
                    </td>
                    <td className="font-mono">#{p.poLine}</td>
                    <td style={{ color: 'var(--text-main)', fontSize: '0.825rem' }}>{p.supplier}</td>
                    <td>
                      <div className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        {p.sku}
                      </div>
                      <div className="font-mono" style={{ fontSize: '0.725rem', color: 'var(--text-dim)' }}>
                        {p.asin}
                      </div>
                    </td>
                    <td style={{ maxWidth: '240px' }}>{p.productTitle}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {p.specColour} / {p.specVariant}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {p.cartonsOrdered}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {p.unitsPerCartonOrdered}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: 'var(--ok-text)',
                      }}
                    >
                      {p.qtyOrdered}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={() => setActiveModalPOLine(p)}
                          title="View PO Line Details"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          className="btn-primary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => onSelectForReceiving(p)}
                          title="Open in Receiving Terminal"
                        >
                          Receive
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PO Detail Modal */}
      {activeModalPOLine && (
        <PODetailModal
          poLine={activeModalPOLine}
          records={records}
          onClose={() => setActiveModalPOLine(null)}
          onReceiveThis={(po) => onSelectForReceiving(po)}
        />
      )}
    </div>
  );
};
