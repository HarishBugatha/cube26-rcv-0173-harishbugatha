import React, { useState, useEffect, useMemo } from 'react';
import {
  TenantId,
  PurchaseOrderLine,
  ReceivingRecord,
  OperatorOverride,
} from './types/receiving';
import {
  getRecordsByTenant,
  getPOLinesByTenant,
  addReceivingRecord,
  applyOperatorOverride,
} from './services/dataService';
import { Navbar } from './components/Navbar';
import { TerminalView } from './views/TerminalView';
import { DashboardView } from './views/DashboardView';
import { OrdersView } from './views/OrdersView';
import { DiscrepanciesView } from './views/DiscrepanciesView';
import { AuditView } from './views/AuditView';

export const App: React.FC = () => {
  const [tenantId, setTenantId] = useState<TenantId>('org_demo_alpha');
  const [operatorId, setOperatorId] = useState('op_harish');
  const [activeTab, setActiveTab] = useState<
    'terminal' | 'dashboard' | 'orders' | 'discrepancies' | 'audit'
  >('terminal');

  // Tenant-scoped state
  const [records, setRecords] = useState<ReceivingRecord[]>([]);
  const [poLines, setPOLines] = useState<PurchaseOrderLine[]>([]);
  const [selectedPOLine, setSelectedPOLine] = useState<PurchaseOrderLine | null>(null);

  // Sync with URL hash if present
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if (['terminal', 'dashboard', 'orders', 'discrepancies', 'audit'].includes(hash)) {
        setActiveTab(hash as any);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tab: 'terminal' | 'dashboard' | 'orders' | 'discrepancies' | 'audit') => {
    setActiveTab(tab);
    window.location.hash = `#/${tab}`;
  };

  // Reload data whenever tenantId changes (Rule 1 Tenancy isolation)
  useEffect(() => {
    const loadedRecords = getRecordsByTenant(tenantId);
    const loadedPOs = getPOLinesByTenant(tenantId);
    setRecords(loadedRecords);
    setPOLines(loadedPOs);
    if (loadedPOs.length > 0) {
      setSelectedPOLine(loadedPOs[0]);
    } else {
      setSelectedPOLine(null);
    }
  }, [tenantId]);

  // Handle new receiving submission
  const handleSubmitRecord = (record: ReceivingRecord) => {
    const created = addReceivingRecord(tenantId, record);
    setRecords((prev) => [created, ...prev]);
  };

  // Handle custom PO addition
  const handleAddNewPOLine = (newPO: PurchaseOrderLine) => {
    setPOLines((prev) => [newPO, ...prev]);
    setSelectedPOLine(newPO);
  };

  // Handle operator override
  const handleConfirmOverride = (override: OperatorOverride, recordId: string) => {
    const updated = applyOperatorOverride(tenantId, recordId, override);
    if (updated) {
      setRecords((prev) =>
        prev.map((r) => (r.recordId === recordId ? { ...updated } : r))
      );
    }
  };

  // Discrepancy count for badge
  const discrepancyCount = useMemo(() => {
    return records.filter((r) => r.status !== 'MATCHED').length;
  }, [records]);

  return (
    <div className="app-container">
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        tenantId={tenantId}
        setTenantId={setTenantId}
        operatorId={operatorId}
        setOperatorId={setOperatorId}
        discrepancyCount={discrepancyCount}
      />

      <main className="main-content">
        {activeTab === 'terminal' && (
          <TerminalView
            poLines={poLines}
            selectedPOLine={selectedPOLine}
            onSelectPOLine={setSelectedPOLine}
            onSubmitRecord={handleSubmitRecord}
            operatorId={operatorId}
            tenantId={tenantId}
            onConfirmOverride={handleConfirmOverride}
            onAddNewPOLine={handleAddNewPOLine}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            records={records}
            onConfirmOverride={handleConfirmOverride}
            activeOperatorId={operatorId}
          />
        )}

        {activeTab === 'orders' && (
          <OrdersView
            poLines={poLines}
            records={records}
            onSelectForReceiving={(po) => {
              setSelectedPOLine(po);
              handleTabChange('terminal');
            }}
          />
        )}

        {activeTab === 'discrepancies' && (
          <DiscrepanciesView
            records={records}
            onConfirmOverride={handleConfirmOverride}
            activeOperatorId={operatorId}
          />
        )}

        {activeTab === 'audit' && (
          <AuditView records={records} tenantId={tenantId} />
        )}
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '1.25rem 1.5rem',
          backgroundColor: '#0a0f1d',
          fontSize: '0.775rem',
          color: '#64748b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <strong>CUBE Buildathon 2026</strong> · Commerce Context Stream · Step 01 of 05 Receiving Manager
        </div>
        <div className="font-mono">
          Tenant: <span style={{ color: '#38bdf8' }}>{tenantId}</span> | Operator:{' '}
          <span style={{ color: '#93c5fd' }}>{operatorId}</span> | Route: #{activeTab}
        </div>
      </footer>
    </div>
  );
};
