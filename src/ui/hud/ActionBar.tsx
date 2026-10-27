import { useApp, useGame, type PanelId } from '@/app/store';
import { Icon } from '../components/common';
import { attentionQueue } from '@/game/operations/automation';

const ITEMS: { id: Exclude<PanelId, null | 'settings'>; label: string; icon: 'jobs' | 'employees' | 'fleet' | 'supply' | 'hq' | 'marketing' | 'finance' }[] = [
  { id: 'jobs', label: 'Jobs', icon: 'jobs' },
  { id: 'employees', label: 'Team', icon: 'employees' },
  { id: 'fleet', label: 'Fleet', icon: 'fleet' },
  { id: 'supply', label: 'Supply', icon: 'supply' },
  { id: 'hq', label: 'HQ', icon: 'hq' },
  { id: 'marketing', label: 'Marketing', icon: 'marketing' },
  { id: 'finance', label: 'Finances', icon: 'finance' },
];

export function ActionBar() {
  const panel = useApp((s) => s.panel);
  const toggle = useApp((s) => s.togglePanel);
  const pendingJobs = useGame((s) => Object.values(s.jobs).filter((j) => ['lead', 'accepted', 'awaiting-diagnosis', 'quoted'].includes(j.status)).length + attentionQueue(s).filter((j) => !j.attention!.blocking).length);
  const idleStaff = useGame((s) => Object.values(s.employees).filter((e) => e.status === 'idle').length);
  return (
    <nav className="glass action-bar" aria-label="Management">
      {ITEMS.map((item) => (
        <button key={item.id} className={panel === item.id ? 'active' : ''} onClick={() => toggle(item.id)} data-testid={`nav-${item.id}`}>
          <Icon name={item.icon} />
          {item.label}
          {item.id === 'jobs' && pendingJobs > 0 && <span className="badge">{pendingJobs}</span>}
          {item.id === 'employees' && idleStaff > 1 && <span className="badge" style={{ background: 'var(--teal)' }}>{idleStaff}</span>}
        </button>
      ))}
    </nav>
  );
}
