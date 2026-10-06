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
import { Navbar, AppTab } from './components/Navbar';
import { InspectionHistoryEntry } from './components/InspectionHistory';
import { TerminalView } from './views/TerminalView';
import { DashboardView } from './views/DashboardView';
import { OrdersView } from './views/OrdersView';
import { DiscrepanciesView } from './views/DiscrepanciesView';
import { AuditView } from './views/AuditView';
import { DebateWorkspaceView } from './views/DebateWorkspaceView';

const TAB_IDS: AppTab[] = ['debate', 'terminal', 'dashboard', 'orders', 'discrepancies', 'audit'];

export const App: React.FC = () => {
  const [tenantId, setTenantId] = useState<TenantId>('org_demo_alpha');
  const [operatorId, setOperatorId] = useState('op_harish');
  const [activeTab, setActiveTab] = useState<AppTab>('debate');

  // Tenant-scoped state
  const [records, setRecords] = useState<ReceivingRecord[]>([]);
  const [poLines, setPOLines] = useState<PurchaseOrderLine[]>([]);
  const [selectedPOLine, setSelectedPOLine] = useState<PurchaseOrderLine | null>(null);

  // Session-only inspection history (UI state; reports come from the DEBATE API)
  const [inspections, setInspections] = useState<InspectionHistoryEntry[]>([]);
  const [openInspectionId, setOpenInspectionId] = useState<string | null>(null);

  // Sync with URL hash if present
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if ((TAB_IDS as string[]).includes(hash)) {
        setActiveTab(hash as AppTab);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    window.location.hash = `#/${tab}`;
    window.scrollTo({ top: 0 });
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
    setOpenInspectionId(null);
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

  // Inspection history is filtered by tenant so one org never sees another's inspections
  const tenantInspections = useMemo(
    () => inspections.filter((i) => i.tenantId === tenantId),
    [inspections, tenantId]
  );

  const handleInspectionComplete = (entry: InspectionHistoryEntry) => {
    setInspections((prev) => [
      entry,
      ...prev.filter((i) => i.report.inspectionId !== entry.report.inspectionId),
    ]);
    setOpenInspectionId(entry.report.inspectionId);
  };

  const handleInspectionIngested = (inspectionId: string, recordId: string) => {
    setInspections((prev) =>
      prev.map((i) => (i.report.inspectionId === inspectionId ? { ...i, ingested: true, recordId } : i))
    );
  };

  const handleOpenInspection = (inspectionId: string | null) => {
    setOpenInspectionId(inspectionId);
    handleTabChange('debate');
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
        {activeTab === 'debate' && (
          <DebateWorkspaceView
            tenantId={tenantId}
            operatorId={operatorId}
            onSubmitRecord={handleSubmitRecord}
            onNavigateToDashboard={() => handleTabChange('dashboard')}
            history={tenantInspections}
            openInspectionId={openInspectionId}
            onOpenInspection={handleOpenInspection}
            onInspectionComplete={handleInspectionComplete}
            onInspectionIngested={handleInspectionIngested}
          />
        )}

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
            inspections={tenantInspections}
            onOpenInspection={handleOpenInspection}
            onNewInspection={() => handleOpenInspection(null)}
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

      <footer className="app-footer">
        <div>CUBE Buildathon 2026 · Commerce Context · Receiving Manager (Stage 01 of 05)</div>
        <div className="font-mono">
          {tenantId} · {operatorId}
        </div>
      </footer>
    </div>
  );
};
