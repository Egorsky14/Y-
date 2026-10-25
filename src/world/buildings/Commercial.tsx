import { useMemo } from 'react';
import { COMPETITOR_LOT, PARK_LOT, WAREHOUSE_LOT } from '@/game/world/cityLayout';
import { PALETTE } from '../assets/palette';
import { asphaltTexture, signTexture } from '../assets/textures';
import { Box, Window } from './parts';
import { Selectable } from '../interactions/Selectable';

export function SupplyWarehouse() {
  const asphalt = useMemo(() => asphaltTexture(), []);
  const lot = WAREHOUSE_LOT;
  return (
    <group position={[lot.center.x, 0, lot.center.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[lot.width - 2, lot.depth - 2]} />
        <meshStandardMaterial map={asphalt} roughness={0.95} />
      </mesh>
      <Selectable selection={{ kind: 'lot', id: lot.id }} ringRadius={30} ringOffset={[0, 0.08, -4]}>
        <group position={[0, 0, -8]}>
          <Box size={[80, 10, 44]} position={[0, 5, 0]} color="#c9ccd0" roughness={0.6} metalness={0.15} />
          <Box size={[80.6, 0.6, 44.6]} position={[0, 10.3, 0]} color="#6f757c" />
          <Box size={[80.2, 1.2, 44.2]} position={[0, 2.0, 0]} color="#8d7f6b" />
          {/* Loading docks facing the street (south, +z) */}
          {[-24, -12, 0, 12, 24].map((x) => (
            <group key={x} position={[x, 0, 22.2]}>
              <Box size={[6, 4.2, 0.3]} position={[0, 2.6, 0]} color="#3a3f45" castShadow={false} />
              <Box size={[7, 0.3, 4]} position={[0, 4.9, 1.6]} color="#5a6066" />
              <Box size={[6.4, 1.1, 1.2]} position={[0, 0.55, 0.9]} color="#2a2d31" />
            </group>
          ))}
          <mesh position={[0, 8.2, 22.4]}>
            <planeGeometry args={[30, 3.2]} />
            <meshStandardMaterial map={signTexture('MOJAVE HVAC SUPPLY', '#e0862e', '#2a2d31')} />
          </mesh>
          {/* Office corner */}
          <Box size={[14, 5, 10]} position={[-33, 2.5, 27]} color="#f0eee8" />
          <Window position={[-33, 2.4, 32.02]} size={[6, 2]} />
          <Window position={[-29, 2.4, 32.02]} size={[1.4, 2]} />
        </group>
        {/* Pallets and condensers in the yard */}
        {[-30, -22, -14].map((x) => (
          <group key={x} position={[x, 0, 30]}>
            <Box size={[3, 0.25, 3]} position={[0, 0.12, 0]} color="#b08a5a" />
            <Box size={[2.4, 2.2, 2.4]} position={[0, 1.35, 0]} color="#d6d9dc" roughness={0.6} metalness={0.2} />
          </group>
        ))}
        <mesh position={[0, 4, -8]} visible={false}>
          <boxGeometry args={[80, 10, 48]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
    </group>
  );
}

export function CompetitorBuilding() {
  const asphalt = useMemo(() => asphaltTexture(), []);
  const lot = COMPETITOR_LOT;
  return (
    <group position={[lot.center.x, 0, lot.center.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[lot.width - 2, lot.depth - 2]} />
        <meshStandardMaterial map={asphalt} roughness={0.95} />
      </mesh>
      <Selectable selection={{ kind: 'lot', id: lot.id }} ringRadius={28} ringOffset={[0, 0.08, 6]}>
        <group position={[0, 0, 8]}>
          <Box size={[60, 7, 36]} position={[0, 3.5, 0]} color="#eef1f4" roughness={0.6} />
          <Box size={[60.6, 0.6, 36.6]} position={[0, 7.3, 0]} color="#2e6fd8" />
          <Box size={[60.2, 0.5, 36.2]} position={[0, 4.4, 0]} color="#2e6fd8" />
          {[-22, -14, -6, 2, 10, 18].map((x) => (
            <Window key={x} position={[x, 2.3, -18.02]} size={[3.2, 2]} />
          ))}
          <Box size={[4, 3.4, 0.3]} position={[24, 1.7, -18.1]} color={PALETTE.glass} roughness={0.2} metalness={0.5} />
          <mesh position={[0, 6.0, -18.2]}>
            <planeGeometry args={[28, 2.8]} />
            <meshStandardMaterial map={signTexture('DESERT CHILL AIR', '#9cc8ff', '#1d4fa3')} />
          </mesh>
          {/* Their fleet: blue vans parked out front */}
          {[-18, -10, -2, 6].map((x) => (
            <group key={x} position={[x, 0, -26]}>
              <Box size={[2.1, 1.5, 5.2]} position={[0, 1.15, 0]} color="#2e6fd8" />
              <Box size={[2.0, 0.9, 1.6]} position={[0, 0.9, -3.2]} color="#2e6fd8" />
              {[-1.6, 1.6].map((z) =>
                [-1.1, 1.1].map((xx) => (
                  <mesh key={`${z}${xx}`} position={[xx, 0.42, z]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.42, 0.42, 0.3, 14]} />
                    <meshStandardMaterial color="#1d1f22" roughness={0.9} />
                  </mesh>
                )),
              )}
            </group>
          ))}
        </group>
        <mesh position={[0, 4, 8]} visible={false}>
          <boxGeometry args={[62, 10, 40]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
    </group>
  );
}

export function Park() {
  const lot = PARK_LOT;
  const trees = useMemo(() => {
    const out: [number, number, number][] = [];
    let s = 17;
    const rnd = () => {
      s = (s * 1103515245 + 12345) >>> 0;
      return (s >>> 8) / 16777216;
    };
    for (let i = 0; i < 14; i++) out.push([(rnd() - 0.5) * (lot.width - 10), (rnd() - 0.5) * (lot.depth - 10), 1.6 + rnd() * 1.2]);
    return out;
  }, [lot.depth, lot.width]);
  return (
    <group position={[lot.center.x, 0, lot.center.z]}>
      {trees.map(([x, z, r], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 1.8, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.25, 3.6, 7]} />
            <meshStandardMaterial color={PALETTE.trunk} roughness={1} />
          </mesh>
          <mesh position={[0, 4.2, 0]} castShadow>
            <sphereGeometry args={[r, 9, 7]} />
            <meshStandardMaterial color={i % 2 ? PALETTE.treeGreen : PALETTE.treeDark} roughness={1} flatShading />
          </mesh>
        </group>
      ))}
      {/* Shade ramada */}
      <group position={[0, 0, 0]}>
        {[-3, 3].map((x) => [-3, 3].map((z) => <Box key={`${x}${z}`} size={[0.3, 3.2, 0.3]} position={[x, 1.6, z]} color="#7a5a3c" />))}
        <Box size={[8, 0.3, 8]} position={[0, 3.3, 0]} color={PALETTE.roofTerracotta} />
        <Box size={[3, 0.5, 1]} position={[0, 0.6, 0]} color="#8a6a48" />
      </group>
    </group>
  );
}
