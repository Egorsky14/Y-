import { Suspense, useMemo } from 'react';
import { COMPETITOR_LOT, PARK_LOT, WAREHOUSE_LOT } from '@/game/world/cityLayout';
import { PALETTE } from '../assets/palette';
import { asphaltTexture, signTexture } from '../assets/textures';
import { buildWarehouse } from './WarehouseBuilder';
import { Box, Window } from './parts';
import { Selectable } from '../interactions/Selectable';
import { SupplyDisplayPart } from '../props/SupplyProps';

export function SupplyWarehouse() {
  const lot = WAREHOUSE_LOT;
  const shell = useMemo(() => buildWarehouse(), []);
  return (
    <group position={[lot.center.x, 0, lot.center.z]}>
      <Selectable selection={{ kind: 'lot', id: lot.id }} ringRadius={30} ringOffset={[0, 0.08, -4]}>
        <primitive object={shell} />
        <group position={[0, 0, -8]}>
          <mesh position={[0, 8.2, 22.12]}>
            <planeGeometry args={[30, 3.2]} />
            <meshStandardMaterial map={signTexture('MOJAVE HVAC SUPPLY', '#e0862e', '#2a2d31', 30 / 3.2)} />
          </mesh>
          <ProStorefront />
        </group>
        <DepotForecourt />
        <mesh position={[0, 4, -8]} visible={false}>
          <boxGeometry args={[80, 10, 48]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
    </group>
  );
}

/**
 * Pro Supply Depot retail counter: a glass-fronted showroom on the warehouse's west end, with a
 * canopy, an illuminated sign and an entrance facing the street (building frame: front face z = 22).
 */
function ProStorefront() {
  const sign = useMemo(() => signTexture('PRO SUPPLY', '#19d3c5', '#14181d'), []);
  return (
    <group position={[-33, 0, 22]}>
      {/* Showroom block standing proud of the warehouse wall */}
      <Box size={[14, 6.2, 9]} position={[0, 3.1, 4.5]} color="#e9e7e1" roughness={0.7} />
      <Box size={[14.4, 0.5, 9.4]} position={[0, 6.35, 4.5]} color="#2a2f36" />
      {/* Curtain-wall glazing with mullions, and a glass door pair */}
      <Box size={[12.4, 4.2, 0.12]} position={[0, 2.5, 9.04]} color="#7fb6d6" roughness={0.08} metalness={0.6} castShadow={false} />
      {[-6, -3.1, 0, 3.1, 6].map((x) => (
        <Box key={x} size={[0.18, 4.4, 0.2]} position={[x, 2.5, 9.1]} color="#2a2f36" castShadow={false} />
      ))}
      <Box size={[12.6, 0.18, 0.2]} position={[0, 4.62, 9.1]} color="#2a2f36" castShadow={false} />
      <Box size={[2.6, 2.6, 0.14]} position={[1.55, 1.3, 9.16]} color="#1c2229" roughness={0.2} metalness={0.4} castShadow={false} />
      {/* Canopy over the entrance and the sign band above it */}
      <Box size={[14.8, 0.35, 3]} position={[0, 5.0, 10.4]} color="#2a2f36" />
      <Box size={[14.8, 0.08, 3]} position={[0, 4.8, 10.4]} color="#19d3c5" emissive="#19d3c5" emissiveIntensity={0.35} castShadow={false} />
      <mesh position={[0, 5.55, 9.12]}>
        <planeGeometry args={[11, 1.5]} />
        <meshStandardMaterial map={sign} emissive="#ffffff" emissiveMap={sign} emissiveIntensity={0.35} />
      </mesh>
      {[-6.6, 6.6].map((x) => (
        <Box key={x} size={[0.25, 4.8, 0.25]} position={[x, 2.4, 11.7]} color="#2a2f36" />
      ))}
    </group>
  );
}

/** Customer parking and an outdoor equipment display in front of the showroom (lot frame). */
function DepotForecourt() {
  return (
    <group>
      {/* Five customer stalls with painted lines and wheel stops */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Box key={i} size={[0.15, 0.02, 5.4]} position={[-50 + i * 3.4, 0.04, 34.5]} color="#f4f1e8" castShadow={false} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <Box key={i} size={[1.8, 0.14, 0.25]} position={[-48.3 + i * 3.4, 0.07, 32.3]} color="#c9c4b8" castShadow={false} />
      ))}
      {/* Display counter beside the entrance (0.9 m): pumps, a recovery machine and a tool case at
          true scale, nitrogen cylinders standing beside it */}
      <Box size={[3.0, 0.86, 1.1]} position={[-43.2, 0.43, 28.6]} color="#3a4048" />
      <Box size={[3.08, 0.05, 1.18]} position={[-43.2, 0.885, 28.6]} color="#19d3c5" castShadow={false} emissive="#19d3c5" emissiveIntensity={0.15} />
      <Suspense fallback={null}>
        <SupplyDisplayPart part="vacuum-pump" position={[-44.25, 0.91, 28.55]} rotation={0.35} />
        <SupplyDisplayPart part="recovery-machine" position={[-43.3, 0.91, 28.6]} rotation={0.05} />
        <SupplyDisplayPart part="tool-case" position={[-42.25, 0.91, 28.6]} rotation={-0.3} />
        <SupplyDisplayPart part="nitrogen-kit" position={[-41.15, 0, 28.3]} />
        <SupplyDisplayPart part="nitrogen-kit" position={[-40.85, 0, 28.75]} rotation={1.2} />
      </Suspense>
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
