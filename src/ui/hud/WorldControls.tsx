import { useState } from 'react';
import { useApp, useGame } from '@/app/store';
import { Icon } from '../components/common';

export function WorldControls() {
  const camera = useApp((s) => s.camera);
  const follow = useApp((s) => s.followVehicleId);
  const setFollow = useApp((s) => s.setFollow);
  const save = useApp((s) => s.save);
  const openPanel = useApp((s) => s.openPanel);
  const panel = useApp((s) => s.panel);
  const movingVehicle = useGame((s) => Object.values(s.vehicles).find((v) => v.status === 'enroute' || v.status === 'returning')?.id);
  const [saved, setSaved] = useState(false);
  return (
    <div className="glass world-controls">
      <button onClick={() => camera({ type: 'reset' })} title="Reset camera (Home)" data-testid="cam-reset">
        <Icon name="camera" /> Overview
      </button>
      <button onClick={() => camera({ type: 'hq' })} title="Jump to headquarters (H)" data-testid="cam-hq">
        <Icon name="home" /> HQ
      </button>
      <button
        className={follow ? 'active' : ''}
        disabled={!movingVehicle && !follow}
        onClick={() => (follow ? setFollow(null) : movingVehicle && camera({ type: 'follow', vehicleId: movingVehicle }))}
        title="Follow an active truck (F)"
        data-testid="cam-follow"
      >
        <Icon name="follow" /> {follow ? 'Stop following' : 'Follow truck'}
      </button>
      <button
        onClick={() => {
          if (save()) {
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }
        }}
        title="Save game"
        data-testid="save-game"
      >
        <Icon name="save" /> {saved ? 'Saved ✓' : 'Save'}
      </button>
      <button className={panel === 'settings' ? 'active' : ''} onClick={() => openPanel(panel === 'settings' ? null : 'settings')} title="Settings and menu">
        <Icon name="settings" />
      </button>
    </div>
  );
}
