/* Test-only typing of the debug hook exposed by src/app/store.ts. */
interface EgoTestHook {
  getState: () => Record<string, never> | null;
  dispatch: (action: unknown) => { ok: boolean; reason?: string };
  advanceMinutes: (minutes: number) => void;
  spawnLead: (opts: { channel?: 'warranty' | 'direct'; preferredLotId?: string; faultId?: string }) => string | null;
  app: { getState: () => { camera: (cmd: { type: 'focus' | 'reset' | 'hq' | 'follow'; target?: { x: number; z: number }; vehicleId?: string; distance?: number }) => void } };
}
interface Window {
  __ego?: EgoTestHook;
}
interface Window {
  __egoRender?: { calls: number; triangles: number; geometries: number; textures: number; frame: number; houses: number; vehicleModels: number; workers: number; instanced: number };
  __egoVehicles?: Record<string, { x: number; z: number; heading: number; wheelSpin: number; steer: number; roll: number; pitch: number }>;
}
