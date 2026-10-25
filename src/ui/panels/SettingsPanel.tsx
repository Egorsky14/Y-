import { useApp, type Quality } from '@/app/store';
import { PanelShell } from './PanelShell';

export function SettingsPanel() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const toMenu = useApp((s) => s.toMenu);
  const save = useApp((s) => s.save);
  const lastSavedAt = useApp((s) => s.lastSavedAt);
  return (
    <PanelShell title="Settings" subtitle="Graphics, saving and controls" testId="panel-settings">
      <div className="panel-body split">
        <div className="col">
          <h4>Graphics quality</h4>
          <div className="grid2">
            {(['low', 'medium', 'high', 'ultra'] as Quality[]).map((q) => (
              <button key={q} className={`option ${settings.quality === q ? 'selected' : ''}`} onClick={() => setSettings({ quality: q, shadows: q !== 'low' })}>
                <span style={{ textTransform: 'capitalize' }}>
                  {q}
                  <small>{q === 'low' ? 'No shadows, 1× DPR, sparse desert, no rain' : q === 'medium' ? '2k shadows, 1.25× DPR, light rain' : q === 'high' ? '4k shadows, 1.5× DPR, full vegetation' : '4k tight shadows, 2× DPR, dense vegetation, heavy rain'}</small>
                </span>
              </button>
            ))}
          </div>
          <label className="row card"><input type="checkbox" checked={settings.shadows} onChange={(e) => setSettings({ shadows: e.target.checked })} /> Shadows</label>
          <label className="row card"><input type="checkbox" checked={settings.showLabels} onChange={(e) => setSettings({ showLabels: e.target.checked })} /> Vehicle labels in the world</label>
          <label className="row card"><input type="checkbox" checked={settings.autosave} onChange={(e) => setSettings({ autosave: e.target.checked })} /> Autosave (every 45 s and at midnight)</label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" onClick={() => save()}>Save game</button>
            <button className="btn" onClick={toMenu}>Save &amp; exit to menu</button>
          </div>
          {lastSavedAt && <div className="muted" style={{ fontSize: 12 }}>Last manual save {new Date(lastSavedAt).toLocaleTimeString()}</div>}
        </div>
        <div className="col">
          <h4>Controls</h4>
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
          <h4>About</h4>
          <div className="card muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            HVAC Company Owner V3: EGO HVAC Empire. A 3D business tycoon built on Three.js and React Three Fiber. All art is procedural and original. Most HVAC companies guess. We measure.
          </div>
        </div>
      </div>
    </PanelShell>
  );
}
