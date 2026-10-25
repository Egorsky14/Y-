import { Sky } from '@react-three/drei';
import { useApp } from '@/app/store';

export function Lighting() {
  const { quality, shadows } = useApp((s) => s.settings);
  const mapSize = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  return (
    <>
      <Sky distance={4000} sunPosition={[120, 90, 60]} turbidity={3.5} rayleigh={0.6} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <hemisphereLight args={['#dff1ff', '#c9a97a', 0.75]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[140, 180, 90]}
        intensity={2.3}
        color="#fff4e0"
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.00035}
        shadow-normalBias={0.03}
        shadow-camera-left={-260}
        shadow-camera-right={260}
        shadow-camera-top={260}
        shadow-camera-bottom={-260}
        shadow-camera-near={10}
        shadow-camera-far={600}
      />
      <directionalLight position={[-120, 60, -80]} intensity={0.35} color="#bcd6ff" />
    </>
  );
}
