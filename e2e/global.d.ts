/*
 * Test-only typing of window.__ego as the test builds have it (src/app/store.ts). A production build has only
 * `build` and `crashLog`; e2e/production-release.spec.ts is the one spec that runs against it.
 */
interface EgoTestHook {
  getState: () => Record<string, never> | null;
  dispatch: (action: unknown) => { ok: boolean; reason?: string };
  advanceMinutes: (minutes: number) => void;
  spawnLead: (opts: { channel?: 'warranty' | 'direct'; preferredLotId?: string; faultId?: string }) => string | null;
  /** Crash-test build only (playwright.crash.config.ts): make part of the game fail on its next render or simulation step; sticky keeps it failing. */
  crash?: (scope: 'app' | 'world' | 'hud' | 'panel' | 'simulation' | 'fatal', sticky?: boolean) => void;
  /** Version and commit of the build. */
  build: string;
  crashLog: () => { scope: string; name: string; message: string; count: number; stack: string[]; componentStack: string[] }[];
  app: { getState: () => { camera: (cmd: { type: 'focus' | 'reset' | 'hq' | 'follow'; target?: { x: number; z: number }; vehicleId?: string; distance?: number; azimuth?: number; elevation?: number; targetY?: number }) => void; photo: { on: boolean }; setPhoto: (p: { on?: boolean; minute?: number | null; weather?: string | null }) => void; sceneReady: boolean; settings: { quality: 'low' | 'medium' | 'high' | 'ultra' }; select: (sel: { kind: string; id: string } | null) => void } };
}
interface Window {
  __ego?: EgoTestHook;
}
interface Window {
  __egoRender?: { calls: number; triangles: number; geometries: number; textures: number; frame: number; houses: number; vehicleModels: number; workers: number; instanced: number; kits: number; cam: [number, number, number] };
  __egoVehicles?: Record<string, { x: number; z: number; heading: number; wheelSpin: number; steer: number; roll: number; pitch: number }>;
  __egoAtmo?: { minute: number; weather: string; elevation: number; sunIntensity: number; exposure: number; fogNear: number; rain: number };
  __egoBayDoors?: Record<number, number>;
  __egoWorkers?: Record<string, { x: number; z: number; y: number; status: string }>;
  /** The last service camera framing (src/world/scene/ServiceDirector.tsx). */
  __egoServiceView?: unknown;
}
