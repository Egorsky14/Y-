import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getGameState } from '@/app/store';
import { HQ_LOT, hqParkingStalls } from '@/game/world/cityLayout';
import { useGame } from '@/app/store';
import { PALETTE } from '../assets/palette';
import { asphaltTexture, gravelTexture, signTexture, wordmarkTexture } from '../assets/textures';
import { Box, Window } from './parts';
import { Selectable } from '../interactions/Selectable';

/**
 * EGO HVAC headquarters. Base facility: office, one service bay, small lot. Each purchased
 * upgrade adds real geometry so growth is visible in the world.
 */
export function Headquarters() {
  const upgrades = useGame((s) => s.company.hqUpgrades);
  const vehicleCount = useGame((s) => Object.keys(s.vehicles).length);
  const asphalt = useMemo(() => {
    const t = asphaltTexture().clone();
    t.repeat.set(6, 5);
    t.needsUpdate = true;
    return t;
  }, []);
  const gravel = useMemo(() => {
    const t = gravelTexture().clone();
    t.repeat.set(14, 10);
    t.needsUpdate = true;
    return t;
  }, []);
  const wordmark = useMemo(() => wordmarkTexture('light'), []);
  const wordmarkDark = useMemo(() => wordmarkTexture('dark'), []);
  const sign = useMemo(() => signTexture('EGO HVAC', PALETTE.egoTeal), []);
  const has = (id: string) => upgrades.includes(id as (typeof upgrades)[number]);
  const stallCount = 2 + (has('expanded-garage') ? 2 : 0) + (has('additional-parking') ? 4 : 0);
  const stalls = hqParkingStalls(Math.max(stallCount, vehicleCount));
  const cx = HQ_LOT.center.x;
  const cz = HQ_LOT.center.z;

  return (
    <group position={[cx, 0, cz]}>
      {/* Lot surface: decorative gravel with asphalt work areas */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[HQ_LOT.width - 1, HQ_LOT.depth - 1]} />
        <meshStandardMaterial map={gravel} color="#d2bb92" roughness={1} />
      </mesh>
      {/* Concrete pad in front of the service bay and the yard */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2, 0.025, 10]} receiveShadow>
        <planeGeometry args={[12, 32]} />
        <meshStandardMaterial color="#d9d5cc" roughness={1} />
      </mesh>
      {/* Light poles */}
      {[[-46, -32], [-10, -32], [-46, 4], [-10, 4]].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <Box size={[0.25, 7, 0.25]} position={[0, 3.5, 0]} color="#8d949b" metalness={0.6} roughness={0.4} />
          <Box size={[1.6, 0.25, 0.5]} position={[0.7, 7, 0]} color="#8d949b" metalness={0.6} roughness={0.4} />
          <Box size={[0.9, 0.12, 0.4]} position={[1.1, 6.86, 0]} color="#fff6d8" emissive="#fff6d8" emissiveIntensity={0.5} castShadow={false} />
        </group>
      ))}
      {/* Equipment pallets and dumpster by the bay */}
      {[[8, 30], [12, 30]].map(([x, z]) => (
        <group key={`p${x}`} position={[x, 0, z]}>
          <Box size={[2.2, 0.25, 2.2]} position={[0, 0.12, 0]} color="#b08a5a" />
          <Box size={[1.7, 1.5, 1.7]} position={[0, 1.0, 0]} color="#dfe2e5" roughness={0.6} metalness={0.2} />
        </group>
      ))}
      <group position={[-50, 0, 36]}>
        <Box size={[4, 1.6, 2]} position={[0, 0.8, 0]} color="#3d5a3a" roughness={0.8} />
        <Box size={[4.1, 0.15, 2.1]} position={[0, 1.65, 0]} color="#2d452b" />
      </group>
      {/* Desert landscaping islands */}
      {[[-30, -40], [-16, -40], [-44, -40], [-2, -40], [-56, 20], [-56, 30], [52, 36], [40, 36], [-30, 40], [-18, 40]].map(([x, z], i) => (
        <group key={`l${i}`} position={[x, 0, z]}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <sphereGeometry args={[0.9 + (i % 3) * 0.2, 8, 6]} />
            <meshStandardMaterial color={i % 2 ? '#7fa070' : '#9aa66b'} roughness={1} flatShading />
          </mesh>
          {i % 3 === 0 && (
            <mesh position={[1.4, 0.3, 0.6]} castShadow>
              <dodecahedronGeometry args={[0.55, 0]} />
              <meshStandardMaterial color="#a89272" roughness={1} flatShading />
            </mesh>
          )}
        </group>
      ))}
      {/* Parking area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-26, 0.03, -16]} receiveShadow>
        <planeGeometry args={[54, has('additional-parking') ? 60 : 44]} />
        <meshStandardMaterial map={asphalt} roughness={0.95} />
      </mesh>
      {/* Driveway apron */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-58, 0.03, 0]} receiveShadow>
        <planeGeometry args={[14, 10]} />
        <meshStandardMaterial map={asphalt} roughness={0.95} />
      </mesh>
      {/* Parking stripes */}
      {stalls.map((s, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[s.pos.x - cx, 0.05, s.pos.z - cz - 3.9]}>
          <planeGeometry args={[9, 0.3]} />
          <meshBasicMaterial color="#f1f1f1" />
        </mesh>
      ))}

      <Selectable selection={{ kind: 'lot', id: 'hq' }} ringRadius={24} ringOffset={[30, 0.08, -16]}>
        {/* Office building */}
        <group position={[30, 0, -24]}>
          <Box size={[46, 7, 28]} position={[0, 3.5, 0]} color="#1f2328" roughness={0.7} />
          <Box size={[46.4, 0.5, 28.4]} position={[0, 7.1, 0]} color="#0f1216" />
          {/* Teal band and white face */}
          <Box size={[46.2, 0.5, 28.2]} position={[0, 4.6, 0]} color={PALETTE.egoTeal} emissive={PALETTE.egoTeal} emissiveIntensity={0.35} />
          <Box size={[20, 7.2, 1]} position={[-13, 3.6, -14.3]} color="#f3f3f1" />
          {/* Entrance */}
          <Box size={[3.4, 3.2, 0.3]} position={[-13, 1.6, -14.85]} color={PALETTE.glass} roughness={0.2} metalness={0.5} />
          <Box size={[6, 0.3, 4]} position={[-13, 3.5, -16.8]} color="#0f1216" />
          {/* Windows along the west face (toward the parking lot) */}
          {[-9, -3, 3, 9].map((z) => (
            <Window key={z} position={[-23.02, 2.2, z]} rotation={[0, -Math.PI / 2, 0]} size={[3.2, 1.8]} />
          ))}
          {[-18, -12, -6, 0, 6, 12, 18].map((x) => (
            <Window key={`f${x}`} position={[x, 2.2, -14.02]} size={[3.0, 1.8]} />
          ))}
          {/* Wordmark on the white face and on the street-facing west wall */}
          <mesh position={[-13, 6.0, -14.86]}>
            <planeGeometry args={[14, 3.5]} />
            <meshStandardMaterial map={wordmark} transparent roughness={0.6} />
          </mesh>
          <Box size={[0.4, 2.6, 16]} position={[-23.1, 6.2, 0]} color="#f3f3f1" castShadow={false} />
          <mesh position={[-23.32, 6.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[14, 3.5]} />
            <meshStandardMaterial map={wordmarkDark} transparent roughness={0.6} />
          </mesh>
          {/* Rooftop units */}
          {[-14, 0, 14].map((x) => (
            <Box key={x} size={[3, 1.4, 2.4]} position={[x, 8.0, 4]} color="#b9bec4" roughness={0.6} metalness={0.3} />
          ))}
          {has('dispatch-center') && (
            <group position={[16, 7.3, -8]}>
              <Box size={[0.3, 6, 0.3]} position={[0, 3, 0]} color="#c9ced3" metalness={0.6} roughness={0.4} />
              <mesh position={[0, 6.2, 0]} rotation={[-Math.PI / 4, 0, 0]} castShadow>
                <sphereGeometry args={[1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#e8eaec" roughness={0.5} metalness={0.4} />
              </mesh>
            </group>
          )}
        </group>

        {/* Service bay */}
        <group position={[30, 0, 10]}>
          <Box size={[46, 6.2, 30]} position={[0, 3.1, 0]} color="#2b3036" roughness={0.75} />
          <Box size={[46.4, 0.4, 30.4]} position={[0, 6.3, 0]} color="#171a1e" />
          <Box size={[46.2, 0.4, 30.2]} position={[0, 4.4, 0]} color={PALETTE.egoTeal} emissive={PALETTE.egoTeal} emissiveIntensity={0.3} />
          {/* Roll-up door facing the parking lot; rolls up while trucks leave or return */}
          <BayDoor position={[-23.1, 0, -6]} />
          <mesh position={[-23.3, 5.3, -6]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[6, 0.9]} />
            <meshStandardMaterial map={signTexture('SERVICE BAY 1', '#ffffff', '#171a1e')} />
          </mesh>
          {has('expanded-garage') && (
            <>
              <BayDoor position={[-23.1, 0, 6]} />
              <mesh position={[-23.3, 5.3, 6]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[6, 0.9]} />
                <meshStandardMaterial map={signTexture('SERVICE BAY 2', '#ffffff', '#171a1e')} />
              </mesh>
            </>
          )}
          {has('fleet-maintenance') && (
            <group position={[0, 0, 19]}>
              <Box size={[30, 5.5, 8]} position={[0, 2.75, 0]} color="#3b4149" />
              <Box size={[30.4, 0.4, 8.4]} position={[0, 5.6, 0]} color="#171a1e" />
              <Box size={[8, 4.2, 0.3]} position={[-8, 2.1, -4.1]} color="#d9dbdd" castShadow={false} />
              <Box size={[8, 4.2, 0.3]} position={[8, 2.1, -4.1]} color="#d9dbdd" castShadow={false} />
            </group>
          )}
        </group>

        {/* Parts warehouse at the back */}
        {has('parts-warehouse') && (
          <group position={[30, 0, 36]}>
            <Box size={[46, 5, 12]} position={[0, 2.5, 0]} color="#8d949b" roughness={0.6} metalness={0.2} />
            <Box size={[46.4, 0.4, 12.4]} position={[0, 5.1, 0]} color="#5a6066" />
            <Box size={[0.3, 3.6, 5]} position={[-23.1, 1.8, 0]} color="#d9dbdd" castShadow={false} />
          </group>
        )}

        {/* Expanded garage: second detached bay in the back yard */}
        {has('expanded-garage') && (
          <group position={[-28, 0, 28]}>
            <Box size={[34, 5.8, 20]} position={[0, 2.9, 0]} color="#2b3036" roughness={0.75} />
            <Box size={[34.4, 0.4, 20.4]} position={[0, 5.9, 0]} color="#171a1e" />
            <Box size={[34.2, 0.4, 20.2]} position={[0, 4.2, 0]} color={PALETTE.egoTeal} emissive={PALETTE.egoTeal} emissiveIntensity={0.3} />
            <Box size={[7, 4.4, 0.3]} position={[-8, 2.2, -10.1]} color="#d9dbdd" castShadow={false} />
            <Box size={[7, 4.4, 0.3]} position={[8, 2.2, -10.1]} color="#d9dbdd" castShadow={false} />
          </group>
        )}

        {/* Staging area canopy with pallets */}
        {has('staging-area') && (
          <group position={[-30, 0, has('expanded-garage') ? 40 : 30]}>
            {[-10, 10].map((x) =>
              [-4, 4].map((z) => <Box key={`${x}${z}`} size={[0.3, 4.5, 0.3]} position={[x, 2.25, z]} color="#9aa3ab" metalness={0.5} roughness={0.4} />),
            )}
            <Box size={[24, 0.3, 11]} position={[0, 4.6, 0]} color={PALETTE.egoTeal} />
            {[-7, -2, 3, 8].map((x) => (
              <group key={x} position={[x, 0, 0]}>
                <Box size={[2.2, 0.3, 2.2]} position={[0, 0.15, 0]} color="#b08a5a" />
                <Box size={[1.8, 1.6, 1.8]} position={[0, 1.1, 0]} color="#e4e6e8" />
              </group>
            ))}
          </group>
        )}

        {/* Training room annex */}
        {has('training-room') && (
          <group position={[58, 0, -24]}>
            <Box size={[8, 5, 16]} position={[0, 2.5, 0]} color="#f3f3f1" />
            <Box size={[8.4, 0.4, 16.4]} position={[0, 5.1, 0]} color="#0f1216" />
            {[-5, 0, 5].map((z) => (
              <Window key={z} position={[4.02, 2.4, z]} rotation={[0, Math.PI / 2, 0]} size={[2.6, 1.6]} />
            ))}
          </group>
        )}

        {/* Sales office / showroom: glass pavilion by the entrance */}
        {has('sales-office') && (
          <group position={[-4, 0, -40]}>
            <Box size={[18, 4.6, 8]} position={[0, 2.3, 0]} color={PALETTE.glass} roughness={0.15} metalness={0.6} />
            <Box size={[18.6, 0.4, 8.6]} position={[0, 4.7, 0]} color="#0f1216" />
            <mesh position={[0, 3.6, -4.31]}>
              <planeGeometry args={[10, 1.2]} />
              <meshStandardMaterial map={signTexture('COMFORT SHOWROOM', PALETTE.egoTeal, '#0f1216')} />
            </mesh>
          </group>
        )}

        {/* Monument sign at the street */}
        <group position={[-52, 0, -8]}>
          <Box size={[1.2, 1.2, 6]} position={[0, 0.6, 0]} color="#3a3d42" />
          <mesh position={[-0.62, 2.9, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[6, 1.6]} />
            <meshStandardMaterial map={sign} emissive="#19d3c5" emissiveIntensity={0.08} />
          </mesh>
          <Box size={[0.3, 1.8, 6.2]} position={[0, 2.9, 0]} color="#0f1318" />
        </group>
        {/* Perimeter fence (front) */}
        {[-20, -10, 10, 20, 30, 40, 50].map((z) => (
          <Box key={z} size={[0.15, 1.8, 0.15]} position={[-57, 0.9, z]} color="#6c7278" castShadow={false} />
        ))}
        <Box size={[0.06, 0.06, 84]} position={[-57, 1.7, 8]} color="#6c7278" castShadow={false} />
        <Box size={[0.06, 0.06, 84]} position={[-57, 1.0, 8]} color="#6c7278" castShadow={false} />
        {/* Flagpole */}
        <group position={[-44, 0, -36]}>
          <Box size={[0.14, 9, 0.14]} position={[0, 4.5, 0]} color="#d7dadd" metalness={0.6} roughness={0.3} />
          <Box size={[2.4, 1.4, 0.05]} position={[1.25, 8.2, 0]} color={PALETTE.egoTeal} castShadow={false} />
        </group>
        {/* Invisible click volume */}
        <mesh position={[30, 4, -6]} visible={false}>
          <boxGeometry args={[52, 10, 66]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
      {/* Landscaping strip */}
      {[-50, -44, -38].map((x) => (
        <group key={x} position={[x, 0, 40]}>
          <mesh position={[0, 2.2, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.24, 4.4, 7]} />
            <meshStandardMaterial color={PALETTE.trunk} roughness={1} />
          </mesh>
          <mesh position={[0, 5, 0]} castShadow>
            <sphereGeometry args={[2.1, 9, 7]} />
            <meshStandardMaterial color={PALETTE.treeGreen} roughness={1} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Sectional bay door that rolls up when any vehicle is within the HQ lot and moving. */
function BayDoor({ position }: { position: [number, number, number] }) {
  const door = useRef<THREE.Group>(null);
  const open = useRef(0);
  useFrame((_, dt) => {
    const s = getGameState();
    if (!s || !door.current) return;
    const active = Object.values(s.vehicles).some((v) => {
      if (v.status !== 'enroute' && v.status !== 'returning') return false;
      const inLot = v.position.x > 4 && v.position.x < 70 && v.position.z > 8 && v.position.z < 92;
      return inLot;
    });
    const target = active ? 1 : 0;
    open.current += (target - open.current) * Math.min(1, dt * 1.8);
    door.current.position.y = open.current * 3.9;
    door.current.scale.y = 1 - open.current * 0.82;
  });
  return (
    <group position={position}>
      <group ref={door}>
        <Box size={[0.3, 4.6, 7]} position={[0, 2.3, 0]} color="#d9dbdd" castShadow={false} />
        {[-1.6, -0.6, 0.4, 1.4].map((y) => (
          <Box key={y} size={[0.1, 0.08, 6.8]} position={[-0.2, 2.3 + y, 0]} color="#9aa0a6" castShadow={false} />
        ))}
      </group>
      {/* Door header and dark bay interior visible when open */}
      <Box size={[0.4, 0.5, 7.4]} position={[0.1, 4.85, 0]} color="#171a1e" castShadow={false} />
      <Box size={[0.2, 4.6, 7]} position={[0.6, 2.3, 0]} color="#0c0e11" castShadow={false} />
    </group>
  );
}
