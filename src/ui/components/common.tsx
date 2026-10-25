import type { ReactNode } from 'react';
import { formatMoney } from '@/game/economy/ledger';

export function Money({ value, compact, signed }: { value: number; compact?: boolean; signed?: boolean }) {
  const cls = signed ? (value >= 0 ? 'money pos' : 'money neg') : 'money';
  return <span className={cls}>{signed && value > 0 ? '+' : ''}{formatMoney(value, compact)}</span>;
}

export function Stars({ value, count }: { value: number; count?: number }) {
  const full = Math.round(value);
  return (
    <span className="stars" title={`${value.toFixed(2)} stars`}>
      {'★'.repeat(Math.max(0, Math.min(5, full)))}
      <span style={{ opacity: 0.25 }}>{'★'.repeat(Math.max(0, 5 - full))}</span>
      {count !== undefined && <span className="muted" style={{ marginLeft: 6, letterSpacing: 0, fontSize: 12 }}>({count})</span>}
    </span>
  );
}

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: 'amber' | 'red' | 'green' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${tone ?? ''}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row between">
        <h4>{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Icon({ name }: { name: 'jobs' | 'employees' | 'fleet' | 'hq' | 'marketing' | 'finance' | 'camera' | 'home' | 'follow' | 'save' | 'menu' | 'settings' | 'close' | 'pause' | 'play' }) {
  const paths: Record<string, ReactNode> = {
    jobs: <path d="M4 7h16v12H4zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 12h16" />,
    employees: <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0" />,
    fleet: <path d="M3 13l2-5h9l3 5h4v5h-2M3 13v5h2M8 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm9 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 18h5" />,
    hq: <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6M10 11h1m2 0h1" />,
    marketing: <path d="M3 11v2a1 1 0 0 0 1 1h2l6 4V6L6 10H4a1 1 0 0 0-1 1zm13-2a4 4 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12" />,
    finance: <path d="M4 19h16M6 16V10m4 6V6m4 10v-4m4 4V8" />,
    camera: <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
    home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
    follow: <path d="M12 3v3m0 12v3M3 12h3m12 0h3M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
    save: <path d="M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L14.8 3h-5.6l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h5.6l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    pause: <path d="M8 5v14M16 5v14" />,
    play: <path d="M7 4l12 8-12 8z" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

export function roleAvatarClass(role: string): string {
  return `avatar ${role}`;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function minutesLabel(min: number): string {
  if (min < 60) return `${Math.max(0, Math.round(min))} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
