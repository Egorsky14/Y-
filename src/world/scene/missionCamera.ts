import type { CameraCommand } from '@/app/store';
import { accessFor, roofSpec, servicedUnit } from '@/game/world/rooftops';

type Shot = Omit<CameraCommand, 'id'>;
type P2 = { x: number; z: number };

const VERTICAL_FOV = (38 * Math.PI) / 180;
const MAX_DISTANCE = 320;

/**
 * Mission 01's opening shots, both ordinary camera flights the player can interrupt at any time.
 * First Mesquite Plaza from over the access wall: the building, its rooftop units and where the ladder will go. Then a
 * wider view that also takes in the van waiting at headquarters, so the player sees the whole job at a glance.
 */
export function missionEstablishingShot(duration = 2.4): Shot {
  const spec = roofSpec('cm-plaza')!;
  const access = accessFor(spec)!;
  const { deck } = spec;
  return {
    type: 'focus',
    // Toward the access end of the building, far enough back for the whole roof, its units and the call's marker.
    target: { x: (deck.x0 + deck.x1) / 2, z: deck.z0 * 0.72 + deck.z1 * 0.28 },
    targetY: 4,
    distance: 78,
    azimuth: Math.atan2(access.out.x, access.out.z) + 0.72,
    elevation: 0.58,
    orbit: true,
    duration,
  };
}

/** Plaza and van in one view. Landscape looks across the line between them; upright phones look along it, so they stack on screen. */
export function missionFleetShot(van: P2, aspect: number, duration = 2.6): Shot {
  const spec = roofSpec('cm-plaza')!;
  const unit = servicedUnit(spec)!;
  const dx = van.x - unit.center.x;
  const dz = van.z - unit.center.z;
  const span = Math.hypot(dx, dz);
  const upright = aspect < 1;
  const elevation = upright ? 0.86 : 0.78;
  const tan = Math.tan(VERTICAL_FOV / 2);
  const needed = upright ? (span * Math.sin(elevation) * 0.72) / tan : (span * 0.72) / (tan * aspect);
  return {
    type: 'focus',
    target: { x: unit.center.x + dx / 2, z: unit.center.z + dz / 2 },
    targetY: 0,
    distance: Math.min(MAX_DISTANCE, Math.max(90, needed)),
    azimuth: upright ? Math.atan2(dx, dz) : Math.atan2(-dz, dx),
    elevation,
    orbit: true,
    duration,
  };
}
