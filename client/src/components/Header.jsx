import React from 'react';
import { ShieldCheck, Lock, EyeOff, Sparkles, Activity, FileCheck } from 'lucide-react';

export default function Header({ systemHealth }) {
  return (
    <header className="glass-panel" style={{ padding: '18px 28px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        
        {/* Title & Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
          }}>
            <ShieldCheck size={26} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.02em', background: 'linear-gradient(to right, #f8fafc, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                RECEIVING MANAGER
              </h1>
              <span style={{
                background: 'rgba(6, 182, 212, 0.15)',
                color: '#22d3ee',
                border: '1px solid rgba(6, 182, 212, 0.4)',
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '6px',
                letterSpacing: '0.05em'
              }}>
                PRD-3 DEBATE
              </span>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Adversarial 3-Role Verification Pipeline with Isolated Blind Crop Verification
            </p>
          </div>
        </div>

        {/* Security Shield Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          
          <div className="glass-card" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
            <EyeOff size={14} color="#a855f7" />
            <span style={{ color: '#cbd5e1' }}>Blind Isolation:</span>
            <strong style={{ color: '#c084fc' }}>STRICT (Crop Only)</strong>
          </div>

          <div className="glass-card" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
            <Lock size={14} color="#10b981" />
            <span style={{ color: '#cbd5e1' }}>EXIF/GPS:</span>
            <strong style={{ color: '#34d399' }}>STRIPPED</strong>
          </div>

          <div className="glass-card" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
            <FileCheck size={14} color="#06b6d4" />
            <span style={{ color: '#cbd5e1' }}>Hashing:</span>
            <strong style={{ color: '#38bdf8' }}>SHA-256</strong>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            fontSize: '0.75rem',
            color: '#34d399'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              display: 'inline-block',
              boxShadow: '0 0 8px #10b981'
            }}></span>
            <strong>ONLINE</strong>
          </div>

        </div>

      </div>
    </header>
  );
}
