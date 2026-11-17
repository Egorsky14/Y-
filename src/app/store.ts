import { useMemo } from 'react';
import { defaultQuality, deviceProfile } from './device';
import { create } from 'zustand';
import { GameEngine } from '@/game/simulation/engine';
import type { GameAction } from '@/game/simulation/actions';
import type { GameState } from '@/game/simulation/types';
import type { ActionResult } from '@/game/jobs/workflow';
import { AUTOSAVE_KEY, SAVE_KEY, loadFromStorage, saveToStorage } from '@/persistence/save';
import { spawnLead, type SpawnLeadOptions } from '@/game/jobs/leads';
import { browserFamily, crashLog, setDiagnosticProviders, type CrashReport, type CrashScope } from './diagnostics';

export type SelectionKind = 'lot' | 'vehicle' | 'employee' | 'job';
export interface Selection {
  kind: SelectionKind;
  id: string;
}

export type PanelId = 'jobs' | 'employees' | 'fleet' | 'supply' | 'hq' | 'marketing' | 'finance' | 'settings' | null;

type P2 = { x: number; z: number };
type OrbitPose = { target: P2; azimuth: number; elevation: number; distance: number };

export interface CameraCommand {
  id: number;
  type: 'focus' | 'reset' | 'hq' | 'follow';
  target?: { x: number; z: number };
  vehicleId?: string;
  distance?: number;
  /** Optional view direction (radians around +y) for cinematic focus; default keeps the current heading. */
  azimuth?: number;
  /** Camera elevation above the target in radians (default 0.62); only with azimuth. */
  elevation?: number;
  /** Height of the look-at point above the ground (default 0). */
  targetY?: number;
  /** Fly around the target (azimuth, elevation and distance eased) instead of in a straight line, so a swing to the far side of a house goes over it rather than through it. */
  orbit?: boolean;
  /**
   * Close view of a work site: points that must stay visible. After the player stops orbiting near
   * the target, a blocked view eases to the nearest clear one (cameraOcclusion.ts).
   */
  watch?: { lotIds: string[]; points: { x: number; y: number; z: number }[]; cabinet?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } };
  /** Issued by the service camera itself (ServiceDirector); any other command ends the service view. */
  service?: boolean;
  /**
   * Keep following a walking crew member (the named scene object) after the flight, along a walk
   * plan (serviceCall WalkPlan / walkPose): the view eases every frame toward the pose the plan gives
   * for where he is, turning gradually into the shot it ends as when he reaches his spot.
   */
  track?: { object: string; plan: { from: P2; spot: P2; unit: P2; start: OrbitPose; end: OrbitPose } };
  /** Seconds for an orbit flight (default 1.1). */
  duration?: number;
}

/** Service camera modes: the property establishing shot, watching the work, the close-up of the hands and tools. */
export type ServiceCameraMode = 'property' | 'work' | 'detail';

/** The service camera the player is using at a job (ServiceDirector frames it); rev bumps on every request. */
export interface ServiceView {
  jobId: string;
  lotId: string;
  mode: ServiceCameraMode;
  rev: number;
}

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface Settings {
  quality: Quality;
  shadows: boolean;
  autosave: boolean;
  sound: boolean;
  showLabels: boolean;
  /** True until the player picks a preset: the game may then step quality down once if frames are slow. */
  qualityAuto: boolean;
}

export interface Toast {
  id: number;
  type: 'info' | 'success' | 'warning' | 'celebration' | 'money';
  title: string;
  body?: string;
  focus?: { kind: 'job' | 'vehicle' | 'employee' | 'lot'; id: string };
  createdAt: number;
}

interface AppState {
  engine: GameEngine | null;
  /** Bumped (throttled) whenever the simulation changes so React selectors re-run. */
  version: number;
  screen: 'menu' | 'game' | 'summary';
  selection: Selection | null;
  /** Inspector collapsed to its header (more of the scene visible, e.g. while watching the work). */
  inspectorCompact: boolean;
  serviceView: ServiceView | null;
  panel: PanelId;
  cameraCommand: CameraCommand | null;
  followVehicleId: string | null;
  /** Photo mode: HUD hidden, free camera, optional preview time of day (minutes) and weather; never touches the simulation. */
  photo: { on: boolean; minute: number | null; weather: 'clear' | 'heat-wave' | 'overcast' | 'monsoon' | null };
  settings: Settings;
  toasts: Toast[];
  /** Celebration banners, first in first out: the head is on screen, the rest wait their turn. */
  celebrations: Toast[];
  lastError: string | null;
  /** The world has drawn its first frames (start-up shader work is done); hides the loading screen. */
  sceneReady: boolean;
  /** The browser dropped the WebGL context (GPU reset, memory pressure, long background). */
  contextLost: boolean;
  lastSavedAt: number | null;
  /** Last processed game event id for toast generation. */
  lastEventId: number;
  /**
   * The simulation step threw. Stepping and autosaving stop (the state may be half-updated, so it is never
   * written over a save); the recovery overlay offers the last save. Cleared by loading or starting a game.
   */
  simFault: CrashReport | null;
  /** Test hook (window.__ego.crash): the part of the game that should fail on its next render. Never set by the game. */
  crashTest: { scope: CrashTestScope; sticky: boolean } | null;

  newGame: (seed?: number) => void;
  continueGame: () => boolean;
  loadFromKey: (key: string) => boolean;
  save: () => boolean;
  toMenu: () => void;
  /** inline: the caller shows the result itself, so a failure does not also raise the error banner. */
  dispatch: (action: GameAction, opts?: { inline?: boolean }) => ActionResult;
  select: (selection: Selection | null) => void;
  setInspectorCompact: (compact: boolean) => void;
  /** Enter or change the service camera (null leaves it; the camera stays where it is). */
  setServiceView: (view: Omit<ServiceView, 'rev'> | null) => void;
  /** The service camera ended by the player's camera moves (panning away from the site), not its own exit button: leaves it and says so. */
  serviceCameraOff: () => void;
  openPanel: (panel: PanelId) => void;
  togglePanel: (panel: Exclude<PanelId, null>) => void;
  camera: (cmd: Omit<CameraCommand, 'id'>) => void;
  setPhoto: (patch: Partial<AppState['photo']>) => void;
  setFollow: (vehicleId: string | null) => void;
  setSettings: (patch: Partial<Settings>) => void;
  dismissToast: (id: number) => void;
  dismissCelebration: (id: number) => void;
  clearError: () => void;
  setSceneReady: (ready: boolean) => void;
  /** A UI-originated toast (not from the simulation), e.g. an automatic graphics change. */
  notify: (title: string, body?: string) => void;
  setContextLost: (lost: boolean) => void;
  setSimFault: (report: CrashReport | null) => void;
  /** Back to the main menu without writing a save (the simulation state is not trusted after a fault). */
  leaveWithoutSaving: () => void;
  setCrashTest: (test: AppState['crashTest']) => void;
  bump: () => void;
}

/** What window.__ego.crash can break: a boundary's subtree, the simulation step, or the app together with its own recovery screen. */
export type CrashTestScope = Extract<CrashScope, 'app' | 'world' | 'hud' | 'panel' | 'simulation' | 'fatal'>;

const DEFAULT_QUALITY = defaultQuality();
const DEFAULT_SETTINGS: Settings = { quality: DEFAULT_QUALITY, shadows: DEFAULT_QUALITY !== 'low', autosave: true, sound: false, showLabels: true, qualityAuto: true };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('ego-hvac-v3:settings');
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let cameraCommandId = 1;
let toastId = 1;

/** Most celebrations kept waiting; beyond this the oldest waiting ones (never the one on screen) are dropped. */
export const CELEBRATION_QUEUE_LIMIT = 8;

/**
 * Appends celebrations in the order they happened. The banner on screen (the head) is never
 * replaced by a newer one; if the queue overflows, the oldest waiting entries make room.
 */
export function enqueueCelebrations(queue: Toast[], incoming: Toast[], limit = CELEBRATION_QUEUE_LIMIT): Toast[] {
  const next = [...queue, ...incoming];
  if (next.length <= limit) return next;
  return [next[0], ...next.slice(next.length - (limit - 1))];
}

export const SERVICE_OFF_TITLE = 'Service camera off';
const SERVICE_OFF_BODY = 'Select Watch technician to return.';

/**
 * The toasts with the notice that the service camera has ended added, unless it is already on screen,
 * so ending it again (or rapid picking and panning) never stacks copies.
 */
export function withServiceOffNotice(toasts: Toast[], now = Date.now()): Toast[] {
  if (toasts.some((t) => t.title === SERVICE_OFF_TITLE)) return toasts;
  return [...toasts, { id: toastId++, type: 'info' as const, title: SERVICE_OFF_TITLE, body: SERVICE_OFF_BODY, createdAt: now }].slice(-6);
}

export const useApp = create<AppState>((set, get) => ({
  engine: null,
  version: 0,
  screen: 'menu',
  selection: null,
  inspectorCompact: false,
  serviceView: null,
  panel: null,
  cameraCommand: null,
  followVehicleId: null,
  photo: { on: false, minute: null, weather: null },
  settings: loadSettings(),
  toasts: [],
  celebrations: [],
  lastError: null,
  sceneReady: false,
  contextLost: false,
  lastSavedAt: null,
  lastEventId: 0,
  simFault: null,
  crashTest: null,

  newGame: (seed) => {
    const engine = GameEngine.newGame({ seed: seed ?? Math.floor(Math.random() * 1_000_000) });
    attachEngine(engine);
    set({ engine, screen: 'game', selection: null, panel: null, toasts: [], celebrations: [], sceneReady: false, lastEventId: 0, followVehicleId: null, version: 0, serviceView: null, simFault: null });
    saveToStorage(engine.state, SAVE_KEY);
    get().camera({ type: 'reset' });
  },
  continueGame: () => get().loadFromKey(SAVE_KEY) || get().loadFromKey(AUTOSAVE_KEY),
  loadFromKey: (key) => {
    const state = loadFromStorage(key);
    if (!state) return false;
    const engine = new GameEngine(state);
    attachEngine(engine);
    const lastEventId = state.events.length ? state.events[state.events.length - 1].id : 0;
    set({ engine, screen: state.campaignComplete ? 'summary' : 'game', selection: null, panel: null, toasts: [], celebrations: [], sceneReady: false, lastEventId, followVehicleId: null, version: 0, serviceView: null, simFault: null });
    get().camera({ type: 'reset' });
    return true;
  },
  save: () => {
    const engine = get().engine;
    if (!engine || get().simFault) return false;
    const ok = saveToStorage(engine.state, SAVE_KEY);
    if (ok) set({ lastSavedAt: Date.now() });
    return ok;
  },
  toMenu: () => {
    const engine = get().engine;
    if (engine && !get().simFault) saveToStorage(engine.state, SAVE_KEY);
    set({ screen: 'menu', panel: null, selection: null });
  },
  dispatch: (action, opts) => {
    const engine = get().engine;
    if (!engine) return { ok: false, reason: 'No game running.' };
    const result = engine.dispatch(action);
    if (!result.ok && !opts?.inline) set({ lastError: result.reason });
    get().bump();
    return result;
  },
  // Picking something else ends the service view (and says so); closing the inspector or re-picking the same job or lot keeps it.
  select: (selection) =>
    set((s) => {
      const v = s.serviceView;
      const keep = !selection || (v && ((selection.kind === 'job' && selection.id === v.jobId) || (selection.kind === 'lot' && selection.id === v.lotId)));
      return { selection, inspectorCompact: keep && v ? s.inspectorCompact : false, serviceView: keep ? v : null, toasts: v && !keep ? withServiceOffNotice(s.toasts) : s.toasts };
    }),
  setInspectorCompact: (inspectorCompact) => set({ inspectorCompact }),
  setServiceView: (view) => set((s) => ({ serviceView: view ? { ...view, rev: (s.serviceView?.rev ?? 0) + 1 } : null })),
  serviceCameraOff: () => set((s) => (s.serviceView ? { serviceView: null, toasts: withServiceOffNotice(s.toasts) } : {})),
  openPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  // Any camera command but the service camera's own (Overview, HQ, follow, a focus) ends the service view, and says so.
  camera: (cmd) =>
    set((s) => {
      const ends = !!s.serviceView && !cmd.service;
      return { cameraCommand: { ...cmd, id: cameraCommandId++ }, followVehicleId: cmd.type === 'follow' ? (cmd.vehicleId ?? null) : null, serviceView: cmd.service ? s.serviceView : null, toasts: ends ? withServiceOffNotice(s.toasts) : s.toasts };
    }),
  setPhoto: (patch) => set((st) => ({ photo: { ...st.photo, ...patch } })),
  setFollow: (vehicleId) => set({ followVehicleId: vehicleId }),
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    try {
      localStorage.setItem('ego-hvac-v3:settings', JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    set({ settings });
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  dismissCelebration: (id) => set((s) => ({ celebrations: s.celebrations.filter((t) => t.id !== id) })),
  clearError: () => set({ lastError: null }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  notify: (title, body) => set((s) => ({ toasts: [...s.toasts, { id: toastId++, type: 'info' as const, title, body, createdAt: Date.now() }].slice(-6) })),
  setContextLost: (contextLost) => set({ contextLost }),
  setSimFault: (simFault) => set({ simFault }),
  leaveWithoutSaving: () => set({ screen: 'menu', panel: null, selection: null, serviceView: null, engine: null, simFault: null }),
  setCrashTest: (crashTest) => set({ crashTest }),
  bump: () => {
    const { engine, lastEventId } = get();
    if (!engine) return;
    const state = engine.state;
    const fresh = state.events.filter((e) => e.id > lastEventId);
    const now = Date.now();
    const toasts = fresh.map<Toast>((e) => ({ id: toastId++, type: e.type, title: e.title, body: e.body, focus: e.focus, createdAt: now }));
    set((s) => ({
      version: s.version + 1,
      lastEventId: fresh.length ? fresh[fresh.length - 1].id : lastEventId,
      toasts: [...s.toasts, ...toasts.filter((t) => t.type !== 'celebration')].slice(-6),
      celebrations: enqueueCelebrations(s.celebrations, toasts.filter((t) => t.type === 'celebration')),
      screen: state.campaignComplete && s.screen === 'game' ? 'summary' : s.screen,
    }));
  },
}));

let detach: (() => void) | null = null;
let pendingBump = false;
let lastBumpAt = 0;
const UI_UPDATE_INTERVAL_MS = 120;
function attachEngine(engine: GameEngine): void {
  detach?.();
  detach = engine.subscribe(() => {
    // Throttle React updates (~8 Hz); the 3D layer reads engine.state directly every frame.
    if (pendingBump) return;
    pendingBump = true;
    const wait = Math.max(0, UI_UPDATE_INTERVAL_MS - (performance.now() - lastBumpAt));
    setTimeout(() => {
      pendingBump = false;
      lastBumpAt = performance.now();
      useApp.getState().bump();
    }, wait);
  });
}

/**
 * Select from the live GameState. The selector re-runs only when the simulation version
 * changes, so it may freely return fresh arrays/objects without causing render loops.
 */
export function useGame<T>(selector: (state: GameState) => T): T {
  const version = useApp((s) => s.version);
  const engine = useApp((s) => s.engine);
  return useMemo(() => (engine ? selector(engine.state) : (undefined as unknown as T)), [version, engine]);
}

/**
 * Like useGame, for selectors that also read component inputs (a selected technician or van):
 * re-runs when the simulation changes or when any of `deps` changes.
 */
export function useGameWith<T>(selector: (state: GameState) => T, deps: unknown[]): T {
  const version = useApp((s) => s.version);
  const engine = useApp((s) => s.engine);
  const key = JSON.stringify(deps);
  return useMemo(() => (engine ? selector(engine.state) : (undefined as unknown as T)), [version, engine, key]);
}

export function getGameState(): GameState | null {
  return useApp.getState().engine?.state ?? null;
}

// Expose for end-to-end tests and debugging.
declare global {
  interface Window {
    __ego?: {
      getState: () => GameState | null;
      dispatch: (action: GameAction) => ActionResult;
      advanceMinutes: (minutes: number) => void;
      /** Test hook: force a lead for a lot/fault. Not reachable from the UI. */
      spawnLead: (opts: SpawnLeadOptions) => string | null;
      app: typeof useApp;
      /**
       * Test hook: make part of the game fail on its next render (or the next simulation step), to exercise the
       * recovery screens. sticky keeps it failing on every retry. Not reachable from the UI.
       */
      crash: (scope: CrashTestScope, sticky?: boolean) => void;
      /** The crash reports kept in this browser (src/app/diagnostics.ts). */
      crashLog: () => CrashReport[];
    };
  }
}

// What a crash report says about the situation: no names, no money, nothing from the save but the seed, the clock and counts.
setDiagnosticProviders({
  context: () => {
    const a = useApp.getState();
    const g = a.engine?.state;
    return {
      screen: a.screen,
      panel: a.panel,
      selection: a.selection?.kind ?? null,
      serviceCamera: a.serviceView?.mode ?? null,
      photoMode: a.photo.on,
      quality: a.settings.quality,
      sceneReady: a.sceneReady,
      contextLost: a.contextLost,
      game: g
        ? { seed: g.seed, day: g.clock.day, minute: Math.round(g.elapsedMinutes), speed: g.speed, schema: g.schemaVersion, employees: Object.keys(g.employees).length, vehicles: Object.keys(g.vehicles).length, jobs: Object.keys(g.jobs).length }
        : null,
    };
  },
  device: () => {
    if (typeof window === 'undefined') return null;
    const p = deviceProfile();
    return { viewport: `${window.innerWidth}x${window.innerHeight}`, pixelRatio: Math.round((window.devicePixelRatio || 1) * 100) / 100, touch: p.touch, phone: p.phone, tablet: p.tablet, lowEnd: p.lowEnd, webgl2: p.webgl2, browser: browserFamily(navigator.userAgent) };
  },
});
if (typeof window !== 'undefined') {
  window.__ego = {
    getState: () => getGameState(),
    dispatch: (action) => useApp.getState().dispatch(action),
    advanceMinutes: (minutes) => {
      useApp.getState().engine?.advanceMinutes(minutes);
      useApp.getState().bump();
    },
    spawnLead: (opts) => {
      const engine = useApp.getState().engine;
      if (!engine) return null;
      const job = spawnLead(engine.state, opts);
      useApp.getState().bump();
      return job?.id ?? null;
    },
    app: useApp,
    crash: (scope, sticky = false) => useApp.getState().setCrashTest({ scope, sticky }),
    crashLog: () => crashLog(),
  };
}
