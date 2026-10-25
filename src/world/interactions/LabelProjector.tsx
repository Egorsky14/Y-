import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { labelAnchors } from './labels';

const world = new THREE.Vector3();
const ndc = new THREE.Vector3();

/** Projects registered label anchors to screen space each frame. Lives inside the Canvas. */
export function LabelProjector() {
  useFrame(({ camera, size }) => {
    for (const [, anchor] of labelAnchors()) {
      const el = anchor.el;
      if (!anchor.getPosition(world)) {
        el.style.display = 'none';
        continue;
      }
      ndc.copy(world).project(camera);
      if (ndc.z > 1 || ndc.x < -1.2 || ndc.x > 1.2 || ndc.y < -1.2 || ndc.y > 1.2) {
        el.style.display = 'none';
        continue;
      }
      const x = (ndc.x * 0.5 + 0.5) * size.width;
      const y = (1 - (ndc.y * 0.5 + 0.5)) * size.height;
      const dist = camera.position.distanceTo(world);
      const scale = THREE.MathUtils.clamp(anchor.referenceDistance / dist, 0.55, 1.15);
      el.style.display = '';
      el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    }
  });
  return null;
}
