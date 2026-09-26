import React from 'react';
import {
  Boxes,
  Building2,
  User,
  ClipboardList,
  AlertTriangle,
  History,
  Terminal,
  Layers,
} from 'lucide-react';
import { TenantId } from '../types/receiving';

interface NavbarProps {
  activeTab: 'terminal' | 'dashboard' | 'orders' | 'discrepancies' | 'audit';
  setActiveTab: (tab: 'terminal' | 'dashboard' | 'orders' | 'discrepancies' | 'audit') => void;
  tenantId: TenantId;
  setTenantId: (tenant: TenantId) => void;
  operatorId: string;
  setOperatorId: (op: string) => void;
  discrepancyCount: number;
}

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
          <div className="brand-icon-box">
            <Boxes size={22} />
          </div>
          <div className="brand-title-group">
            <h1>
              RECEIVING MANAGER
              <span className="badge" style={{ backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #3b82f6', fontSize: '0.65rem' }}>
                STAGE 01 · DOCK
              </span>
            </h1>
            <div className="brand-subtitle">
              CUBE BUILDATHON 2026 · COMMERCE CONTEXT STREAM
            </div>
          </div>
        </div>

        <div className="nav-controls">
          {/* Tenant Switcher enforcing Rule 1 */}
          <div className="tenant-pill" title="Row-Level Security Tenant Scoping">
            <Building2 size={15} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TENANT:</span>
            <select
              className="tenant-select"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value as TenantId)}
              aria-label="Select Tenant Organization"
            >
              <option value="org_demo_alpha">org_demo_alpha</option>
              <option value="org_demo_bravo">org_demo_bravo</option>
            </select>
          </div>

          {/* Operator ID Badge */}
          <div className="operator-badge" title="Active Warehouse Operator">
            <User size={14} />
            <input
              type="text"
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
              title="Click to change Operator ID"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#93c5fd',
                width: '78px',
                fontFamily: 'inherit',
                fontSize: '0.8rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Inter-pod connection status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              color: '#34d399',
              fontFamily: 'var(--font-mono)',
              background: 'rgba(16, 185, 129, 0.1)',
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            />
            FEEDING 02_PREP
          </div>
        </div>
      </div>

      <nav className="navbar-tabs" aria-label="Main Navigation">
        <button
          className={`nav-tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
          onClick={() => setActiveTab('terminal')}
        >
          <Terminal size={17} />
          Receiving Terminal
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <Layers size={17} />
          Operations Dashboard
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <ClipboardList size={17} />
          PO Registry
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'discrepancies' ? 'active' : ''}`}
          onClick={() => setActiveTab('discrepancies')}
        >
          <AlertTriangle size={17} />
          Discrepancies & Claims
          {discrepancyCount > 0 && (
            <span
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                borderRadius: '999px',
                padding: '0.1rem 0.45rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                marginLeft: '0.25rem',
              }}
            >
              {discrepancyCount}
            </span>
          )}
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <History size={17} />
          Audit & Cross-Pod Hashes
        </button>
      </nav>
    </header>
  );
};
