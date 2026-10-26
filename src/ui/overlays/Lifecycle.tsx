import { useEffect, useState } from 'react';
import { useApp, type Quality } from '@/app/store';
import { deviceProfile, presetLabel } from '@/app/device';
import { saveToStorage, AUTOSAVE_KEY } from '@/persistence/save';

const TIPS = [
  'Most HVAC companies guess. EGO HVAC measures.',
  'Diagnose first: the right fault on the first visit keeps reviews high.',
  'A wrapped van on the road brings in direct calls.',
  'Train technicians in the academy: attributes improve for good.',
];

/**
 * Covers start-up until the world has drawn its first frames. The spinner and the bar animate
 * with CSS transforms, which the compositor keeps running while the main thread is busy compiling
 * shaders, so the game never looks frozen.
 */
export function LoadingScreen() {
  const ready = useApp((s) => s.sceneReady);
  const [gone, setGone] = useState(ready);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  useEffect(() => {
    if (!ready) {
      setGone(false);
      return;
    }
    const t = setTimeout(() => setGone(true), 450);
    return () => clearTimeout(t);
  }, [ready]);
  if (gone) return null;
  return (
    <div className={`loading-screen ${ready ? 'done' : ''}`} data-testid="loading-screen" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="loading-mark">E</div>
        <div className="loading-title">EGO HVAC Empire</div>
        <div className="loading-step">{ready ? 'Ready' : 'Building the neighborhood and warming up the graphics…'}</div>
        <div className="loading-bar"><span /></div>
        <div className="loading-tip">{tip}</div>
      </div>
    </div>
  );
}

/** Shown when the browser drops the WebGL context; progress is saved first. */
export function ContextLostOverlay() {
  const lost = useApp((s) => s.contextLost);
  useEffect(() => {
    if (!lost) return;
    const engine = useApp.getState().engine;
    if (engine) saveToStorage(engine.state, AUTOSAVE_KEY);
  }, [lost]);
  if (!lost) return null;
  return (
    <div className="lifecycle-overlay" role="alertdialog" aria-label="Graphics paused" data-testid="context-lost">
      <div className="glass lifecycle-card">
        <h2>Graphics paused</h2>
        <p className="muted">Your device reset the 3D graphics (this can happen after a call or a long time in the background). Your company has been saved.</p>
        <button className="btn primary block" onClick={() => location.reload()}>Reload and continue</button>
      </div>
    </div>
  );
}

/** Replaces the menu when the browser cannot run WebGL 2. */
export function UnsupportedScreen() {
  return (
    <div className="menu" data-testid="unsupported">
      <div className="glass menu-card">
        <div className="menu-logo">
          <div className="mark">E</div>
          <h1>EGO HVAC Empire<small>3D graphics unavailable</small></h1>
        </div>
        <p>This browser could not start WebGL 2, which the game needs for its 3D city.</p>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Update the browser (Safari 15+, Chrome, Edge, Firefox or Samsung Internet).</li>
          <li>Turn hardware acceleration back on in the browser settings.</li>
          <li>Close other tabs or apps and reload.</li>
        </ul>
        <button className="btn primary" onClick={() => location.reload()}>Try again</button>
      </div>
    </div>
  );
}

const STEP_DOWN: Partial<Record<Quality, Quality>> = { ultra: 'high', high: 'medium', medium: 'low' };
let adapted = false;

/**
 * On touch devices whose preset was chosen automatically, measures the frame rate for a few
 * seconds after start-up and steps the preset down once if it stays below ~24 fps.
 */
export function AdaptiveQuality() {
  const ready = useApp((s) => s.sceneReady);
  useEffect(() => {
    if (!ready || adapted || !deviceProfile().touch) return;
    let raf = 0;
    let frames = 0;
    let start = 0;
    const settle = setTimeout(() => {
      const tick = (now: number) => {
        if (!start) start = now;
        frames++;
        if (now - start < 6000) {
          raf = requestAnimationFrame(tick);
          return;
        }
        adapted = true;
        const fps = (frames * 1000) / (now - start);
        const { settings, setSettings, notify } = useApp.getState();
        const lower = STEP_DOWN[settings.quality];
        if (!settings.qualityAuto || !lower || document.hidden || fps >= 24) return;
        setSettings({ quality: lower, shadows: lower !== 'low' });
        notify(`Graphics set to ${presetLabel(lower)}`, `About ${Math.round(fps)} fps on this device; change it any time in Settings.`);
      };
      raf = requestAnimationFrame(tick);
    }, 2500);
    return () => {
      clearTimeout(settle);
      cancelAnimationFrame(raf);
    };
  }, [ready]);
  return null;
}

const TUTORIAL_KEY = 'ego-hvac-v3:touch-tutorial-seen';

/** First game on a touch device: a short card with the touch controls. */
export function TouchTutorial() {
  const ready = useApp((s) => s.sceneReady);
  const [open, setOpen] = useState(() => {
    if (!deviceProfile().touch) return false;
    try {
      return localStorage.getItem(TUTORIAL_KEY) !== '1';
    } catch {
      return true;
    }
  });
  if (!open || !ready) return null;
  const close = () => {
    try {
      localStorage.setItem(TUTORIAL_KEY, '1');
    } catch {
      /* private mode: show again next time */
    }
    setOpen(false);
  };
  return (
    <div className="lifecycle-overlay" data-testid="touch-tutorial">
      <div className="glass lifecycle-card">
        <h2>Touch controls</h2>
        <ul className="touch-help">
          <li><b>Drag one finger</b> to move around the city</li>
          <li><b>Pinch</b> to zoom, <b>twist two fingers</b> to rotate</li>
          <li><b>Tap</b> a glowing pin, house, van or technician to open it</li>
          <li>Bottom bar: <b>Jobs, Team, Fleet, HQ, Marketing, Finances</b></li>
          <li>Right side: <b>overview, HQ, follow van, save</b>, settings</li>
        </ul>
        <button className="btn primary block" onClick={close} data-testid="touch-tutorial-ok">Got it, let's work</button>
      </div>
    </div>
  );
}
