import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { condenserPosition, curbParking, HOUSE_LOTS } from '@/game/world/cityLayout';
import { serviceSiteCamera } from '@/world/scene/serviceCall';

/**
 * "Show on map" and job notifications fly to serviceSiteCamera(lot). The job pin (a DOM label
 * anchored 12.5 m above the lot centre, see WorldLabels) is hidden once it projects outside
 * ±1.2 NDC (LabelProjector), so the framing must keep the pin on screen as well as the van spot
 * and the condenser, on a desktop screen and on a phone held upright.
 */

// Same placement as CameraRig's focus command and the same field of view rule.
function cameraFor(lot: (typeof HOUSE_LOTS)[number], width: number, height: number): THREE.PerspectiveCamera {
  const aspect = width / height;
  const fov = aspect >= 1 ? 38 : Math.min(75, THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(19)) * 1.6) / aspect)));
  const cmd = serviceSiteCamera(lot);
  const target = new THREE.Vector3(cmd.target.x, cmd.targetY, cmd.target.z);
  const dir = new THREE.Vector3(Math.sin(cmd.azimuth) * Math.cos(cmd.elevation), Math.sin(cmd.elevation), Math.cos(cmd.azimuth) * Math.cos(cmd.elevation));
  const cam = new THREE.PerspectiveCamera(fov, aspect, 1, 3000);
  cam.position.copy(target).add(dir.normalize().multiplyScalar(cmd.distance));
  cam.lookAt(target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

function ndc(cam: THREE.Camera, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).project(cam);
}

describe('service-site camera', () => {
  for (const [label, w, h] of [['desktop', 1920, 1080], ['phone portrait', 390, 844]] as const) {
    it(`keeps the job pin, the van spot and the condenser on screen (${label})`, () => {
      for (const lot of HOUSE_LOTS) {
        const cam = cameraFor(lot, w, h);
        const pin = ndc(cam, lot.center.x, 12.5, lot.center.z);
        // The pin must be comfortably inside the projector's ±1.2 cull, not at its edge.
        expect(Math.abs(pin.x), `${lot.id} pin x`).toBeLessThan(0.95);
        expect(Math.abs(pin.y), `${lot.id} pin y`).toBeLessThan(0.95);
        const curb = curbParking(lot);
        const unit = condenserPosition(lot);
        for (const [name, p] of [['curb', ndc(cam, curb.x, 1, curb.z)], ['unit', ndc(cam, unit.x, 1, unit.z)]] as const) {
          expect(Math.abs(p.x), `${lot.id} ${name} x`).toBeLessThan(0.9);
          expect(Math.abs(p.y), `${lot.id} ${name} y`).toBeLessThan(0.9);
        }
      }
    });
  }
});
