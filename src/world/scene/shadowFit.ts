import * as THREE from 'three';

/**
 * Fits the sun's orthographic shadow camera to what the player is looking at instead of a fixed
 * square around the origin. Close views get a small, sharp shadow map and cull most casters from
 * the shadow pass; the overview keeps the full district.
 *
 * - The radius follows camera distance in 12 % steps, so zooming does not rescale the map every
 *   frame (which would make shadow edges crawl).
 * - The center sits a little beyond the orbit target, where most of an oblique view lies, and is
 *   snapped to whole shadow-map texels in light space so panning does not shimmer.
 */

export const SHADOW_MIN_RADIUS = 34;
const STEP = 1.12;

export function shadowRadiusFor(viewDistance: number, maxRadius: number): number {
  const wanted = THREE.MathUtils.clamp(viewDistance * 1.6, SHADOW_MIN_RADIUS, maxRadius);
  if (wanted >= maxRadius) return maxRadius;
  const steps = Math.ceil(Math.log(wanted / SHADOW_MIN_RADIUS) / Math.log(STEP));
  return Math.min(maxRadius, SHADOW_MIN_RADIUS * Math.pow(STEP, steps));
}

export interface ShadowFit {
  center: THREE.Vector3;
  radius: number;
}

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/** `sunDir` points from the ground toward the sun (unit length). */
export function fitSunShadow(target: THREE.Vector3, cameraPos: THREE.Vector3, sunDir: THREE.Vector3, maxRadius: number, mapSize: number): ShadowFit {
  const radius = shadowRadiusFor(cameraPos.distanceTo(target), maxRadius);
  // Push the box forward along the horizontal view direction: the half beyond the target fills
  // more of the screen than the half under the camera.
  _fwd.set(target.x - cameraPos.x, 0, target.z - cameraPos.z);
  const center = target.clone();
  center.y = 0;
  if (_fwd.lengthSq() > 1e-6 && radius < maxRadius) center.addScaledVector(_fwd.normalize(), radius * 0.3);
  // Light-space basis: the shadow camera looks along -sunDir.
  _right.crossVectors(Math.abs(sunDir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), sunDir).normalize();
  _up.crossVectors(sunDir, _right).normalize();
  const texel = (2 * radius) / mapSize;
  const u = center.dot(_right);
  const v = center.dot(_up);
  const w = center.dot(sunDir);
  const su = Math.round(u / texel) * texel;
  const sv = Math.round(v / texel) * texel;
  center.copy(_right).multiplyScalar(su).addScaledVector(_up, sv).addScaledVector(sunDir, w);
  return { center, radius };
}
