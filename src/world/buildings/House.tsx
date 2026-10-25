import { useMemo } from 'react';
import type * as THREE from 'three';
import { condenserPosition, type Lot } from '@/game/world/cityLayout';
import { PALETTE } from '../assets/palette';
import { Box, Condenser, GableRoof, HipRoof, Window } from './parts';
import { stuccoTexture } from '../assets/textures';
import { Selectable } from '../interactions/Selectable';
import { useApp } from '@/app/store';
import { makeDecoRng } from '../assets/random';

const FACING_ROTATION: Record<Lot['facing'], number> = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

const WALL_COLORS = [PALETTE.stuccoCream, PALETTE.stuccoSand, PALETTE.stuccoWhite, PALETTE.stuccoPeach, PALETTE.stuccoGray, PALETTE.stuccoSage];

function hashLot(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function House({ lot, hasActiveJob }: { lot: Lot; hasActiveJob: boolean }) {
  const h = hashLot(lot.id);
  const wall = WALL_COLORS[h % WALL_COLORS.length];
  const stucco = useMemo(() => stuccoTexture(), []);
  const condenser = condenserPosition(lot);
  const customerId = `cust-${lot.id}`;
  const isSelected = useApp((s) => s.selection?.kind === 'lot' && s.selection.id === lot.id);

  return (
    <group position={[lot.center.x, 0, lot.center.z]}>
      <Selectable selection={{ kind: 'lot', id: lot.id }} ringRadius={11} ringOffset={[0, 0.08, 0]}>
        <group rotation={[0, FACING_ROTATION[lot.facing], 0]}>
          {lot.style === 'ranch' && <Ranch wall={wall} stucco={stucco} seed={h} />}
          {lot.style === 'two-story' && <TwoStory wall={wall} stucco={stucco} seed={h} />}
          {lot.style === 'spanish' && <Spanish wall={wall} stucco={stucco} seed={h} />}
          {lot.style === 'modern' && <Modern wall={wall} stucco={stucco} seed={h} />}
          {lot.style === 'premium' && <Premium wall={wall} stucco={stucco} seed={h} />}
          <Yard seed={h} style={lot.style ?? 'ranch'} />
          {/* Invisible click volume so the whole lot is easy to select */}
          <mesh position={[0, 2, 0]} visible={false}>
            <boxGeometry args={[lot.width - 2, 6, lot.depth - 4]} />
            <meshBasicMaterial />
          </mesh>
        </group>
      </Selectable>
      <group position={[condenser.x - lot.center.x, 0, condenser.z - lot.center.z]}>
        <Condenser position={[0, 0, 0]} running={!hasActiveJob} />
        {(hasActiveJob || isSelected) && (
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.0, 1.25, 32]} />
            <meshBasicMaterial color={hasActiveJob ? '#ffb347' : PALETTE.egoTeal} transparent opacity={0.85} />
          </mesh>
        )}
      </group>
      <group name={`customer:${customerId}`} />
    </group>
  );
}

interface StyleProps {
  wall: string;
  stucco: THREE.Texture;
  seed: number;
}

// Local space: front of the house faces -z. Garage on -x, entry on +x side of the front.

function Ranch({ wall, stucco, seed }: StyleProps) {
  const roof = seed % 2 === 0 ? PALETTE.roofBrown : PALETTE.roofSlate;
  return (
    <group>
      <Box size={[16, 3.4, 11]} position={[0, 1.7, 0]} color={wall} map={stucco} />
      <HipRoof width={16} depth={11} height={2.6} y={3.4} color={roof} />
      {/* Garage */}
      <Box size={[5.2, 2.5, 0.12]} position={[-5.0, 1.25, -5.52]} color={PALETTE.garage} castShadow={false} />
      <Window position={[1.5, 1.8, -5.52]} />
      <Window position={[5.2, 1.8, -5.52]} />
      <Box size={[1.1, 2.2, 0.12]} position={[3.4, 1.1, -5.52]} color={PALETTE.doorWood} castShadow={false} />
      {/* Porch */}
      <Box size={[4, 0.15, 1.6]} position={[3.4, 0.08, -6.3]} color={PALETTE.concrete} castShadow={false} />
      <Box size={[0.18, 2.6, 0.18]} position={[1.9, 1.3, -6.9]} color={PALETTE.trim} />
      <Box size={[0.18, 2.6, 0.18]} position={[4.9, 1.3, -6.9]} color={PALETTE.trim} />
      <Box size={[4.2, 0.12, 1.9]} position={[3.4, 2.7, -6.4]} color={roof} />
      <Window position={[8.01, 1.8, 0]} rotation={[0, Math.PI / 2, 0]} />
      <Window position={[-8.01, 1.8, 2]} rotation={[0, -Math.PI / 2, 0]} />
    </group>
  );
}

function TwoStory({ wall, stucco, seed }: StyleProps) {
  const roof = seed % 3 === 0 ? PALETTE.roofCharcoal : PALETTE.roofSlate;
  return (
    <group>
      <Box size={[14, 6.4, 11]} position={[0, 3.2, 0]} color={wall} map={stucco} />
      <GableRoof width={14} depth={11} height={2.8} y={6.4} color={roof} />
      {/* Garage wing */}
      <Box size={[6, 3.2, 7]} position={[-9.5, 1.6, -1.5]} color={wall} map={stucco} />
      <group position={[-9.5, 0, -1.5]}>
        <HipRoof width={6} depth={7} height={1.8} y={3.2} color={roof} />
      </group>
      <Box size={[4.6, 2.4, 0.12]} position={[-9.5, 1.2, -5.02]} color={PALETTE.garage} castShadow={false} />
      {/* Windows */}
      <Window position={[-3.5, 1.7, -5.52]} />
      <Window position={[-3.5, 4.6, -5.52]} />
      <Window position={[0, 4.6, -5.52]} />
      <Window position={[3.5, 4.6, -5.52]} />
      <Window position={[3.5, 1.7, -5.52]} size={[1.6, 1.3]} />
      <Box size={[1.1, 2.2, 0.12]} position={[0, 1.1, -5.52]} color={PALETTE.doorTeal} castShadow={false} />
      {/* Entry canopy */}
      <Box size={[3, 0.12, 1.8]} position={[0, 2.5, -6.3]} color={roof} />
      <Box size={[0.16, 2.5, 0.16]} position={[-1.3, 1.25, -7.0]} color={PALETTE.trim} />
      <Box size={[0.16, 2.5, 0.16]} position={[1.3, 1.25, -7.0]} color={PALETTE.trim} />
      <Window position={[7.01, 4.6, 0]} rotation={[0, Math.PI / 2, 0]} />
      <Window position={[7.01, 1.7, 2.5]} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}

function Spanish({ wall, stucco }: StyleProps) {
  const roof = PALETTE.roofTerracotta;
  return (
    <group>
      <Box size={[17, 3.6, 12]} position={[0, 1.8, 0]} color={wall} map={stucco} />
      <HipRoof width={17} depth={12} height={2.0} y={3.6} color={roof} />
      {/* Tower element */}
      <Box size={[4.5, 5.6, 4.5]} position={[3.5, 2.8, -4.5]} color={wall} map={stucco} />
      <group position={[3.5, 0, -4.5]}>
        <HipRoof width={4.5} depth={4.5} height={1.5} y={5.6} color={roof} />
      </group>
      {/* Arched entry (cylinder cutout look) */}
      <mesh position={[3.5, 1.2, -6.8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.0, 1.0, 0.3, 24, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#5b3a26" roughness={0.9} />
      </mesh>
      <Box size={[1.2, 2.2, 0.14]} position={[3.5, 1.1, -6.77]} color={PALETTE.doorWood} castShadow={false} />
      <Box size={[5.2, 2.5, 0.12]} position={[-5.4, 1.25, -6.02]} color="#e8dcc6" castShadow={false} />
      <Window position={[-0.5, 1.9, -6.02]} />
      <Window position={[8.51, 1.9, 1]} rotation={[0, Math.PI / 2, 0]} />
      <Window position={[-8.51, 1.9, 2]} rotation={[0, -Math.PI / 2, 0]} />
      <Window position={[3.5, 4.3, -6.77]} size={[0.9, 1.3]} />
    </group>
  );
}

function Modern({ seed }: StyleProps) {
  const dark = '#3b3f45';
  const light = seed % 2 === 0 ? '#f3f1ea' : '#e6e1d5';
  return (
    <group>
      <Box size={[10, 3.4, 11]} position={[-3, 1.7, 0]} color={light} />
      <Box size={[7, 6.6, 9]} position={[4.5, 3.3, 0.5]} color={dark} />
      {/* Cantilevered upper volume */}
      <Box size={[9, 3.0, 6]} position={[-2.5, 5.0, -1.5]} color={light} />
      <Box size={[10.4, 0.3, 11.4]} position={[-3, 3.55, 0]} color="#2a2d31" />
      <Box size={[7.4, 0.3, 9.4]} position={[4.5, 6.75, 0.5]} color="#2a2d31" />
      <Box size={[9.4, 0.3, 6.4]} position={[-2.5, 6.65, -1.5]} color="#2a2d31" />
      {/* Big glass */}
      <Window position={[4.5, 2.0, -4.02]} size={[4.2, 2.6]} />
      <Window position={[4.5, 5.2, -4.02]} size={[4.2, 1.6]} />
      <Window position={[-2.5, 5.0, -4.52]} size={[6, 1.6]} />
      <Box size={[4.8, 2.5, 0.12]} position={[-5.0, 1.25, -5.52]} color="#4a4e54" castShadow={false} />
      <Box size={[1.1, 2.3, 0.12]} position={[0.8, 1.15, -5.52]} color={PALETTE.egoTeal} castShadow={false} />
      <Window position={[8.01, 2.0, 2]} rotation={[0, Math.PI / 2, 0]} size={[3, 2.2]} />
    </group>
  );
}

function Premium({ wall, stucco }: StyleProps) {
  const roof = PALETTE.roofSlate;
  return (
    <group>
      <Box size={[19, 6.6, 13]} position={[0, 3.3, 0.5]} color={wall} map={stucco} />
      <group position={[0, 0, 0.5]}>
        <HipRoof width={19} depth={13} height={2.4} y={6.6} color={roof} />
      </group>
      {/* Three-car garage wing */}
      <Box size={[8, 3.4, 8]} position={[-11, 1.7, -1]} color={wall} map={stucco} />
      <group position={[-11, 0, -1]}>
        <HipRoof width={8} depth={8} height={2.0} y={3.4} color={roof} />
      </group>
      <Box size={[3.0, 2.5, 0.12]} position={[-13, 1.25, -5.02]} color={PALETTE.garage} castShadow={false} />
      <Box size={[3.0, 2.5, 0.12]} position={[-9.2, 1.25, -5.02]} color={PALETTE.garage} castShadow={false} />
      {/* Grand entry */}
      <Box size={[5, 6.9, 2.2]} position={[1, 3.45, -6.5]} color={wall} map={stucco} />
      <group position={[1, 0, -6.5]}>
        <GableRoof width={5} depth={2.2} height={1.4} y={6.9} color={roof} overhang={0.4} />
      </group>
      <Box size={[1.6, 2.6, 0.14]} position={[1, 1.3, -7.62]} color={PALETTE.doorWood} castShadow={false} />
      <Window position={[1, 5.0, -7.62]} size={[1.6, 1.8]} />
      {[-5, -1.8, 4.5, 7.5].map((x) => (
        <Window key={x} position={[x, 1.9, -6.02]} size={[1.5, 1.5]} />
      ))}
      {[-5, -1.8, 4.5, 7.5].map((x) => (
        <Window key={`u${x}`} position={[x, 5.0, -6.02]} size={[1.5, 1.4]} />
      ))}
      <Window position={[9.51, 2.0, 1]} rotation={[0, Math.PI / 2, 0]} size={[2.2, 1.6]} />
      {/* Pool in the backyard */}
      <mesh position={[0, 0.05, 11]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 3.5]} />
        <meshStandardMaterial color={PALETTE.pool} roughness={0.2} metalness={0.1} emissive="#2a8db5" emissiveIntensity={0.25} />
      </mesh>
      <Box size={[8.2, 0.12, 4.7]} position={[0, 0.02, 11]} color="#e9e4d8" castShadow={false} />
    </group>
  );
}

/** Desert landscaping per lot: shrubs, a tree and a rock. Decorative only. */
function Yard({ seed, style }: { seed: number; style: string }) {
  const items = useMemo(() => {
    const rnd = makeDecoRng(seed);
    const out: { x: number; z: number; r: number; kind: 'shrub' | 'rock' | 'agave' }[] = [];
    const n = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const x = -11 + rnd() * 22;
      const z = -16 + rnd() * 5; // front yard band
      if (Math.abs(x + 5) < 3.3) continue; // keep the driveway clear
      out.push({ x, z, r: 0.5 + rnd() * 0.5, kind: rnd() < 0.3 ? 'rock' : rnd() < 0.5 ? 'agave' : 'shrub' });
    }
    return out;
  }, [seed]);
  return (
    <group>
      {items.map((it, i) =>
        it.kind === 'rock' ? (
          <mesh key={i} position={[it.x, it.r * 0.4, it.z]} castShadow>
            <dodecahedronGeometry args={[it.r * 0.8, 0]} />
            <meshStandardMaterial color={PALETTE.rock} roughness={1} flatShading />
          </mesh>
        ) : it.kind === 'agave' ? (
          <mesh key={i} position={[it.x, it.r * 0.6, it.z]} castShadow>
            <coneGeometry args={[it.r * 0.9, it.r * 1.4, 7]} />
            <meshStandardMaterial color="#7fa070" roughness={1} flatShading />
          </mesh>
        ) : (
          <mesh key={i} position={[it.x, it.r * 0.7, it.z]} castShadow>
            <sphereGeometry args={[it.r, 8, 6]} />
            <meshStandardMaterial color={seed % 2 ? PALETTE.treeGreen : PALETTE.paloVerde} roughness={1} flatShading />
          </mesh>
        ),
      )}
      {/* Front-yard tree */}
      <group position={[style === 'premium' ? 11 : 9.5, 0, -13]}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.28, 3.2, 7]} />
          <meshStandardMaterial color={PALETTE.trunk} roughness={1} />
        </mesh>
        <mesh position={[0, 4.0, 0]} castShadow>
          <sphereGeometry args={[2.0, 9, 7]} />
          <meshStandardMaterial color={seed % 3 === 0 ? PALETTE.treeDark : PALETTE.treeGreen} roughness={1} flatShading />
        </mesh>
      </group>
    </group>
  );
}
