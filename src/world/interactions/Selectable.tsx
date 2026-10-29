import { useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useApp, type Selection } from '@/app/store';
import { PALETTE } from '../assets/palette';

interface SelectableProps {
  selection: Selection;
  children: ReactNode;
  /** Radius of the highlight ring on the ground. */
  ringRadius?: number;
  ringOffset?: [number, number, number];
  /** Lot footprint (x, z size): draws corner brackets on the lot outline instead of a ring. */
  bracket?: [number, number];
  onSelect?: () => void;
}

/**
 * Wraps a world object so clicking selects it and hovering shows a ring. Decorative
 * objects never use this wrapper, which keeps interactive and decorative geometry visually distinct.
 */
export function Selectable({ selection, children, ringRadius = 6, ringOffset = [0, 0.06, 0], bracket, onSelect }: SelectableProps) {
  const [hovered, setHovered] = useState(false);
  const isSelected = useApp((s) => s.selection?.kind === selection.kind && s.selection.id === selection.id);
  const select = useApp((s) => s.select);

  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        select(selection);
        onSelect?.();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'default';
      }}
    >
      {children}
      {(hovered || isSelected) && bracket && <LotBrackets size={bracket} y={ringOffset[1]} selected={isSelected} />}
      {(hovered || isSelected) && !bracket && (
        <mesh position={ringOffset} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <ringGeometry args={[ringRadius * 0.86, ringRadius, 48]} />
          <meshBasicMaterial color={isSelected ? PALETTE.egoTeal : '#ffffff'} transparent opacity={isSelected ? 0.9 : 0.5} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Lot selection: four L-shaped corner brackets on the lot outline (strategy-game style) instead of a
 * 22 m ring that crossed walls and the house. They stay on the lot boundary, clear of the building
 * and the service area, and fade when the camera comes in close to a service call.
 */
function LotBrackets({ size, y, selected }: { size: [number, number]; y: number; selected: boolean }) {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: selected ? PALETTE.egoTeal : '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }), [selected]);
  const geometry = useMemo(() => {
    const [w, d] = size;
    const leg = Math.min(4, Math.min(w, d) * 0.18);
    const t = 0.28;
    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = (sx * w) / 2;
      const cz = (sz * d) / 2;
      parts.push(new THREE.PlaneGeometry(leg, t).rotateX(-Math.PI / 2).translate(cx - (sx * leg) / 2, 0, cz - (sz * t) / 2));
      parts.push(new THREE.PlaneGeometry(t, leg).rotateX(-Math.PI / 2).translate(cx - (sx * t) / 2, 0, cz - (sz * leg) / 2));
    }
    const merged = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (const p of parts) {
      const q = p.toNonIndexed();
      pos.push(...(q.attributes.position.array as Float32Array));
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return merged;
  }, [size]);
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!group.current) return;
    group.current.getWorldPosition(world);
    const dist = camera.position.distanceTo(world);
    const base = selected ? 0.8 : 0.45;
    material.opacity = base * THREE.MathUtils.smoothstep(dist, 14, 34);
    group.current.visible = material.opacity > 0.02;
  });
  return (
    <group ref={group} position={[0, y, 0]}>
      <mesh geometry={geometry} material={material} renderOrder={2} />
    </group>
  );
}
