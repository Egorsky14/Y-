import { useEffect } from 'react';
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
import { HqPanel } from '@/ui/panels/HqPanel';
import { MarketingPanel } from '@/ui/panels/MarketingPanel';
import { FinancePanel } from '@/ui/panels/FinancePanel';
import { SettingsPanel } from '@/ui/panels/SettingsPanel';
import { Celebration, ErrorBanner, Toasts, TutorialHint } from '@/ui/overlays/Overlays';
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

  if (screen === 'menu') return <MainMenu />;
  return (
    <div className="app">
      <div className="app-world">
        <GameScene />
      </div>
      <div className={`app-ui ${photo ? 'photo' : ''}`}>
        {photo ? (
          <PhotoMode />
        ) : (
          <>
        <WorldLabels />
        <TopHud />
        <Toasts />
        <Celebration />
        <Inspector />
        <ActionBar />
        <WorldControls />
        <TutorialHint />
        <ErrorBanner />
        {panel === 'jobs' && <JobsPanel />}
        {panel === 'employees' && <EmployeesPanel />}
        {panel === 'fleet' && <FleetPanel />}
        {panel === 'hq' && <HqPanel />}
        {panel === 'marketing' && <MarketingPanel />}
        {panel === 'finance' && <FinancePanel />}
        {panel === 'settings' && <SettingsPanel />}
        {screen === 'summary' && <CampaignSummary />}
          </>
        )}
      </div>
    </div>
  );
}
