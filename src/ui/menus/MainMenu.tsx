import { useState } from 'react';
import { useApp } from '@/app/store';
import { hasSave, SAVE_KEY, AUTOSAVE_KEY } from '@/persistence/save';

export function MainMenu() {
  const newGame = useApp((s) => s.newGame);
  const continueGame = useApp((s) => s.continueGame);
  const [seed, setSeed] = useState('');
  const canContinue = hasSave(SAVE_KEY) || hasSave(AUTOSAVE_KEY);
  return (
    <div className="menu">
      <div className="glass menu-card" data-testid="main-menu">
        <div className="menu-logo">
          <div className="mark">E</div>
          <h1>
            HVAC Company Owner V3
            <small>EGO HVAC Empire</small>
          </h1>
        </div>
        <p>
          Run a diagnostics-first heating and air company in a sunlit Las Vegas neighborhood. Dispatch trucks, measure instead of guess, hire and train your team, grow the fleet and the headquarters. <b>Most HVAC companies guess. We measure.</b>
        </p>
        <div className="col">
          <button className="btn primary" onClick={() => newGame(seed ? parseInt(seed, 10) || undefined : undefined)} data-testid="new-game">
            Start The First 90 Days
          </button>
          <button className="btn" disabled={!canContinue} onClick={() => continueGame()} data-testid="continue-game">
            {canContinue ? 'Continue saved company' : 'No saved company yet'}
          </button>
        </div>
        <div className="row between muted" style={{ fontSize: 12.5 }}>
          <label className="row" style={{ gap: 8 }}>
            World seed
            <input className="select" style={{ width: 120, padding: '6px 8px' }} placeholder="random" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} data-testid="seed-input" />
          </label>
          <span>Starting cash $25,000 · 1 technician · 1 van</span>
        </div>
      </div>
    </div>
  );
}
