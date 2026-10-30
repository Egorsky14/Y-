import { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';

/**
 * Image-based lighting from a procedural desert-sky dome (no network assets): a blue zenith, a
 * bright hazy horizon band, warm sand below and a soft sun hot spot. Paint, glass and metal reflect
 * an outdoor scene instead of the indoor studio panels they used to show as white streaks on hoods
 * and windshields, and diffuse fill on buildings picks up sky blue from above and sand bounce from
 * below.
 */
const ENV_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ENV_FRAG = `varying vec3 vDir;
uniform vec3 sunDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.24, 0.43, 0.72);
  vec3 horizon = vec3(0.86, 0.88, 0.86);
  vec3 sand = vec3(0.62, 0.5, 0.36);
  vec3 dark = vec3(0.32, 0.27, 0.22);
  vec3 col = h > 0.0 ? mix(horizon, zenith, pow(h, 0.5)) : mix(sand, dark, pow(-h, 0.6));
  // Distant mountain band just above the horizon, slightly darker and warmer.
  float band = smoothstep(0.0, 0.02, h) * (1.0 - smoothstep(0.03, 0.09, h));
  col = mix(col, vec3(0.62, 0.55, 0.5), band * 0.5);
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += vec3(1.0, 0.93, 0.8) * (pow(s, 600.0) * 30.0 + pow(s, 24.0) * 0.6);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * Moonlit counterpart: deep blue sky, a cool silver moon hot spot, dark cool ground and a faint
 * warm skyglow low on the horizon. Atmosphere swaps to it after sunset, at the moment the day map
 * has faded to zero, so reflections and fill turn cool without a visible switch.
 */
const NIGHT_FRAG = `varying vec3 vDir;
uniform vec3 sunDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.035, 0.06, 0.13);
  vec3 horizon = vec3(0.09, 0.11, 0.17);
  vec3 ground = vec3(0.05, 0.055, 0.07);
  vec3 col = h > 0.0 ? mix(horizon, zenith, pow(h, 0.45)) : mix(ground * 1.3, ground * 0.6, pow(-h, 0.6));
  col += vec3(0.16, 0.1, 0.06) * smoothstep(0.08, 0.0, abs(h - 0.01));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += vec3(0.75, 0.82, 1.0) * (pow(s, 900.0) * 12.0 + pow(s, 30.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
}`;

/** Direction of the moon (fixed, south-east, 43° up) used for night light, its sky glow and the night map. */
export const MOON_DIR = new THREE.Vector3(Math.cos(2.2) * Math.cos(0.75), Math.sin(0.75), Math.sin(2.2) * Math.cos(0.75)).normalize();

function skyScene(fragmentShader: string, sunDir: THREE.Vector3): THREE.Scene {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({ vertexShader: ENV_VERT, fragmentShader, side: THREE.BackSide, uniforms: { sunDir: { value: sunDir } } });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
  return scene;
}

function bake(pmrem: THREE.PMREMGenerator, source: THREE.Scene): THREE.Texture {
  const env = pmrem.fromScene(source, 0.02).texture;
  source.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return env;
}

/** The day and night maps, kept on the scene (`userData.envMaps`) for Atmosphere to swap between. */
export interface EnvMaps {
  day: THREE.Texture;
  night: THREE.Texture | null;
}

/** `withNight` also bakes the moonlit map (the game world; the fleet preview stays daylit). */
export function StudioEnvironment({ intensity = 0.45, withNight = false }: { intensity?: number; withNight?: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const day = bake(pmrem, skyScene(ENV_FRAG, new THREE.Vector3(0.45, 0.75, 0.35)));
    const night = withNight ? bake(pmrem, skyScene(NIGHT_FRAG, MOON_DIR)) : null;
    scene.userData.envMaps = { day, night } satisfies EnvMaps;
    scene.environment = day;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      delete scene.userData.envMaps;
      day.dispose();
      night?.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity, withNight]);
  return null;
}
