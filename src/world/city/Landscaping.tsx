import { useMemo } from 'react';
import * as THREE from 'three';
import { STREETS, ROAD_WIDTH, SIDEWALK_WIDTH, WORLD_HALF } from '@/game/world/cityLayout';
import { PALETTE } from '../assets/palette';

/** Instanced street trees and shrubs along the avenues; purely decorative. */
export function Landscaping() {
  const { trunks, canopies, shrubs } = useMemo(() => {
    const trunks: THREE.Matrix4[] = [];
    const canopies: THREE.Matrix4[] = [];
    const shrubs: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    let s = 31;
    const rnd = () => {
      s = (s * 1103515245 + 12345) >>> 0;
      return (s >>> 8) / 16777216;
    };
    // Trees along the north-south avenues (houses sit on east-west streets).
    for (const st of STREETS.filter((x) => x.axis === 'z')) {
      for (let along = -WORLD_HALF + 20; along < WORLD_HALF - 10; along += 26) {
        for (const side of [-1, 1]) {
          const x = st.at + side * (ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 2.5);
          const z = along + (rnd() - 0.5) * 6;
          // Skip the HQ driveway and warehouse/competitor frontage.
          if (st.id === 'av-c' && side === 1 && z > 35 && z < 65) continue;
          const h = 3 + rnd() * 1.5;
          m.makeTranslation(x, h / 2, z);
          m.multiply(new THREE.Matrix4().makeScale(1, h / 4, 1));
          trunks.push(m.clone());
          const r = 1.7 + rnd() * 0.9;
          const cm = new THREE.Matrix4().makeTranslation(x, h + r * 0.5, z);
          cm.multiply(new THREE.Matrix4().makeScale(r, r, r));
          canopies.push(cm);
        }
      }
    }
    // Scattered desert shrubs in the open desert beyond the blocks.
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 230 + rnd() * 260;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const r = 0.6 + rnd() * 1.1;
      const sm = new THREE.Matrix4().makeTranslation(x, r * 0.6, z);
      sm.multiply(new THREE.Matrix4().makeScale(r, r * 0.8, r));
      shrubs.push(sm);
    }
    return { trunks, canopies, shrubs };
  }, []);

  return (
    <group>
      <Instanced matrices={trunks} color={PALETTE.trunk}>
        <cylinderGeometry args={[0.18, 0.26, 4, 7]} />
      </Instanced>
      <Instanced matrices={canopies} color={PALETTE.paloVerde} flat>
        <sphereGeometry args={[1, 9, 7]} />
      </Instanced>
      <Instanced matrices={shrubs} color="#9aa66b" flat castShadow={false}>
        <sphereGeometry args={[1, 7, 5]} />
      </Instanced>
    </group>
  );
}

function Instanced({ matrices, color, children, flat, castShadow = true }: { matrices: THREE.Matrix4[]; color: string; children: React.ReactNode; flat?: boolean; castShadow?: boolean }) {
  const ref = useMemo(() => {
    return (mesh: THREE.InstancedMesh | null) => {
      if (!mesh) return;
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
    };
  }, [matrices]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, matrices.length]} castShadow={castShadow} receiveShadow frustumCulled={false}>
      {children}
      <meshStandardMaterial color={color} roughness={1} flatShading={flat} />
    </instancedMesh>
  );
}
