/* Test-only typing of the debug hook exposed by src/app/store.ts. */
interface EgoTestHook {
  getState: () => Record<string, never> | null;
  dispatch: (action: unknown) => { ok: boolean; reason?: string };
  advanceMinutes: (minutes: number) => void;
  spawnLead: (opts: { channel?: 'warranty' | 'direct'; preferredLotId?: string; faultId?: string }) => string | null;
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
}
