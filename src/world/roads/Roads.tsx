import { useMemo } from 'react';
import { STREETS, ROAD_WIDTH, SIDEWALK_WIDTH, ALL_LOTS, LOT_SETBACK, inwardDir } from '@/game/world/cityLayout';
import { roadStripTexture, concreteTexture } from '../assets/textures';
import { PALETTE } from '../assets/palette';

export function Roads() {
  const strip = useMemo(() => roadStripTexture(), []);
  const concrete = useMemo(() => concreteTexture(), []);
  return (
    <group>
      {STREETS.map((s) => {
        const length = s.to - s.from;
        const center = (s.from + s.to) / 2;
        const tex = strip.clone();
        tex.needsUpdate = true;
        tex.repeat.set(1, length / 24);
        const isX = s.axis === 'x';
        return (
          <group key={s.id}>
            <mesh rotation={[-Math.PI / 2, 0, isX ? Math.PI / 2 : 0]} position={isX ? [center, 0.02, s.at] : [s.at, 0.02, center]} receiveShadow>
              <planeGeometry args={[ROAD_WIDTH, length]} />
              <meshStandardMaterial map={tex} roughness={0.95} />
            </mesh>
            {/* Sidewalks on both sides */}
            {[-1, 1].map((side) => {
              const off = side * (ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2);
              const ctex = concrete.clone();
              ctex.needsUpdate = true;
              ctex.repeat.set(1, length / 3);
              return (
                <mesh key={side} rotation={[-Math.PI / 2, 0, isX ? Math.PI / 2 : 0]} position={isX ? [center, 0.04, s.at + off] : [s.at + off, 0.04, center]} receiveShadow>
                  <planeGeometry args={[SIDEWALK_WIDTH, length]} />
                  <meshStandardMaterial map={ctex} color={PALETTE.concrete} roughness={1} />
                </mesh>
              );
            })}
            {/* Curbs */}
            {[-1, 1].map((side) => {
              const off = side * (ROAD_WIDTH / 2 + 0.15);
              return (
                <mesh key={`curb${side}`} position={isX ? [center, 0.08, s.at + off] : [s.at + off, 0.08, center]} receiveShadow>
                  <boxGeometry args={isX ? [length, 0.16, 0.3] : [0.3, 0.16, length]} />
                  <meshStandardMaterial color={PALETTE.curb} roughness={1} />
                </mesh>
              );
            })}
          </group>
        );
      })}
      {/* Intersection patches hide seams */}
      {STREETS.filter((s) => s.axis === 'x').map((sx) =>
        STREETS.filter((s) => s.axis === 'z').map((sz) => (
          <mesh key={`${sx.id}-${sz.id}`} rotation={[-Math.PI / 2, 0, 0]} position={[sz.at, 0.03, sx.at]} receiveShadow>
            <planeGeometry args={[ROAD_WIDTH + SIDEWALK_WIDTH * 2 + 0.6, ROAD_WIDTH + SIDEWALK_WIDTH * 2 + 0.6]} />
            <meshStandardMaterial color={PALETTE.asphalt} roughness={0.95} />
          </mesh>
        )),
      )}
      {/* Driveways from curb to lot */}
      {ALL_LOTS.filter((l) => l.kind === 'house').map((lot) => {
        const dir = inwardDir(lot.facing);
        const len = LOT_SETBACK + 8;
        const horizontal = lot.facing === 'north' || lot.facing === 'south';
        // The garage sits on the house's local -x side, which mirrors with the facing direction.
        const sideSign = lot.facing === 'north' || lot.facing === 'west' ? -1 : 1;
        const cx = lot.curb.x + dir.x * (ROAD_WIDTH / 2 + len / 2) + (horizontal ? sideSign * 5.5 : 0);
        const cz = lot.curb.z + dir.z * (ROAD_WIDTH / 2 + len / 2) + (horizontal ? 0 : sideSign * 5.5);
        return (
          <group key={`dw-${lot.id}`}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.05, cz]} receiveShadow>
              <planeGeometry args={horizontal ? [5.5, len] : [len, 5.5]} />
              <meshStandardMaterial map={concrete} color="#e4e0d8" roughness={1} />
            </mesh>
            {/* Walkway to the door */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[lot.curb.x + dir.x * (ROAD_WIDTH / 2 + len / 2) + (horizontal ? -sideSign * 3 : 0), 0.05, lot.curb.z + dir.z * (ROAD_WIDTH / 2 + len / 2) + (horizontal ? 0 : -sideSign * 3)]} receiveShadow>
              <planeGeometry args={horizontal ? [1.4, len] : [len, 1.4]} />
              <meshStandardMaterial color="#ddd8ce" roughness={1} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
