export interface Vec2 {
  x: number;
  z: number;
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Heading in radians, 0 = +x, measured toward +z (Three.js XZ plane convention adjusted later). */
export function headingOf(a: Vec2, b: Vec2): number {
  return Math.atan2(b.z - a.z, b.x - a.x);
}
