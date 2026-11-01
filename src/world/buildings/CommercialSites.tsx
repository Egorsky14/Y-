import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useGame } from '@/app/store';
import { COMMERCIAL_LOTS, lotById, type Lot } from '@/game/world/cityLayout';
import { equipmentPlacement, OFFICE, PLAZA_BUILDING, roofSpec } from '@/game/world/rooftops';
import { MeshBuilder, membranePbr, pbrMaterial } from '../assets/pbr';
import { signTexture } from '../assets/textures';
import { STATIC_MATERIALS, UV_SCALES } from './materials';
import { Selectable } from '../interactions/Selectable';
import { registerOccluders, tagOccluder } from '../scene/cameraOcclusion';

/**
 * Commercial customers east of Mesquite St (cityLayout COMMERCIAL_LOTS):
 *  - Mesquite Plaza: a single-storey retail strip (16 × 40 m, roof deck 4.0 m behind a 4.6 m parapet with metal
 *    coping), four storefront bays under a sign band, a front car park off its driveway, a side drive along the
 *    north wall where service vans park beside the roof access point, three packaged rooftop units;
 *  - Desert Ridge Offices: a two-storey office (26 × 40 m, parapet 8.6 m) with ribbon windows and two rooftop units.
 * Shells and paving are merged per material; the rooftop units are the Blender kit (tools/blender/rooftop_kit.py)
 * placed from the roof data (rooftops.ts), with a distant LOD. Solid parts register as camera occluders.
 */

export const ROOFTOP_KIT_URL = `${import.meta.env.BASE_URL}models/props/rooftop-kit.glb`;
useGLTF.preload(ROOFTOP_KIT_URL);

type Rect = { x0: number; x1: number; z0: number; z1: number; deckY: number; edgeY: number; parapet: number };

function materials(): Record<string, THREE.Material> {
  const S = STATIC_MATERIALS;
  return {
    asphalt: S.asphalt(), concrete: S.concrete(), curb: S.curb(), stripe: S.stripe(), darkMetal: S.darkMetal(), metal: S.metal(), galvanized: S.galvanized(),
    storefront: S.storefront(), glass: S.glass(), lamp: S.lamp(), block: S.block(), gravel: S.gravel(), dark: S.dark(), stain: S.stain(), stripeYellow: S.stripeYellow(),
    stucco: new THREE.MeshStandardMaterial({ color: '#d9cbb2', roughness: 0.92 }),
    stuccoDark: new THREE.MeshStandardMaterial({ color: '#8f7f69', roughness: 0.9 }),
    officeWall: new THREE.MeshStandardMaterial({ color: '#c8c3b8', roughness: 0.85 }),
    coping: new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: 0.5, metalness: 0.5 }),
    membrane: pbrMaterial(membranePbr(), { color: '#cfccc4', roughness: 0.93 }),
    awning: new THREE.MeshStandardMaterial({ color: '#2f6f6b', roughness: 0.7 }),
    planter: new THREE.MeshStandardMaterial({ color: '#7a6a55', roughness: 0.9 }),
  };
}

/** Shell, parapet, coping and roof membrane of a flat-roofed box; returns its solid parts for the camera. */
function shell(b: MeshBuilder, r: Rect, wall: string): THREE.Box3[] {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  // The body up to the roof deck, the membrane on it, and the four parapet walls above it with metal coping.
  const p = r.parapet;
  const ph = r.edgeY - r.deckY;
  b.box(wall, [w, r.deckY, d], [cx, r.deckY / 2, cz]);
  b.box('membrane', [w - p * 2 + 0.02, 0.06, d - p * 2 + 0.02], [cx, r.deckY + 0.03, cz]);
  b.box(wall, [w, ph, p], [cx, r.deckY + ph / 2, r.z0 + p / 2]);
  b.box(wall, [w, ph, p], [cx, r.deckY + ph / 2, r.z1 - p / 2]);
  b.box(wall, [p, ph, d - p * 2], [r.x0 + p / 2, r.deckY + ph / 2, cz]);
  b.box(wall, [p, ph, d - p * 2], [r.x1 - p / 2, r.deckY + ph / 2, cz]);
  b.box('coping', [w + 0.12, 0.08, p + 0.12], [cx, r.edgeY + 0.04, r.z0 + p / 2]);
  b.box('coping', [w + 0.12, 0.08, p + 0.12], [cx, r.edgeY + 0.04, r.z1 - p / 2]);
  b.box('coping', [p + 0.12, 0.08, d], [r.x0 + p / 2, r.edgeY + 0.04, cz]);
  b.box('coping', [p + 0.12, 0.08, d], [r.x1 - p / 2, r.edgeY + 0.04, cz]);
  // Inner parapet faces, so the deck reads as recessed below the parapet from above.
  b.box('stuccoDark', [w - r.parapet * 2, r.edgeY - r.deckY, 0.02], [cx, (r.edgeY + r.deckY) / 2, r.z0 + r.parapet]);
  b.box('stuccoDark', [w - r.parapet * 2, r.edgeY - r.deckY, 0.02], [cx, (r.edgeY + r.deckY) / 2, r.z1 - r.parapet]);
  b.box('stuccoDark', [0.02, r.edgeY - r.deckY, d - r.parapet * 2], [r.x0 + r.parapet, (r.edgeY + r.deckY) / 2, cz]);
  b.box('stuccoDark', [0.02, r.edgeY - r.deckY, d - r.parapet * 2], [r.x1 - r.parapet, (r.edgeY + r.deckY) / 2, cz]);
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => tagOccluder(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)), 'wall');
  // The body below the deck, and the four parapet walls (the deck is open sky for a camera above the roof).
  return [
    box(r.x0, 0, r.z0, r.x1, r.deckY, r.z1),
    box(r.x0, r.deckY, r.z0, r.x1, r.edgeY, r.z0 + r.parapet),
    box(r.x0, r.deckY, r.z1 - r.parapet, r.x1, r.edgeY, r.z1),
    box(r.x0, r.deckY, r.z0, r.x0 + r.parapet, r.edgeY, r.z1),
    box(r.x1 - r.parapet, r.deckY, r.z0, r.x1, r.edgeY, r.z1),
  ];
}

function buildPlaza(): { group: THREE.Group; occluders: THREE.Box3[] } {
  const b = new MeshBuilder(materials(), { ...UV_SCALES, membrane: 6, stucco: 0, stuccoDark: 0 });
  const r = PLAZA_BUILDING;
  // Paving: front car park and the side drive along the north wall, from the street to the back of the building.
  b.box('asphalt', [r.x0 - 136.5, 0.05, 62], [(136.5 + r.x0) / 2, 0.0, -50]);
  b.box('asphalt', [r.x1 - r.x0 + 6, 0.05, 10], [(r.x0 + r.x1) / 2 + 3, 0.0, -77]);
  b.box('concrete', [r.x1 - r.x0 + 0.6, 0.08, 2.6], [(r.x0 + r.x1) / 2, 0.02, r.z0 - 1.3]); // sidewalk apron at the north wall
  b.box('concrete', [3.0, 0.1, r.z1 - r.z0], [r.x0 - 1.5, 0.03, -50]); // storefront walk
  for (let z = -66; z <= -34; z += 3) b.box('stripe', [5.2, 0.012, 0.12], [154, 0.04, z]);
  for (const z of [-68, -32]) b.box('curb', [8, 0.15, 0.3], [154, 0.07, z]);
  // Driveway apron across the sidewalk.
  b.box('concrete', [7.2, 0.07, 8], [133.6, 0.02, -77]);
  // Shell and storefront.
  const occ = shell(b, r, 'stucco');
  b.box('stuccoDark', [r.x1 - r.x0 + 0.04, 0.5, r.z1 - r.z0 + 0.04], [(r.x0 + r.x1) / 2, 0.25, -50]); // base band
  for (let i = 0; i < 4; i++) {
    const zc = r.z0 + 5 + i * 10;
    b.box('storefront', [0.1, 2.9, 8.4], [r.x0 - 0.04, 1.75, zc]);
    for (let k = -2; k <= 2; k++) b.box('darkMetal', [0.14, 3.0, 0.08], [r.x0 - 0.06, 1.75, zc + k * 2.1]);
    b.box('darkMetal', [0.14, 0.08, 8.5], [r.x0 - 0.06, 3.22, zc]);
    b.box('awning', [1.4, 0.12, 8.6], [r.x0 - 0.7, 3.42, zc]);
  }
  b.box('dark', [0.2, 0.9, r.z1 - r.z0 - 1], [r.x0 - 0.1, 4.0, -50]); // sign band backing
  // Service and rear walls: steel doors, downspouts at the parapet scuppers, a roof-access placard by the ladder point.
  for (const z of [-60, -48, -36]) b.box('darkMetal', [0.08, 2.2, 1.0], [r.x1 + 0.04, 1.1, z]);
  for (const x of [r.x0 + 2, r.x1 - 2]) {
    b.box('galvanized', [0.12, r.edgeY - 0.3, 0.1], [x, (r.edgeY - 0.3) / 2, r.z0 - 0.06]);
    b.box('galvanized', [0.3, 0.2, 0.3], [x, r.edgeY - 0.35, r.z0 - 0.1]);
  }
  b.box('stripeYellow', [0.5, 0.35, 0.02], [171 + 1.0, 1.6, r.z0 - 0.02]);
  // Site lighting and planters.
  for (const [x, z] of [[146, -70], [146, -30], [158, -50]] as [number, number][]) {
    b.add('darkMetal', new THREE.CylinderGeometry(0.08, 0.1, 7, 8), [x, 3.5, z]);
    b.box('darkMetal', [1.2, 0.12, 0.3], [x + 0.5, 7, z]);
    b.box('lamp', [0.5, 0.06, 0.25], [x + 0.9, 6.92, z]);
  }
  for (const z of [-71, -29]) b.box('planter', [2.4, 0.5, 1.2], [r.x0 - 2, 0.25, z]);
  return { group: b.build('commercial:cm-plaza'), occluders: occ };
}

function buildOffice(): { group: THREE.Group; occluders: THREE.Box3[] } {
  const b = new MeshBuilder(materials(), { ...UV_SCALES, membrane: 6, stucco: 0, stuccoDark: 0 });
  const r = OFFICE;
  b.box('asphalt', [r.x0 - 136.5, 0.05, 56], [(136.5 + r.x0) / 2, 0.0, -150]);
  for (let z = -172; z <= -128; z += 3) b.box('stripe', [5.2, 0.012, 0.12], [150, 0.04, z]);
  b.box('concrete', [7.2, 0.07, 8], [133.6, 0.02, -150]);
  const occ = shell(b, r, 'officeWall');
  // Ribbon windows on both floors, all four faces; a glazed entry with a canopy on the west.
  for (const y of [2.0, 5.6]) {
    b.box('glass', [0.08, 1.6, r.z1 - r.z0 - 2], [r.x0 - 0.04, y, -150]);
    b.box('glass', [0.08, 1.6, r.z1 - r.z0 - 2], [r.x1 + 0.04, y, -150]);
    b.box('glass', [r.x1 - r.x0 - 2, 1.6, 0.08], [(r.x0 + r.x1) / 2, y, r.z0 - 0.04]);
    b.box('glass', [r.x1 - r.x0 - 2, 1.6, 0.08], [(r.x0 + r.x1) / 2, y, r.z1 + 0.04]);
    for (let z = r.z0 + 2; z <= r.z1 - 2; z += 2.4) b.box('darkMetal', [0.12, 1.7, 0.06], [r.x0 - 0.06, y, z]);
  }
  b.box('storefront', [0.1, 3.0, 6], [r.x0 - 0.05, 1.5, -150]);
  b.box('darkMetal', [2.4, 0.2, 7], [r.x0 - 1.2, 3.3, -150]);
  return { group: b.build('commercial:cm-office'), occluders: occ };
}

/** One packaged rooftop unit from the Blender kit, with its distant LOD. */
function RooftopUnits({ lotId }: { lotId: string }) {
  const { scene } = useGLTF(ROOFTOP_KIT_URL);
  const spec = roofSpec(lotId);
  const units = useMemo(() => {
    if (!spec) return [];
    return spec.units.map((u) => {
      const lod = new THREE.LOD();
      const near = scene.getObjectByName(u.kind === 'rtu' ? 'rtu' : 'rtu-res')!.clone(true);
      const far = scene.getObjectByName(u.kind === 'rtu' ? 'rtu-lod' : 'rtu-res')!.clone(true);
      for (const o of [near, far]) {
        o.position.set(0, 0, 0);
        o.traverse((m) => {
          if ((m as THREE.Mesh).isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
      }
      lod.addLevel(near, 0);
      lod.addLevel(far, u.kind === 'rtu' ? 70 : 9999);
      lod.position.set(u.center.x, spec.deckY + 0.06, u.center.z);
      // Model length along +x, service side toward -z: turn the length axis to the unit's heading.
      lod.rotation.y = u.yaw - Math.PI / 2;
      lod.name = `rooftop-unit:${lotId}:${u.id}`;
      return lod;
    });
  }, [scene, spec]);
  return (
    <>
      {units.map((u) => (
        <primitive key={u.name} object={u} />
      ))}
    </>
  );
}

function CommercialSite({ lot }: { lot: Lot }) {
  const built = useMemo(() => {
    const out = lot.id === 'cm-plaza' ? buildPlaza() : buildOffice();
    registerOccluders(lot.id, out.occluders);
    return out;
  }, [lot]);
  const sign = useMemo(() => (lot.id === 'cm-plaza' ? signTexture('MESQUITE PLAZA', '#19d3c5', '#1d2126', 36 / 0.9) : signTexture('DESERT RIDGE OFFICES', '#e9e6de', '#2a2f36', 18 / 1.2)), [lot.id]);
  const r = lot.id === 'cm-plaza' ? PLAZA_BUILDING : OFFICE;
  return (
    <group>
      <Selectable selection={{ kind: 'lot', id: lot.id }} bracket={[r.x1 - r.x0 + 4, r.z1 - r.z0 + 4]} ringOffset={[(r.x0 + r.x1) / 2, 0.09, (r.z0 + r.z1) / 2]}>
        <primitive object={built.group} />
        <mesh position={[(r.x0 + r.x1) / 2, r.edgeY / 2, (r.z0 + r.z1) / 2]} visible={false}>
          <boxGeometry args={[r.x1 - r.x0, r.edgeY, r.z1 - r.z0]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
      <mesh position={lot.id === 'cm-plaza' ? [r.x0 - 0.21, 4.0, -50] : [r.x0 - 0.05, 7.4, -150]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={lot.id === 'cm-plaza' ? [36, 0.9] : [18, 1.2]} />
        <meshStandardMaterial map={sign} emissive="#ffffff" emissiveMap={sign} emissiveIntensity={0.25} />
      </mesh>
      <Suspense fallback={null}>
        <RooftopUnits lotId={lot.id} />
      </Suspense>
    </group>
  );
}

export function CommercialSites() {
  return (
    <>
      {COMMERCIAL_LOTS.map((lot) => (
        <CommercialSite key={lot.id} lot={lot} />
      ))}
    </>
  );
}

/** Packaged units on the roofs of homes whose system is a rooftop unit (rooftops.ts equipmentPlacement). */
export function ResidentialRooftopUnits() {
  const lots = useGame((s) =>
    Object.values(s.customers)
      .filter((c) => equipmentPlacement(c) === 'roof' && lotById(c.lotId)?.kind === 'house')
      .map((c) => c.lotId)
      .sort()
      .join('|'),
  );
  if (!lots) return null;
  return (
    <Suspense fallback={null}>
      {lots.split('|').map((id) => (
        <RooftopUnits key={id} lotId={id} />
      ))}
    </Suspense>
  );
}
