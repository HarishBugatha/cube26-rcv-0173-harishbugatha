import React, { useEffect, useState } from 'react';
import {
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
  { id: 'debate', label: 'Inspect', icon: ScanSearch },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'terminal', label: 'Manual receiving', icon: Keyboard },
  { id: 'orders', label: 'Purchase orders', icon: ClipboardList },
  { id: 'discrepancies', label: 'Discrepancies', icon: AlertTriangle },
  { id: 'audit', label: 'Audit trail', icon: History },
];

type Engine = { state: 'unknown' } | { state: 'off' } | { state: 'on'; model: string } | { state: 'down' };

/** Real server state: is a vision model configured? (from /api/health, re-checked every 30 s) */
function useEngineStatus(): Engine {
  const [engine, setEngine] = useState<Engine>({ state: 'unknown' });
  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch('/api/health')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => alive && setEngine(d?.vision?.configured ? { state: 'on', model: d.vision.model } : { state: 'off' }))
        .catch(() => alive && setEngine({ state: 'down' }));
    check();
    const id = window.setInterval(check, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  return engine;
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
  const engine = useEngineStatus();
  const engineLabel =
    engine.state === 'on' ? engine.model
      : engine.state === 'off' ? 'No vision model'
      : engine.state === 'down' ? 'Server offline'
      : 'Checking…';
  const engineTitle =
    engine.state === 'on' ? 'Vision model configured on the server'
      : engine.state === 'off' ? 'ANTHROPIC_API_KEY is not set on the server: uploaded photos return UNCERTAIN'
      : engine.state === 'down' ? 'The API server on port 3001 is not reachable'
      : '';

  return (
    <header className="navbar">
      <div className="navbar-top">
        <div className="brand-section">
          <div className="brand-icon-box" aria-hidden="true">RM</div>
          <div className="brand-title-group">
            <h1>Receiving Manager</h1>
            <div className="brand-subtitle">01 · inbound dock · condition on arrival</div>
          </div>
        </div>

        <div className="nav-controls">
          <span
            className={`nav-chip engine-chip ${engine.state === 'on' ? 'on' : engine.state === 'unknown' ? 'unknown' : 'off'}`}
            title={engineTitle}
          >
            <span className="status-dot" aria-hidden="true" />
            <span className="nav-chip-label">Vision</span>
            <span className="mono">{engineLabel}</span>
          </span>

          <label className="nav-chip" title="Organisation scope">
            <Building2 size={14} />
            <span className="nav-chip-label">Org</span>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value as TenantId)}
              aria-label="Select organisation"
            >
              <option value="org_demo_alpha">org_demo_alpha</option>
              <option value="org_demo_bravo">org_demo_bravo</option>
            </select>
          </label>

          <label className="nav-chip hide-md" title="Operator recorded on receipts">
            <User size={14} />
            <span className="nav-chip-label">Operator</span>
            <input type="text" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} aria-label="Operator ID" />
          </label>
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
            <Icon size={15} />
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
