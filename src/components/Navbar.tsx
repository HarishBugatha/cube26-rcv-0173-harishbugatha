import React from 'react';
import {
  Boxes,
  Building2,
  User,
  ClipboardList,
  AlertTriangle,
  History,
  Keyboard,
  LayoutDashboard,
  ScanSearch,
} from 'lucide-react';
import { TenantId } from '../types/receiving';

export type AppTab = 'debate' | 'terminal' | 'dashboard' | 'orders' | 'discrepancies' | 'audit';

interface NavbarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  tenantId: TenantId;
  setTenantId: (tenant: TenantId) => void;
  operatorId: string;
  setOperatorId: (op: string) => void;
  discrepancyCount: number;
}

const TABS: { id: AppTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'debate', label: 'New Inspection', icon: ScanSearch },
  { id: 'terminal', label: 'Manual Receiving', icon: Keyboard },
  { id: 'orders', label: 'Purchase Orders', icon: ClipboardList },
  { id: 'discrepancies', label: 'Discrepancies', icon: AlertTriangle },
  { id: 'audit', label: 'Audit Trail', icon: History },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  tenantId,
  setTenantId,
  operatorId,
  setOperatorId,
  discrepancyCount,
}) => {
  return (
    <header className="navbar">
      <div className="navbar-top">
        <div className="brand-section">
          <div className="brand-icon-box" aria-hidden="true">
            <Boxes size={19} />
          </div>
          <div className="brand-title-group">
            <h1>Receiving Manager</h1>
            <div className="brand-subtitle">Inbound dock · Stage 01 of 05 · Condition on arrival</div>
          </div>
        </div>

        <div className="nav-controls">
          <label className="nav-chip" title="Tenant scope (row-level isolation)">
            <Building2 size={14} />
            <span className="nav-chip-label">Org</span>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value as TenantId)}
              aria-label="Select tenant organisation"
            >
              <option value="org_demo_alpha">org_demo_alpha</option>
              <option value="org_demo_bravo">org_demo_bravo</option>
            </select>
          </label>

          <label className="nav-chip hide-md" title="Active operator (editable)">
            <User size={14} />
            <span className="nav-chip-label">Operator</span>
            <input
              type="text"
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
              aria-label="Operator ID"
            />
          </label>

          <span className="nav-chip hide-md" title="Dock station">
            <span className="status-dot" aria-hidden="true" />
            Bay 03
          </span>
        </div>
      </div>

      <nav className="navbar-tabs" aria-label="Main navigation">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-tab-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <Icon size={16} />
            {label}
            {id === 'discrepancies' && discrepancyCount > 0 && (
              <span className="nav-count" aria-label={`${discrepancyCount} open discrepancies`}>
                {discrepancyCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </header>
  );
};
