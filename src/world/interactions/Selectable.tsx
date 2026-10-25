import { useState, type ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useApp, type Selection } from '@/app/store';
import { PALETTE } from '../assets/palette';

interface SelectableProps {
  selection: Selection;
  children: ReactNode;
  /** Radius of the highlight ring on the ground. */
  ringRadius?: number;
  ringOffset?: [number, number, number];
  onSelect?: () => void;
}

/**
 * Wraps a world object so clicking selects it and hovering shows a ring. Decorative
 * objects never use this wrapper, which keeps interactive and decorative geometry visually distinct.
 */
export function Selectable({ selection, children, ringRadius = 6, ringOffset = [0, 0.06, 0], onSelect }: SelectableProps) {
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
      {(hovered || isSelected) && (
        <mesh position={ringOffset} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <ringGeometry args={[ringRadius * 0.86, ringRadius, 48]} />
          <meshBasicMaterial color={isSelected ? PALETTE.egoTeal : '#ffffff'} transparent opacity={isSelected ? 0.9 : 0.5} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
