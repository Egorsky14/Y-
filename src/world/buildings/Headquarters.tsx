import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { HQ_LOT } from '@/game/world/cityLayout';
import { getGameState, useGame } from '@/app/store';
import { monumentTexture, signTexture, wordmarkTexture } from '../assets/textures';
import { Selectable } from '../interactions/Selectable';
import { buildHeadquarters, HQ } from './HeadquartersBuilder';
import { STATIC_MATERIALS } from './materials';
import { garageDoorPbr } from '../assets/pbr';

/**
 * Headquarters: merged static campus rebuilt when upgrades change, plus live parts
 * (animated bay doors) and textured signage.
 */
export function Headquarters() {
  const upgrades = useGame((s) => s.company.hqUpgrades);
  const key = upgrades.join(',');
  const campus = useMemo(() => buildHeadquarters(key ? (key.split(',') as typeof upgrades) : []), [key]);
  const wordmarkPlain = useMemo(() => wordmarkTexture('light', false), []);
  const wordmarkTag = useMemo(() => wordmarkTexture('light', true), []);
  const monument = useMemo(() => monumentTexture(), []);
  const signMaterial = useMemo(() => new THREE.MeshStandardMaterial({ map: wordmarkPlain, transparent: true, roughness: 0.4, emissive: '#ffffff', emissiveMap: wordmarkPlain, emissiveIntensity: 0.15 }), [wordmarkPlain]);
  const has = (id: string) => upgrades.includes(id as (typeof upgrades)[number]);
  const cx = HQ_LOT.center.x;
  const cz = HQ_LOT.center.z;
  const sx0 = HQ.bays.x - HQ.bays.w / 2;
  const t = HQ.tower;
  const tx = t.x - t.w / 2;
  const activeBays = [true, has('expanded-garage'), has('fleet-maintenance')];

  return (
    <group position={[cx, 0, cz]}>
      <Selectable selection={{ kind: 'lot', id: 'hq' }} ringRadius={26} ringOffset={[22, 0.08, -4]}>
        <primitive object={campus} />
        {/* Main sign on the entry tower (west face), raised letters on a thin backer */}
        <mesh position={[tx - 0.05, 7.6, t.z]} rotation={[0, -Math.PI / 2, 0]}>
          <boxGeometry args={[6.8, 1.9, 0.08]} />
          <meshStandardMaterial color="#0d1013" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[tx - 0.11, 7.6, t.z]} rotation={[0, -Math.PI / 2, 0]} material={signMaterial}>
          <planeGeometry args={[6.4, 1.6]} />
        </mesh>
        {/* Street-facing wordmark with tagline on the north elevation */}
        <mesh position={[HQ.office.x + 10, 6.0, HQ.office.z - HQ.office.d / 2 - 0.3]}>
          <boxGeometry args={[12.6, 3.2, 0.1]} />
          <meshStandardMaterial color="#1b1f24" roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[HQ.office.x + 10, 6.0, HQ.office.z - HQ.office.d / 2 - 0.37]}>
          <planeGeometry args={[12, 3]} />
          <meshStandardMaterial map={wordmarkTag} transparent roughness={0.5} emissive="#ffffff" emissiveMap={wordmarkTag} emissiveIntensity={0.12} />
        </mesh>
        {/* Bay number plates and doors */}
        {HQ.bayDoorZ.map((z, i) => (
          <group key={z}>
            <mesh position={[sx0 - 0.34, 5.85, z]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[3.0, 0.56]} />
              <meshStandardMaterial map={signTexture(i === 2 ? 'FLEET BAY' : `SERVICE BAY ${i + 1}`, '#ffffff', '#171a1e')} />
            </mesh>
            <BayDoor position={[sx0 + 0.2, 0, z]} active={activeBays[i]} />
          </group>
        ))}
        {/* Monument sign face toward the street */}
        <mesh position={[-54.82, 1.5, -16]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[4.0, 1.9]} />
          <meshStandardMaterial map={monument} emissive="#ffffff" emissiveMap={monument} emissiveIntensity={0.1} roughness={0.4} />
        </mesh>
        <mesh position={[22, 4, -4]} visible={false}>
          <boxGeometry args={[60, 10, 70]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
    </group>
  );
}

/** Sectional overhead door (four panels, window row) that rolls up the tracks while a vehicle moves inside the lot. */
function BayDoor({ position, active }: { position: [number, number, number]; active: boolean }) {
  const door = useRef<THREE.Group>(null);
  const open = useRef(0);
  const panels = useMemo(() => {
    const set = garageDoorPbr();
    return new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, color: '#d3d6d8', roughness: 0.5, metalness: 0.3 });
  }, []);
  const w = HQ.bayDoorW - 0.3;
  useFrame((_, dt) => {
    const s = getGameState();
    if (!s || !door.current) return;
    const moving = active && Object.values(s.vehicles).some((v) => {
      if (v.status !== 'enroute' && v.status !== 'returning') return false;
      return v.position.x > 4 && v.position.x < 70 && v.position.z > 8 && v.position.z < 92;
    });
    const target = moving ? 1 : 0;
    open.current += (target - open.current) * Math.min(1, dt * 1.6);
    // The curtain rises along the vertical track, then the remainder lies along the horizontal track.
    const k = open.current;
    door.current.position.y = k * 4.1;
    door.current.scale.y = 1 - k * 0.86;
  });
  return (
    <group position={position}>
      <group ref={door}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 0.65 + i * 1.22, 0]} material={panels} castShadow receiveShadow>
            <boxGeometry args={[0.12, 1.16, w]} />
          </mesh>
        ))}
        {/* Window row in the top panel */}
        {[-2.4, -0.8, 0.8, 2.4].map((z) => (
          <mesh key={z} position={[-0.07, 4.3, z]} material={STATIC_MATERIALS.glassDark()}>
            <boxGeometry args={[0.02, 0.5, 1.2]} />
          </mesh>
        ))}
        {[1.23, 2.45, 3.67].map((y) => (
          <mesh key={y} position={[-0.07, y, 0]} material={STATIC_MATERIALS.darkMetal()}>
            <boxGeometry args={[0.02, 0.05, w]} />
          </mesh>
        ))}
        <mesh position={[-0.08, 1.1, 0.9]} material={STATIC_MATERIALS.darkMetal()}>
          <boxGeometry args={[0.04, 0.12, 0.4]} />
        </mesh>
      </group>
    </group>
  );
}
