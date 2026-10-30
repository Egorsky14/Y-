import { useState } from 'react';
import { useApp, useGame } from '@/app/store';
import { Icon } from '../components/common';
import { deviceProfile } from '@/app/device';

export function WorldControls() {
  const camera = useApp((s) => s.camera);
  const follow = useApp((s) => s.followVehicleId);
  const setFollow = useApp((s) => s.setFollow);
  const save = useApp((s) => s.save);
  const openPanel = useApp((s) => s.openPanel);
  const panel = useApp((s) => s.panel);
  const setPhoto = useApp((s) => s.setPhoto);
  const movingVehicle = useGame((s) => Object.values(s.vehicles).find((v) => v.status === 'enroute' || v.status === 'returning')?.id);
  const [saved, setSaved] = useState(false);
  return (
    <div className="glass world-controls">
      <button
        onClick={() => {
          camera({ type: 'reset' });
          // From the city overview an open job panel only needs its header (expand it again with ▾).
          if (useApp.getState().selection) useApp.getState().setInspectorCompact(true);
        }}
        title="Reset camera (Home)"
        data-testid="cam-reset"
      >
        <Icon name="camera" /> <span className="lbl">Overview</span>
      </button>
      <button onClick={() => camera({ type: 'hq' })} title="Jump to headquarters (H)" data-testid="cam-hq">
        <Icon name="home" /> <span className="lbl">HQ</span>
      </button>
      <button
        className={follow ? 'active' : ''}
        disabled={!movingVehicle && !follow}
        onClick={() => (follow ? setFollow(null) : movingVehicle && camera({ type: 'follow', vehicleId: movingVehicle }))}
        title="Follow an active truck (F)"
        data-testid="cam-follow"
      >
        <Icon name="follow" /> <span className="lbl">{follow ? 'Stop following' : 'Follow truck'}</span>
      </button>
      <button
        onClick={() => {
          if (save()) {
            setSaved(true);
            // Compact layouts hide the button label, so confirm with a toast on touch devices.
            if (deviceProfile().touch) useApp.getState().notify('Game saved', 'Stored in this browser on this device.');
            setTimeout(() => setSaved(false), 1500);
          }
        }}
        title="Save game"
        data-testid="save-game"
      >
        <Icon name="save" /> <span className="lbl">{saved ? 'Saved ✓' : 'Save'}</span>
      </button>
      <button onClick={() => setPhoto({ on: true })} title="Photo mode (P): hide the HUD, free camera, time-of-day preview, save a PNG" data-testid="photo-mode-toggle">
        <Icon name="photo" /> <span className="lbl">Photo</span>
      </button>
      <button className={panel === 'settings' ? 'active' : ''} onClick={() => openPanel(panel === 'settings' ? null : 'settings')} title="Settings and menu" aria-label="Settings" data-testid="world-settings">
        <Icon name="settings" />
      </button>
    </div>
  );
}
