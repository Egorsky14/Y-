import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { HQ_LOT } from '@/game/world/cityLayout';
import { getGameState, useGame } from '@/app/store';
import { signTexture, wordmarkTexture } from '../assets/textures';
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
  const wordmarkDark = useMemo(() => wordmarkTexture('dark'), []);
  const wordmarkLight = useMemo(() => wordmarkTexture('light'), []);
  const monument = useMemo(() => signTexture('EGO HVAC', '#19d3c5', '#101418'), []);
  const has = (id: string) => upgrades.includes(id as (typeof upgrades)[number]);
  const cx = HQ_LOT.center.x;
  const cz = HQ_LOT.center.z;
  const ox0 = HQ.office.x - HQ.office.w / 2;
  const sx0 = HQ.bays.x - HQ.bays.w / 2;

  return (
    <group position={[cx, 0, cz]}>
      <Selectable selection={{ kind: 'lot', id: 'hq' }} ringRadius={26} ringOffset={[22, 0.08, -4]}>
        <primitive object={campus} />
        {/* Wordmark on the office sign band and on the street-facing north face */}
        <mesh position={[ox0 - 0.32, 5.9, HQ.office.z - 4]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[12.5, 3.1]} />
          <meshStandardMaterial map={wordmarkDark} transparent roughness={0.6} />
        </mesh>
        <mesh position={[HQ.office.x + 8, 5.9, HQ.office.z - HQ.office.d / 2 - 0.3]}>
          <planeGeometry args={[12, 3]} />
          <meshStandardMaterial map={wordmarkLight} transparent roughness={0.6} />
        </mesh>
        {/* Bay number plates */}
        {[HQ.bayDoorZ[0], ...(has('expanded-garage') ? [HQ.bayDoorZ[1]] : []), ...(has('fleet-maintenance') ? [HQ.bayDoorZ[2]] : [])].map((z, i) => (
          <mesh key={z} position={[sx0 - 0.32, 5.75, z]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[3.2, 0.6]} />
            <meshStandardMaterial map={signTexture(i === 2 ? 'FLEET BAY' : `SERVICE BAY ${i + 1}`, '#ffffff', '#171a1e')} />
          </mesh>
        ))}
        <BayDoor position={[sx0 - 0.05, 0, HQ.bayDoorZ[0]]} />
        {has('expanded-garage') && <BayDoor position={[sx0 - 0.05, 0, HQ.bayDoorZ[1]]} />}
        {has('fleet-maintenance') && <BayDoor position={[sx0 - 0.05, 0, HQ.bayDoorZ[2]]} />}
        {/* Monument sign panel, sized to a person */}
        <mesh position={[-50.37, 1.65, -12]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[3.8, 1.3]} />
          <meshStandardMaterial map={monument} emissive="#19d3c5" emissiveIntensity={0.05} />
        </mesh>
        <mesh position={[22, 4, -4]} visible={false}>
          <boxGeometry args={[60, 10, 70]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
    </group>
  );
}

/** Sectional overhead door that rolls up while any vehicle is moving inside the lot. */
function BayDoor({ position }: { position: [number, number, number] }) {
  const door = useRef<THREE.Group>(null);
  const open = useRef(0);
  const panels = useMemo(() => {
    const set = garageDoorPbr();
    return new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, color: '#d9dbdd', roughness: 0.55, metalness: 0.25 });
  }, []);
  useFrame((_, dt) => {
    const s = getGameState();
    if (!s || !door.current) return;
    const active = Object.values(s.vehicles).some((v) => {
      if (v.status !== 'enroute' && v.status !== 'returning') return false;
      return v.position.x > 4 && v.position.x < 70 && v.position.z > 8 && v.position.z < 92;
    });
    const target = active ? 1 : 0;
    open.current += (target - open.current) * Math.min(1, dt * 1.8);
    door.current.position.y = open.current * 3.9;
    door.current.scale.y = 1 - open.current * 0.82;
  });
  return (
    <group position={position}>
      <group ref={door}>
        <mesh position={[0, 2.3, 0]} material={panels} receiveShadow>
          <boxGeometry args={[0.16, 4.6, 7.2]} />
        </mesh>
        {[-1.15, 0, 1.15].map((y) => (
          <mesh key={y} position={[-0.1, 2.3 + y, 0]} material={STATIC_MATERIALS.darkMetal()}>
            <boxGeometry args={[0.04, 0.06, 7.1]} />
          </mesh>
        ))}
      </group>
      {/* Dark bay interior visible when the door is up */}
      <mesh position={[0.6, 2.3, 0]} material={STATIC_MATERIALS.dark()}>
        <boxGeometry args={[0.2, 4.6, 7.2]} />
      </mesh>
    </group>
  );
}
