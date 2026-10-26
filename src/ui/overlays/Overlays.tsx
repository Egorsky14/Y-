import { useEffect, useState } from 'react';
import { useApp, useGame } from '@/app/store';
import { lotById } from '@/game/world/cityLayout';
import { deviceProfile } from '@/app/device';

export function Toasts() {
  const allToasts = useApp((s) => s.toasts);
  const toasts = allToasts; // celebrations have their own queue (Celebration)
  const dismiss = useApp((s) => s.dismissToast);
  const select = useApp((s) => s.select);
  const camera = useApp((s) => s.camera);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      for (const t of useApp.getState().toasts) if (now - t.createdAt > 9000) dismiss(t.id);
      tick((x) => x + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [dismiss]);
  const focus = (t: (typeof toasts)[number]) => {
    if (!t.focus) return;
    const s = useApp.getState().engine?.state;
    if (!s) return;
    if (t.focus.kind === 'job') {
      const job = s.jobs[t.focus.id];
      if (job) {
        select({ kind: 'job', id: job.id });
        const lot = lotById(s.customers[job.customerId].lotId);
        if (lot) camera({ type: 'focus', target: lot.center, distance: 60 });
      }
    } else if (t.focus.kind === 'vehicle') {
      select({ kind: 'vehicle', id: t.focus.id });
      camera({ type: 'follow', vehicleId: t.focus.id });
    } else if (t.focus.kind === 'employee') {
      select({ kind: 'employee', id: t.focus.id });
      const e = s.employees[t.focus.id];
      if (e) camera({ type: 'focus', target: e.position, distance: 35 });
    } else if (t.focus.kind === 'lot') {
      select({ kind: 'lot', id: t.focus.id });
      camera({ type: 'hq' });
    }
    dismiss(t.id);
  };
  return (
    <div className="toasts" data-testid="toasts">
      {toasts.slice(-4).map((t) => (
        <div key={t.id} className={`glass toast ${t.type}`} onClick={() => focus(t)}>
          <i />
          <div>
            <div className="t">{t.title}</div>
            {t.body && <div className="b">{t.body}</div>}
          </div>
          <button className="x" onClick={(e) => { e.stopPropagation(); dismiss(t.id); }} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}

/** Celebration banner: shows the queue head for its full time (from when it appears), then the next. */
export function Celebration() {
  const queue = useApp((s) => s.celebrations);
  const toast = queue[0];
  const waiting = queue.length - 1;
  const dismiss = useApp((s) => s.dismissCelebration);
  const id = toast?.id;
  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(() => dismiss(id), 5200);
    return () => clearTimeout(timer);
  }, [id, dismiss]);
  if (!toast) return null;
  return (
    <div className="celebration" key={toast.id} onClick={() => dismiss(toast.id)} data-testid="celebration">
      <div className="icon">🏆</div>
      <div>
        <div className="t">{toast.title}</div>
        {toast.body && <div className="b">{toast.body}</div>}
      </div>
      {waiting > 0 && (
        <div className="more" data-testid="celebration-waiting">
          +{waiting} more
        </div>
      )}
    </div>
  );
}

export function ErrorBanner() {
  const error = useApp((s) => s.lastError);
  const clear = useApp((s) => s.clearError);
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clear, 4000);
    return () => clearTimeout(id);
  }, [error, clear]);
  if (!error) return null;
  return (
    <div className="error-banner" role="alert" data-testid="error-banner">
      <span>{error}</span>
      <button className="x" onClick={clear}>×</button>
    </div>
  );
}

/** Context-sensitive guidance for the first days. */
export function TutorialHint() {
  const error = useApp((s) => s.lastError);
  const selection = useApp((s) => s.selection);
  const panel = useApp((s) => s.panel);
  const hint = useGame((s) => {
    const jobs = Object.values(s.jobs);
    const lead = jobs.find((j) => j.status === 'lead');
    const accepted = jobs.find((j) => j.status === 'accepted' && j.kind !== 'replacement');
    const findings = jobs.find((j) => j.status === 'awaiting-diagnosis');
    const quoted = jobs.find((j) => j.status === 'quoted');
    const install = jobs.find((j) => j.status === 'accepted' && j.kind === 'replacement');
    if (lead) return { k: '1', text: `New service call from ${s.customers[lead.customerId].name}. ${deviceProfile().touch ? 'Tap' : 'Click'} the glowing pin or the house to accept it.` };
    if (accepted) return { k: '2', text: `Dispatch a technician and a vehicle to ${s.customers[accepted.customerId].address}.` };
    if (findings) return { k: '3', text: `Findings are ready at ${s.customers[findings.customerId].address}. Review the measurements and choose a diagnosis.` };
    if (quoted) return { k: '4', text: 'Present a repair or replacement recommendation to the customer.' };
    if (install) return { k: '5', text: 'A replacement was approved. Dispatch an install crew with an installer and a full-size van or box truck.' };
    if (s.stats.jobsCompleted >= 1 && Object.keys(s.employees).length === 1) return { k: '6', text: 'Grow: hire a technician from Team › Hiring market, then add a second vehicle in Fleet › Marketplace.' };
    if (s.stats.jobsCompleted >= 2 && Object.values(s.employees).every((e) => e.certifications.length <= 1) && s.stats.trainingsCompleted === 0) return { k: '7', text: 'Train an idle technician in Team › Training academy. Attributes improve permanently.' };
    return null;
  });
  if (error || !hint || panel || selection?.kind === 'job') return null;
  return (
    <div className="glass hint" data-testid="hint">
      <span className="k">{hint.k}</span>
      <span>{hint.text}</span>
    </div>
  );
}
