import { useState } from 'react';
import { useApp, type Quality } from '@/app/store';
import { deviceProfile, MOBILE_PRESETS } from '@/app/device';
import { PanelShell } from './PanelShell';

const DESKTOP_PRESETS: { quality: Quality; detail: string }[] = [
  { quality: 'low', detail: 'No shadows, 1× DPR, no anti-aliasing, sparse desert, no rain' },
  { quality: 'medium', detail: '2k shadows, 1.25× DPR, light rain' },
  { quality: 'high', detail: '4k shadows, 1.5× DPR, full vegetation' },
  { quality: 'ultra', detail: '4k tight shadows, 2× DPR, dense vegetation, heavy rain' },
];

export function SettingsPanel() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const toMenu = useApp((s) => s.toMenu);
  const save = useApp((s) => s.save);
  const newGame = useApp((s) => s.newGame);
  const lastSavedAt = useApp((s) => s.lastSavedAt);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const touch = deviceProfile().touch;
  const presets = touch
    ? MOBILE_PRESETS.map((p) => ({ quality: p.quality, label: p.label, detail: p.detail }))
    : DESKTOP_PRESETS.map((p) => ({ ...p, label: p.quality.charAt(0).toUpperCase() + p.quality.slice(1) }));
  return (
    <PanelShell title="Settings" subtitle="Graphics, saving and controls" testId="panel-settings">
      <div className="panel-body split">
        <div className="col">
          <h4>Graphics quality</h4>
          <div className="grid2">
            {presets.map((p) => (
              <button
                key={p.quality}
                className={`option ${settings.quality === p.quality ? 'selected' : ''}`}
                onClick={() => setSettings({ quality: p.quality, shadows: p.quality !== 'low', qualityAuto: false })}
                data-testid={`quality-${p.quality}`}
              >
                <span>
                  {p.label}
                  <small>{p.detail}</small>
                </span>
              </button>
            ))}
          </div>
          <label className="row card"><input type="checkbox" checked={settings.shadows} onChange={(e) => setSettings({ shadows: e.target.checked, qualityAuto: false })} /> Shadows</label>
          <label className="row card"><input type="checkbox" checked={settings.showLabels} onChange={(e) => setSettings({ showLabels: e.target.checked })} /> Vehicle labels in the world</label>
          <label className="row card"><input type="checkbox" checked={settings.autosave} onChange={(e) => setSettings({ autosave: e.target.checked })} /> Autosave (every 45 s, at midnight and when you leave the game)</label>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => save()} data-testid="settings-save">Save game</button>
            <button className="btn" onClick={toMenu}>Save &amp; exit to menu</button>
            <button className="btn danger" onClick={() => setConfirmRestart(true)} data-testid="restart-company">Restart company</button>
          </div>
          {confirmRestart && (
            <div className="card col" role="alertdialog" aria-label="Restart company?">
              <b>Start over with a new company?</b>
              <span className="muted" style={{ fontSize: 12.5 }}>Your current company on this device is replaced. This cannot be undone.</span>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" onClick={() => setConfirmRestart(false)}>Keep playing</button>
                <button className="btn danger" onClick={() => newGame()} data-testid="confirm-restart">Start over</button>
              </div>
            </div>
          )}
          {lastSavedAt && <div className="muted" style={{ fontSize: 12 }}>Last manual save {new Date(lastSavedAt).toLocaleTimeString()}</div>}
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Saves live in this browser on this device only. They do not sync between devices and are lost if you clear this site's data.</div>
        </div>
        <div className="col">
          <h4>Controls</h4>
          {touch ? (
            <div className="card col" style={{ gap: 6, fontSize: 13 }}>
              <div className="row between"><span>Move around</span><b>Drag one finger</b></div>
              <div className="row between"><span>Zoom</span><b>Pinch</b></div>
              <div className="row between"><span>Rotate</span><b>Twist two fingers</b></div>
              <div className="row between"><span>Select</span><b>Tap a pin, house, van or technician</b></div>
              <div className="row between"><span>Speed</span><b>Pause · 1× · 2× · 5× (top right)</b></div>
              <div className="row between"><span>Camera</span><b>Overview · HQ · Follow (bottom right)</b></div>
            </div>
          ) : (
            <div className="card col" style={{ gap: 6, fontSize: 13 }}>
              <div className="row between"><span>Pan</span><b>Left drag · W A S D · arrows</b></div>
              <div className="row between"><span>Orbit</span><b>Right drag · Q / E</b></div>
              <div className="row between"><span>Zoom</span><b>Mouse wheel</b></div>
              <div className="row between"><span>Select</span><b>Left click a house, truck, worker or building</b></div>
              <div className="row between"><span>Pause / speed</span><b>Space · 1 · 2 · 3</b></div>
              <div className="row between"><span>Headquarters</span><b>H</b></div>
              <div className="row between"><span>Follow truck</span><b>F</b></div>
              <div className="row between"><span>Close panel</span><b>Esc</b></div>
            </div>
          )}
          <h4>About</h4>
          <div className="card muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            HVAC Company Owner V3: EGO HVAC Empire, public beta {__APP_VERSION__} ({__BUILD_ID__}). A 3D business tycoon built on Three.js and React Three Fiber. All art is original. Most HVAC companies guess. We measure.
          </div>
        </div>
      </div>
    </PanelShell>
  );
}
