import { useEffect, useState } from 'react';
import { useApp, useGame } from './store';
import { startGameLoop } from './gameLoop';
import { GameScene } from '@/world/scene/GameScene';
import { TopHud } from '@/ui/hud/TopHud';
import { ActionBar } from '@/ui/hud/ActionBar';
import { WorldControls } from '@/ui/hud/WorldControls';
import { ServiceCameraBar } from '@/ui/hud/ServiceCameraBar';
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
import { MissionCoach } from '@/ui/overlays/MissionCoach';
import { missionActive, missionStage } from '@/game/progression/mission';
import { CrashProbe, ErrorBoundary } from '@/ui/overlays/ErrorBoundary';
import { HudRecovery, PanelRecovery, SimFaultOverlay, WorldRecovery } from '@/ui/overlays/Recovery';

/** A part of the game the player needs in order to play has failed: stop the clock until they have dealt with it. */
function pauseGame(): void {
  const app = useApp.getState();
  if (app.engine && app.engine.state.speed !== 0) app.dispatch({ type: 'set-speed', speed: 0 }, { inline: true });
}

/** The 3D world failed: pause, and take the loading screen away (there is no first frame left to wait for). */
function worldFailed(): void {
  pauseGame();
  useApp.getState().setSceneReady(true);
}

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
  // Lets the stylesheet mark the one control each objective is waiting for, and clear the toasts out of its way.
  const missionClass = useGame((s) => (missionActive(s) ? ` mission-on mission-s${missionStage(s)}` : s.mission?.status === 'completed' && !s.mission.acknowledged ? ' mission-summary-open' : '')) ?? '';
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
  if (screen === 'menu')
    return (
      <>
        <CrashProbe scope="app" also="fatal" />
        <MainMenu />
      </>
    );
  // Error boundaries, innermost first: a panel, the interface, the 3D world; main.tsx holds the one around all of this.
  // A failure costs the player only the part that failed (ErrorBoundary.tsx, Recovery.tsx).
  return (
    <div className="app">
      <CrashProbe scope="app" also="fatal" />
      <div className="app-world">
        <ErrorBoundary scope="world" fallback={(p) => <WorldRecovery {...p} />} onCatch={worldFailed}>
          {worldMounted && <GameScene />}
        </ErrorBoundary>
      </div>
      {/* Desktop only: phones show static vehicle previews and never open a second WebGL context. */}
      {/* The warm-up is an optimization: if it fails, the previews simply start cold. */}
      {!deviceProfile().touch && (
        <ErrorBoundary scope="preview" fallback={() => null}>
          <PreviewWarmup />
        </ErrorBoundary>
      )}
      <AdaptiveQuality />
      <div className={`app-ui ${photo ? 'photo' : ''}${missionClass}`}>
        <ErrorBoundary scope="hud" fallback={(p) => <HudRecovery {...p} />} onCatch={pauseGame}>
          <CrashProbe scope="hud" />
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
              <ServiceCameraBar />
              <TutorialHint />
              <MissionCoach />
              {panel && (
                // Keyed by panel: opening another one starts with a clean boundary.
                <ErrorBoundary key={panel} scope="panel" fallback={(p) => <PanelRecovery {...p} />}>
                  <CrashProbe scope="panel" />
                  {panel === 'jobs' && <JobsPanel />}
                  {panel === 'employees' && <EmployeesPanel />}
                  {panel === 'fleet' && <FleetPanel />}
                  {panel === 'supply' && <SupplyPanel />}
                  {panel === 'hq' && <HqPanel />}
                  {panel === 'marketing' && <MarketingPanel />}
                  {panel === 'finance' && <FinancePanel />}
                  {panel === 'settings' && <SettingsPanel />}
                </ErrorBoundary>
              )}
              {/* After the panels: notifications raised from a panel ("Hired", an action error) are never hidden or blocked by it. */}
              <Celebration />
              <ErrorBanner />
              {screen === 'summary' && <CampaignSummary />}
            </>
          )}
        </ErrorBoundary>
      </div>
      <TouchTutorial />
      <LoadingScreen />
      <ContextLostOverlay />
      <SimFaultOverlay />
    </div>
  );
}
