import { useMemo } from 'react';
import * as THREE from 'three';
import type { VehicleClass, VehicleUpgradeId, PaintId } from '@/game/fleet/vehicleCatalog';
import { PALETTE, VEHICLE_PAINT } from '../assets/palette';
import { wordmarkTexture } from '../assets/textures';

export interface VehicleModelProps {
  classId: VehicleClass;
  paint: PaintId;
  upgrades: VehicleUpgradeId[];
  /** Wheel spin / motion state for animation handled by parent via ref. */
  wheelsRef?: React.MutableRefObject<THREE.Group[]>;
}

/**
 * Procedural vehicle models. Each class has a distinct silhouette: compact van, full-size
 * van, pickup, and box truck. Local +z is the nose. Dimensions in meters.
 */
export function VehicleModel({ classId, paint, upgrades, wheelsRef }: VehicleModelProps) {
  const body = VEHICLE_PAINT[paint] ?? PALETTE.egoBlack;
  const wrapped = upgrades.includes('full-wrap');
  const decals = upgrades.includes('basic-decals');
  const wordmark = useMemo(() => wordmarkTexture(body === '#15181d' || body === '#4a4f57' ? 'light' : 'dark'), [body]);
  const dims = DIMS[classId];
  const registerWheel = (g: THREE.Group | null) => {
    if (g && wheelsRef && !wheelsRef.current.includes(g)) wheelsRef.current.push(g);
  };

  return (
    <group>
      {classId === 'pickup' ? <PickupBody body={body} dims={dims} /> : classId === 'box-truck' ? <BoxTruckBody body={body} dims={dims} /> : <VanBody body={body} dims={dims} />}

      {/* Branding */}
      {(wrapped || decals) && (
        <>
          {[1, -1].map((side) => (
            <mesh key={side} position={[side * (dims.w / 2 + 0.01), dims.brandY, dims.brandZ]} rotation={[0, side * Math.PI / 2, 0]}>
              <planeGeometry args={[wrapped ? dims.brandW : dims.brandW * 0.5, wrapped ? dims.brandW / 4 : dims.brandW / 8]} />
              <meshStandardMaterial map={wordmark} transparent roughness={0.5} polygonOffset polygonOffsetFactor={-1} />
            </mesh>
          ))}
          {wrapped && (
            <>
              {[1, -1].map((side) => (
                <mesh key={`stripe${side}`} position={[side * (dims.w / 2 + 0.005), dims.brandY - dims.brandW / 8 - 0.12, dims.brandZ]} rotation={[0, side * Math.PI / 2, 0]}>
                  <planeGeometry args={[dims.l * 0.92, 0.14]} />
                  <meshStandardMaterial color={PALETTE.egoTeal} emissive={PALETTE.egoTeal} emissiveIntensity={0.4} polygonOffset polygonOffsetFactor={-1} />
                </mesh>
              ))}
              {/* Rear door wordmark */}
              <mesh position={[0, dims.brandY, -dims.l / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[dims.w * 0.8, dims.w * 0.2]} />
                <meshStandardMaterial map={wordmark} transparent roughness={0.5} polygonOffset polygonOffsetFactor={-1} />
              </mesh>
            </>
          )}
        </>
      )}

      {/* Ladder rack */}
      {upgrades.includes('ladder-rack') && classId !== 'pickup' && (
        <group position={[0, dims.h + 0.18, dims.rackZ]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (dims.w / 2 - 0.1), 0, 0]} castShadow>
              <boxGeometry args={[0.06, 0.06, dims.rackL]} />
              <meshStandardMaterial color="#c9ced3" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          {[-1, 0, 1].map((s) => (
            <mesh key={`x${s}`} position={[0, 0, s * (dims.rackL / 2 - 0.2)]} castShadow>
              <boxGeometry args={[dims.w - 0.1, 0.06, 0.06]} />
              <meshStandardMaterial color="#c9ced3" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          {/* Ladder */}
          <mesh position={[0.3, 0.1, 0]} castShadow>
            <boxGeometry args={[0.45, 0.08, dims.rackL - 0.4]} />
            <meshStandardMaterial color="#d8dde2" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      )}

      {/* Wheels */}
      {dims.wheels.map(([x, z], i) => (
        <group key={i} position={[x, dims.wheelR, z]} ref={registerWheel}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[dims.wheelR, dims.wheelR, 0.28, 18]} />
            <meshStandardMaterial color="#1d1f22" roughness={0.95} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[x > 0 ? 0.01 : -0.01, 0, 0]}>
            <cylinderGeometry args={[dims.wheelR * 0.55, dims.wheelR * 0.55, 0.3, 12]} />
            <meshStandardMaterial color="#aeb4ba" metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

interface Dims {
  w: number;
  l: number;
  h: number;
  wheelR: number;
  wheels: [number, number][];
  brandY: number;
  brandZ: number;
  brandW: number;
  rackZ: number;
  rackL: number;
}

const DIMS: Record<VehicleClass, Dims> = {
  'compact-van': { w: 1.9, l: 4.7, h: 1.95, wheelR: 0.34, wheels: [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]], brandY: 1.2, brandZ: -0.5, brandW: 2.6, rackZ: -0.4, rackL: 3.0 },
  'full-size-van': { w: 2.05, l: 5.7, h: 2.5, wheelR: 0.38, wheels: [[-1.02, 1.8], [1.02, 1.8], [-1.02, -1.7], [1.02, -1.7]], brandY: 1.55, brandZ: -0.7, brandW: 3.2, rackZ: -0.6, rackL: 3.6 },
  pickup: { w: 2.05, l: 5.6, h: 1.85, wheelR: 0.4, wheels: [[-1.02, 1.75], [1.02, 1.75], [-1.02, -1.65], [1.02, -1.65]], brandY: 0.95, brandZ: 1.0, brandW: 1.6, rackZ: 0, rackL: 0 },
  'box-truck': { w: 2.4, l: 7.2, h: 3.4, wheelR: 0.45, wheels: [[-1.15, 2.4], [1.15, 2.4], [-1.15, -1.9], [1.15, -1.9], [-1.15, -2.7], [1.15, -2.7]], brandY: 2.0, brandZ: -1.0, brandW: 4.0, rackZ: -1, rackL: 4 },
};

function Glass({ size, position, rotation }: { size: [number, number]; position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshStandardMaterial color="#6f9bc0" roughness={0.1} metalness={0.5} emissive="#1c2e40" emissiveIntensity={0.3} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Lights({ w, z, h, rear }: { w: number; z: number; h: number; rear?: boolean }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.3), h, z]}>
          <boxGeometry args={[0.36, 0.18, 0.08]} />
          <meshStandardMaterial color={rear ? '#d92d2d' : '#f6f7e6'} emissive={rear ? '#d92d2d' : '#f6f7e6'} emissiveIntensity={0.7} />
        </mesh>
      ))}
    </>
  );
}

function VanBody({ body, dims }: { body: string; dims: Dims }) {
  const { w, l, h } = dims;
  const cabinL = l * 0.32;
  return (
    <group>
      {/* Cargo body */}
      <mesh position={[0, dims.wheelR + 0.1 + (h - dims.wheelR - 0.1) / 2, -cabinL / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, h - dims.wheelR - 0.1, l - cabinL]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.25} />
      </mesh>
      {/* Cabin: lower hood + raked windshield block */}
      <mesh position={[0, dims.wheelR + 0.1 + 0.45, l / 2 - cabinL / 2]} castShadow>
        <boxGeometry args={[w * 0.98, 0.9, cabinL]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.25} />
      </mesh>
      <mesh position={[0, dims.wheelR + 0.1 + 0.9 + (h - dims.wheelR - 1.0) / 2 - 0.05, l / 2 - cabinL / 2 - cabinL * 0.18]} rotation={[0, 0, 0]} castShadow>
        <boxGeometry args={[w * 0.96, h - dims.wheelR - 1.0, cabinL * 0.64]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.25} />
      </mesh>
      {/* Windshield */}
      <Glass size={[w * 0.86, h - dims.wheelR - 1.15]} position={[0, dims.wheelR + 0.1 + 0.95 + (h - dims.wheelR - 1.15) / 2, l / 2 - cabinL / 2 + cabinL * 0.14 + 0.01]} rotation={[-0.32, 0, 0]} />
      {/* Side door windows */}
      {[-1, 1].map((s) => (
        <Glass key={s} size={[cabinL * 0.5, (h - dims.wheelR - 1.2) * 0.8]} position={[s * (w / 2 + 0.005), dims.wheelR + 1.0 + (h - dims.wheelR - 1.2) * 0.45, l / 2 - cabinL * 0.75]} rotation={[0, s * Math.PI / 2, 0]} />
      ))}
      {/* Roof cap, bumpers, grille, lights, mirrors */}
      <mesh position={[0, h + 0.02, -(cabinL / 2) + 0.1]}>
        <boxGeometry args={[w * 0.9, 0.06, l - cabinL - 0.2]} />
        <meshStandardMaterial color={body} roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, dims.wheelR + 0.05, l / 2 + 0.04]}>
        <boxGeometry args={[w, 0.3, 0.14]} />
        <meshStandardMaterial color="#2a2d31" roughness={0.9} />
      </mesh>
      <mesh position={[0, dims.wheelR + 0.05, -l / 2 - 0.04]}>
        <boxGeometry args={[w, 0.3, 0.14]} />
        <meshStandardMaterial color="#2a2d31" roughness={0.9} />
      </mesh>
      <mesh position={[0, dims.wheelR + 0.55, l / 2 + 0.01]}>
        <boxGeometry args={[w * 0.5, 0.28, 0.06]} />
        <meshStandardMaterial color="#1a1c1f" roughness={0.6} metalness={0.5} />
      </mesh>
      <Lights w={w} z={l / 2 + 0.03} h={dims.wheelR + 0.6} />
      <Lights w={w} z={-l / 2 - 0.03} h={dims.wheelR + 0.95} rear />
      {[-1, 1].map((s) => (
        <mesh key={`m${s}`} position={[s * (w / 2 + 0.12), dims.wheelR + 1.25, l / 2 - cabinL * 0.55]}>
          <boxGeometry args={[0.16, 0.22, 0.1]} />
          <meshStandardMaterial color="#1d1f22" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function PickupBody({ body, dims }: { body: string; dims: Dims }) {
  const { w, l, h } = dims;
  const bedL = l * 0.42;
  const base = dims.wheelR + 0.15;
  return (
    <group>
      {/* Frame + lower body */}
      <mesh position={[0, base + 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.8, l]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.25} />
      </mesh>
      {/* Hood */}
      <mesh position={[0, base + 0.95, l / 2 - l * 0.16]} castShadow>
        <boxGeometry args={[w * 0.98, 0.3, l * 0.32]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.25} />
      </mesh>
      {/* Cab */}
      <mesh position={[0, base + 0.8 + (h - base - 0.8) / 2, l / 2 - l * 0.32 - l * 0.13]} castShadow>
        <boxGeometry args={[w * 0.96, h - base - 0.8, l * 0.26]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.25} />
      </mesh>
      <Glass size={[w * 0.84, (h - base - 0.9) * 0.9]} position={[0, base + 0.85 + (h - base - 0.9) / 2, l / 2 - l * 0.32 + 0.02]} rotation={[-0.4, 0, 0]} />
      {[-1, 1].map((s) => (
        <Glass key={s} size={[l * 0.22, (h - base - 0.9) * 0.75]} position={[s * (w / 2 + 0.005), base + 0.9 + (h - base - 0.9) * 0.45, l / 2 - l * 0.45]} rotation={[0, s * Math.PI / 2, 0]} />
      ))}
      {/* Bed walls */}
      {[-1, 1].map((s) => (
        <mesh key={`bw${s}`} position={[s * (w / 2 - 0.06), base + 0.8 + 0.25, -l / 2 + bedL / 2]} castShadow>
          <boxGeometry args={[0.12, 0.5, bedL]} />
          <meshStandardMaterial color={body} roughness={0.35} metalness={0.25} />
        </mesh>
      ))}
      <mesh position={[0, base + 0.8 + 0.25, -l / 2 + 0.06]} castShadow>
        <boxGeometry args={[w, 0.5, 0.12]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.25} />
      </mesh>
      {/* Crossbed toolbox (teal accent) */}
      <mesh position={[0, base + 0.8 + 0.35, -l / 2 + bedL - 0.35]} castShadow>
        <boxGeometry args={[w * 0.96, 0.5, 0.6]} />
        <meshStandardMaterial color="#c9ced3" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, base + 0.8 + 0.61, -l / 2 + bedL - 0.35]}>
        <boxGeometry args={[w * 0.9, 0.04, 0.5]} />
        <meshStandardMaterial color={PALETTE.egoTeal} emissive={PALETTE.egoTeal} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, base + 0.4, l / 2 + 0.01]}>
        <boxGeometry args={[w * 0.6, 0.4, 0.06]} />
        <meshStandardMaterial color="#1a1c1f" roughness={0.6} metalness={0.5} />
      </mesh>
      <Lights w={w} z={l / 2 + 0.03} h={base + 0.5} />
      <Lights w={w} z={-l / 2 - 0.03} h={base + 0.8} rear />
    </group>
  );
}

function BoxTruckBody({ body, dims }: { body: string; dims: Dims }) {
  const { w, l, h } = dims;
  const cabL = l * 0.28;
  const base = dims.wheelR + 0.2;
  return (
    <group>
      {/* Chassis */}
      <mesh position={[0, base + 0.2, 0]} castShadow>
        <boxGeometry args={[w * 0.9, 0.4, l]} />
        <meshStandardMaterial color="#2a2d31" roughness={0.9} />
      </mesh>
      {/* Cargo box (white with teal) */}
      <mesh position={[0, base + 0.4 + (h - base - 0.4) / 2, -(cabL / 2) - 0.1]} castShadow receiveShadow>
        <boxGeometry args={[w, h - base - 0.4, l - cabL - 0.2]} />
        <meshStandardMaterial color={body} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* Cab */}
      <mesh position={[0, base + 0.75, l / 2 - cabL / 2]} castShadow>
        <boxGeometry args={[w * 0.95, 1.5, cabL]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.25} />
      </mesh>
      <mesh position={[0, base + 1.5 + 0.6, l / 2 - cabL / 2 - cabL * 0.15]} castShadow>
        <boxGeometry args={[w * 0.92, 1.2, cabL * 0.7]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.25} />
      </mesh>
      <Glass size={[w * 0.8, 1.0]} position={[0, base + 2.1, l / 2 - cabL / 2 + cabL * 0.2 + 0.02]} rotation={[-0.25, 0, 0]} />
      {[-1, 1].map((s) => (
        <Glass key={s} size={[cabL * 0.5, 0.9]} position={[s * (w / 2 * 0.95 + 0.005), base + 2.05, l / 2 - cabL * 0.6]} rotation={[0, s * Math.PI / 2, 0]} />
      ))}
      {/* Roll-up rear door + liftgate */}
      <mesh position={[0, base + 0.4 + (h - base - 0.4) / 2, -l / 2 - 0.01]}>
        <boxGeometry args={[w * 0.92, h - base - 0.6, 0.06]} />
        <meshStandardMaterial color="#d9dbdd" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, base + 0.15, -l / 2 - 0.5]} castShadow>
        <boxGeometry args={[w * 0.9, 0.12, 0.9]} />
        <meshStandardMaterial color="#5a6066" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, base + 0.5, l / 2 + 0.01]}>
        <boxGeometry args={[w * 0.6, 0.5, 0.06]} />
        <meshStandardMaterial color="#1a1c1f" roughness={0.6} metalness={0.5} />
      </mesh>
      <Lights w={w * 0.95} z={l / 2 + 0.03} h={base + 0.7} />
      <Lights w={w} z={-l / 2 - 0.03} h={base + 1.0} rear />
    </group>
  );
}
