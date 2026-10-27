import { useEffect, useState } from 'react';
import { useApp } from './store';
import { startGameLoop } from './gameLoop';
import { GameScene } from '@/world/scene/GameScene';
import { TopHud } from '@/ui/hud/TopHud';
import { ActionBar } from '@/ui/hud/ActionBar';
import { WorldControls } from '@/ui/hud/WorldControls';
import { Inspector } from '@/ui/panels/Inspector';
import { JobsPanel } from '@/ui/panels/JobsPanel';
import { EmployeesPanel } from '@/ui/panels/EmployeesPanel';
import { FleetPanel } from '@/ui/panels/FleetPanel';
import { SupplyPanel } from '@/ui/panels/SupplyPanel';
import { HqPanel } from '@/ui/panels/HqPanel';
import { MarketingPanel } from '@/ui/panels/MarketingPanel';
import { FinancePanel } from '@/ui/panels/FinancePanel';
import { SettingsPanel } from '@/ui/panels/SettingsPanel';
import { Celebration, ErrorBanner, Toasts, TutorialHint } from '@/ui/overlays/Overlays';
import { PreviewWarmup } from '@/ui/panels/VehiclePreview';
import { AdaptiveQuality, ContextLostOverlay, LoadingScreen, TouchTutorial, UnsupportedScreen } from '@/ui/overlays/Lifecycle';
import { deviceProfile } from './device';
import { MainMenu } from '@/ui/menus/MainMenu';
import { CampaignSummary } from '@/ui/menus/CampaignSummary';
import { WorldLabels } from '@/ui/overlays/WorldLabels';
import { PhotoMode } from '@/ui/overlays/PhotoMode';

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const app = useApp.getState();
      if (app.screen !== 'game') return;
      const speed = app.engine?.state.speed ?? 1;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          app.dispatch({ type: 'set-speed', speed: speed === 0 ? 1 : 0 });
          break;
        case '1':
          app.dispatch({ type: 'set-speed', speed: 1 });
          break;
        case '2':
          app.dispatch({ type: 'set-speed', speed: 2 });
          break;
        case '3':
          app.dispatch({ type: 'set-speed', speed: 5 });
          break;
        case 'h':
        case 'H':
          app.camera({ type: 'hq' });
          break;
        case 'Home':
          app.camera({ type: 'reset' });
          break;
        case 'p':
        case 'P':
          app.setPhoto({ on: !app.photo.on });
          break;
        case 'f':
        case 'F': {
          const moving = Object.values(app.engine?.state.vehicles ?? {}).find((v) => v.status === 'enroute' || v.status === 'returning');
          if (moving) app.camera({ type: 'follow', vehicleId: moving.id });
          break;
        }
        case 'Escape':
          if (app.panel) app.openPanel(null);
          else app.select(null);
          break;
        case 'j':
        case 'J':
          app.togglePanel('jobs');
          break;
        case 't':
        case 'T':
          app.togglePanel('employees');
          break;
        case 'v':
        case 'V':
          app.togglePanel('fleet');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const screen = useApp((s) => s.screen);
  const panel = useApp((s) => s.panel);
  const photo = useApp((s) => s.photo.on);
  useHotkeys();
  useEffect(() => startGameLoop(), []);
  // Mount the 3D world two frames after the loading screen has painted, so the screen is up
  // before the start-up shader work blocks the main thread.
  const [worldMounted, setWorldMounted] = useState(false);
  useEffect(() => {
    if (screen === 'menu') {
      setWorldMounted(false);
      return;
    }
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => setWorldMounted(true))));
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  if (!deviceProfile().webgl2) return <UnsupportedScreen />;
  if (screen === 'menu') return <MainMenu />;
  return (
    <div className="app">
      <div className="app-world">{worldMounted && <GameScene />}</div>
      {/* Desktop only: phones show static vehicle previews and never open a second WebGL context. */}
      {!deviceProfile().touch && <PreviewWarmup />}
      <AdaptiveQuality />
      <div className={`app-ui ${photo ? 'photo' : ''}`}>
        {photo ? (
          <PhotoMode />
        ) : (
          <>
        <WorldLabels />
        <TopHud />
        <Toasts />
        <Inspector />
        <ActionBar />
        <WorldControls />
        <TutorialHint />
        {panel === 'jobs' && <JobsPanel />}
        {panel === 'employees' && <EmployeesPanel />}
        {panel === 'fleet' && <FleetPanel />}
        {panel === 'supply' && <SupplyPanel />}
        {panel === 'hq' && <HqPanel />}
        {panel === 'marketing' && <MarketingPanel />}
        {panel === 'finance' && <FinancePanel />}
        {panel === 'settings' && <SettingsPanel />}
        {/* After the panels: notifications raised from a panel ("Hired", an action error) are never hidden or blocked by it. */}
        <Celebration />
        <ErrorBanner />
        {screen === 'summary' && <CampaignSummary />}
          </>
        )}
      </div>
      <TouchTutorial />
      <LoadingScreen />
      <ContextLostOverlay />
    </div>
  );
}
