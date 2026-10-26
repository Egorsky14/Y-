import { useState } from 'react';
import { useApp } from '@/app/store';
import { hasSave, SAVE_KEY, AUTOSAVE_KEY } from '@/persistence/save';

const SHARE_TEXT = 'Run your own HVAC company in Las Vegas: EGO HVAC Empire, free in the browser.';

/** Share sheet where the browser has one (phones), otherwise copy the link. */
async function shareGame(): Promise<'shared' | 'copied' | 'failed'> {
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'EGO HVAC Empire', text: SHARE_TEXT, url });
      return 'shared';
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'failed';
  }
  return copyLink();
}

async function copyLink(): Promise<'copied' | 'failed'> {
  const url = location.origin + location.pathname;
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    // Older browsers / insecure contexts: select a temporary field.
    const field = document.createElement('textarea');
    field.value = url;
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok ? 'copied' : 'failed';
  }
}

export function MainMenu() {
  const newGame = useApp((s) => s.newGame);
  const continueGame = useApp((s) => s.continueGame);
  const [seed, setSeed] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [shareState, setShareState] = useState<'' | 'shared' | 'copied' | 'failed'>('');
  const canContinue = hasSave(SAVE_KEY) || hasSave(AUTOSAVE_KEY);
  const start = () => newGame(seed ? parseInt(seed, 10) || undefined : undefined);
  const flash = (s: typeof shareState) => {
    setShareState(s);
    setTimeout(() => setShareState(''), 2200);
  };
  return (
    <div className="menu">
      <div className="glass menu-card" data-testid="main-menu">
        <div className="menu-logo">
          <div className="mark">E</div>
          <h1>
            EGO HVAC Empire
            <small>HVAC Company Owner V3</small>
          </h1>
        </div>
        <p>
          Run a diagnostics-first heating and air company in sunny Las Vegas. Take service calls, dispatch your van, diagnose and repair, hire a team and grow the business. <b>Most HVAC companies guess. We measure.</b>
        </p>
        <div className="col">
          {canContinue && (
            <button className="btn primary" onClick={() => continueGame()} data-testid="continue-game">
              Continue my company
            </button>
          )}
          <button className={`btn ${canContinue ? '' : 'primary'}`} onClick={() => (canContinue ? setConfirming(true) : start())} data-testid="new-game">
            {canContinue ? 'Start a new company' : 'Play: start my company'}
          </button>
          {!canContinue && (
            <button className="btn" disabled data-testid="continue-game">
              No saved company yet
            </button>
          )}
        </div>
        <div className="row menu-share">
          <button className="btn" onClick={async () => flash(await shareGame())} data-testid="share-game">
            Share game
          </button>
          <button className="btn ghost" onClick={async () => flash(await copyLink())} data-testid="copy-link">
            Copy link
          </button>
          <span className="muted" aria-live="polite" style={{ fontSize: 12.5 }}>
            {shareState === 'copied' ? 'Link copied' : shareState === 'shared' ? 'Thanks for sharing!' : shareState === 'failed' ? 'Could not copy: use the address bar' : ''}
          </span>
        </div>
        <p className="menu-note">
          Your company is saved in this browser on this device. It does not sync to other devices and is lost if you clear this site's data. Each friend who opens the link plays their own company.
        </p>
        <div className="row between muted menu-foot">
          <label className="row" style={{ gap: 8 }}>
            World seed
            <input className="select" style={{ width: 110, padding: '6px 8px' }} inputMode="numeric" placeholder="random" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} data-testid="seed-input" />
          </label>
          <span data-testid="version">Public beta {__APP_VERSION__} · {__BUILD_ID__}</span>
        </div>
      </div>
      {confirming && (
        <div className="lifecycle-overlay" role="alertdialog" aria-label="Start a new company?">
          <div className="glass lifecycle-card">
            <h2>Start a new company?</h2>
            <p className="muted">This replaces the company saved on this device. It cannot be undone.</p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => setConfirming(false)} data-testid="cancel-new-game">Keep my company</button>
              <button className="btn danger" onClick={start} data-testid="confirm-new-game">Start over</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
