import { useState, type ReactNode } from 'react';
import { useApp } from '@/app/store';
import { formatReport, type CrashReport } from '@/app/diagnostics';
import { continueSaveTime } from '@/persistence/save';
import { CrashProbe, type RecoveryProps } from './ErrorBoundary';

/**
 * Recovery views for the error boundaries (ErrorBoundary.tsx) and for a stopped simulation.
 *
 * Rules they all follow: nothing here deletes a save or starts a new company; a save is written only by a
 * button that says so; "Reload" says which save it returns to. They use plain markup and the store only, so a
 * failure in the game's own components cannot break the screen that reports it.
 */

function reload(): void {
  location.reload();
}

/** "today at 2:14 PM" / "Mar 3 at 2:14 PM" for the save that Continue would load. */
function lastSaveText(): string | null {
  const at = continueSaveTime();
  if (!at) return null;
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = at.toDateString() === new Date().toDateString();
  return sameDay ? `today at ${time}` : `${at.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand('copy');
      field.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** The recorded failure, closed by default: for a bug report, not for reading. */
export function CrashDetails({ report }: { report: CrashReport | null }) {
  const [copied, setCopied] = useState<'' | 'yes' | 'no'>('');
  if (!report) return null;
  const text = formatReport(report);
  return (
    <details className="recovery-details" data-testid="crash-details">
      <summary>Technical details</summary>
      <pre data-testid="crash-report">{text}</pre>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={async () => setCopied((await copyText(text)) ? 'yes' : 'no')} data-testid="crash-copy">Copy details</button>
        <span className="muted" aria-live="polite" style={{ fontSize: 12 }}>{copied === 'yes' ? 'Copied' : copied === 'no' ? 'Could not copy: select the text above' : ''}</span>
      </div>
      <p className="muted recovery-note">This stays on your device and is not sent anywhere. It has no names or money in it: only what failed, the build, the campaign seed and day, and the kind of device.</p>
    </details>
  );
}

function Card({ title, testId, label, children }: { title: string; testId: string; label?: string; children: ReactNode }) {
  return (
    <div className="glass recovery-card" role="alertdialog" aria-label={label ?? title} data-testid={testId}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** Says what "Reload" comes back to, so reloading is never a surprise loss. */
function ReloadNote({ unsavedSince }: { unsavedSince?: boolean }) {
  const saved = lastSaveText();
  return (
    <p className="muted recovery-note" data-testid="recovery-save-note">
      {saved ? `Reloading returns to the company saved ${saved}${unsavedSince ? '; anything after that is not kept.' : '.'}` : 'There is no saved company on this device yet.'}
    </p>
  );
}

/**
 * Root boundary: the application tree itself failed and has been unmounted. The company is still in memory
 * (the store lives outside React) and the simulation has stopped with the tree, so trying again loses nothing.
 */
export function AppRecovery({ report, failures, retry }: RecoveryProps) {
  const inGame = useApp((s) => !!s.engine && s.screen !== 'menu' && !s.simFault);
  const toMenu = () => {
    useApp.getState().toMenu();
    retry();
  };
  return (
    <div className="recovery-screen">
      <CrashProbe scope="fatal" />
      <Card title="The game hit a problem" testId="recovery-app">
        <p>Something went wrong while drawing the game, so it has been stopped here instead of leaving you with an empty page. {inGame ? 'Your company is still in memory and nothing has been deleted.' : 'Nothing has been deleted.'}</p>
        {failures > 1 && <p className="recovery-warn" data-testid="recovery-repeat">Trying again did not get past it. {inGame ? 'You can save and go to the main menu, or reload.' : 'Reloading the game is the next thing to try.'}</p>}
        <div className="col recovery-actions">
          <button className="btn primary block" onClick={retry} data-testid="recovery-retry">Try again</button>
          {inGame && <button className="btn block" onClick={toMenu} data-testid="recovery-menu">Save and go to the main menu</button>}
          <button className="btn block" onClick={reload} data-testid="recovery-reload">Reload the game</button>
        </div>
        <ReloadNote unsavedSince={inGame} />
        <CrashDetails report={report} />
      </Card>
    </div>
  );
}

/**
 * The 3D world failed. The interface is still running over it, so the player can open panels and save; the game
 * was paused when it happened. Restarting mounts a new canvas (and with it a new WebGL context).
 */
export function WorldRecovery({ report, failures, retry }: RecoveryProps) {
  const restart = () => {
    const app = useApp.getState();
    // The old canvas is gone, and so is any context-loss state it reported.
    app.setContextLost(false);
    app.setSceneReady(false);
    retry();
  };
  return (
    <div className="world-recovery">
      <div className="world-recovery-card">
      <Card title="The 3D view stopped" testId="recovery-world">
        <p>The city could not be drawn. The game is paused and your company is safe: the menus still work, and you can save from Settings.</p>
        {failures > 1 && <p className="recovery-warn" data-testid="recovery-repeat">Restarting did not bring it back. A lower graphics quality in Settings can help; otherwise save and reload the game.</p>}
        <div className="col recovery-actions">
          <button className="btn primary block" onClick={restart} data-testid="recovery-retry">Restart the 3D view</button>
          <button className="btn block" onClick={reload} data-testid="recovery-reload">Reload the game</button>
        </div>
        <ReloadNote unsavedSince />
        <CrashDetails report={report} />
      </Card>
      </div>
    </div>
  );
}

/** The heads-up display failed. The world keeps drawing behind; the game was paused when it happened. */
export function HudRecovery({ report, failures, retry }: RecoveryProps) {
  const restore = () => {
    const app = useApp.getState();
    // Start from the plainest interface: whatever was open may be what failed.
    app.openPanel(null);
    app.select(null);
    app.setPhoto({ on: false });
    retry();
  };
  return (
    <div className="hud-recovery">
      <Card title="The controls hit a problem" testId="recovery-hud">
        <p>The game's buttons and panels could not be drawn. The game is paused and your company is safe.</p>
        {failures > 1 && <p className="recovery-warn" data-testid="recovery-repeat">Restoring them did not work. You can save and go to the main menu, or reload.</p>}
        <div className="col recovery-actions">
          <button className="btn primary block" onClick={restore} data-testid="recovery-retry">Restore the controls</button>
          <button className="btn block" onClick={() => useApp.getState().toMenu()} data-testid="recovery-menu">Save and go to the main menu</button>
          <button className="btn block" onClick={reload} data-testid="recovery-reload">Reload the game</button>
        </div>
        <ReloadNote unsavedSince />
        <CrashDetails report={report} />
      </Card>
    </div>
  );
}

/** One panel failed: it is replaced by this, and the rest of the game carries on. */
export function PanelRecovery({ report, failures, retry }: RecoveryProps) {
  const close = () => useApp.getState().openPanel(null);
  return (
    <>
      <div className="panel-backdrop" onClick={close} />
      <div className="panel-recovery">
        <Card title="This screen could not open" testId="recovery-panel">
          <p>Something went wrong showing it. The rest of the game is still running and your company is safe.</p>
          {failures > 1 && <p className="recovery-warn" data-testid="recovery-repeat">It failed again. Close it and carry on; the other screens are not affected.</p>}
          <div className="col recovery-actions">
            <button className="btn primary block" onClick={close} data-testid="recovery-close">Close</button>
            <button className="btn block" onClick={retry} data-testid="recovery-retry">Try again</button>
          </div>
          <CrashDetails report={report} />
        </Card>
      </div>
    </>
  );
}

/**
 * The simulation step threw (src/app/gameLoop.ts). The company in memory may be half-updated, so it is not
 * offered for saving; the saves on the device are untouched.
 */
export function SimFaultOverlay() {
  const fault = useApp((s) => s.simFault);
  if (!fault) return null;
  return (
    <div className="recovery-screen over-game">
      <Card title="The simulation stopped" testId="recovery-simulation">
        <p>The game's simulation ran into an error and has been stopped so it cannot damage your company. Your saves on this device have not been changed.</p>
        <div className="col recovery-actions">
          <button className="btn primary block" onClick={reload} data-testid="recovery-reload">Reload the game</button>
          <button className="btn block" onClick={() => useApp.getState().leaveWithoutSaving()} data-testid="recovery-menu">Go to the main menu</button>
        </div>
        <ReloadNote unsavedSince />
        <CrashDetails report={fault} />
      </Card>
    </div>
  );
}
