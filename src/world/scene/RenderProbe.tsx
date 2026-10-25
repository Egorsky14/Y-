import { useFrame, useThree } from '@react-three/fiber';

declare global {
  interface Window {
    __egoRender?: { calls: number; triangles: number; geometries: number; textures: number; frame: number };
  }
}

/** Publishes renderer statistics for QA tooling. Costs nothing measurable per frame. */
export function RenderProbe() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    const i = gl.info;
    window.__egoRender = { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, frame: i.render.frame };
  });
  return null;
}
