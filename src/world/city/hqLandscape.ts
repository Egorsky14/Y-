import { makeDecoRng } from '../assets/random';
import type { Species } from './propertyPlan';

/**
 * Environment Revolution planting at the headquarters, in HQ-local metres (lot centre at the
 * origin, street to the west): understorey in the long parking island between the date palms, a
 * groundcover pair at the entry island, and a screen of desert trees along the east strip. Kept
 * out of the fleet stalls and the vehicle routes (nothing solid in x < -26, -32 < z < 2).
 */
export function hqLandscapePlants(): { species: Species; x: number; z: number; scale: number }[] {
  const rnd = makeDecoRng(5150);
  const out: { species: Species; x: number; z: number; scale: number }[] = [];
  for (let z = -31; z <= -5; z += 2.6) {
    if (Math.abs(z + 26) < 1.6 || Math.abs(z + 12) < 1.6) continue; // date palms
    out.push({ species: rnd() < 0.4 ? 'agave' : rnd() < 0.6 ? 'shrub-sage' : 'desert-grass', x: -25.5 + (rnd() - 0.5) * 0.6, z, scale: 0.85 });
  }
  out.push({ species: 'groundcover', x: -15.2, z: -6.2, scale: 0.9 }, { species: 'groundcover', x: -12.8, z: -3.8, scale: 0.9 });
  // Tree island in the east half of the lot (HeadquartersBuilder: 14 x 5 m at (-14, -12.5)): shade trees and understorey.
  for (const x of [-18.5, -14, -9.5]) out.push({ species: x === -14 ? 'palo-verde' : 'mesquite', x, z: -12.5, scale: 1.05 + rnd() * 0.15 });
  for (const x of [-16.3, -11.7]) out.push({ species: rnd() < 0.5 ? 'desert-grass' : 'shrub-sage', x, z: -12.0, scale: 0.85 });
  for (const z of [-37, -30, -23, -2, 6, 14, 22, 29]) {
    out.push({ species: rnd() < 0.5 ? 'palo-verde' : 'mesquite', x: 53.5 + (rnd() - 0.5) * 1.5, z, scale: 1.0 + rnd() * 0.2 });
    out.push({ species: rnd() < 0.5 ? 'desert-grass' : 'shrub-sage', x: 51.5, z: z + 2.5, scale: 0.9 });
    out.push({ species: 'agave', x: 55.5, z: z - 2.2, scale: 0.9 });
  }
  return out;
}
