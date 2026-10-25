import type { ReactNode } from 'react';
import { useApp } from '@/app/store';
import { Icon } from '../components/common';

export function PanelShell({ title, subtitle, tabs, children, testId }: { title: string; subtitle?: string; tabs?: ReactNode; children: ReactNode; testId?: string }) {
  const close = () => useApp.getState().openPanel(null);
  return (
    <>
      <div className="panel-backdrop" onClick={close} />
      <section className="glass panel" data-testid={testId} role="dialog" aria-label={title}>
        <header className="panel-head">
          <div className="title">
            <div>
              <h2>{title}</h2>
              {subtitle && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{subtitle}</div>}
            </div>
          </div>
          <div className="row">
            {tabs}
            <button className="close" onClick={close} aria-label="Close panel">
              <Icon name="close" />
            </button>
          </div>
        </header>
        {children}
      </section>
    </>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; badge?: number }[] }) {
  return (
    <div className="panel-tabs">
      {items.map((t) => (
        <button key={t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
          {t.badge ? <span className="badge" style={{ marginLeft: 6 }}>{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
