import { condenserPosition, type Lot } from '@/game/world/cityLayout';
import { PALETTE } from '../assets/palette';
import { Condenser } from './parts';
import { Selectable } from '../interactions/Selectable';
import { useApp } from '@/app/store';

const FACING_ROTATION: Record<Lot['facing'], number> = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

/**
 * A customer lot's interactive parts: a forgiving click volume and the gameplay condenser
 * with its status ring. The architecture itself is merged into the shared Neighborhood meshes.
 */
export function House({ lot, hasActiveJob }: { lot: Lot; hasActiveJob: boolean }) {
  const condenser = condenserPosition(lot);
  const isSelected = useApp((s) => s.selection?.kind === 'lot' && s.selection.id === lot.id);

  return (
    <group position={[lot.center.x, 0, lot.center.z]}>
      <Selectable selection={{ kind: 'lot', id: lot.id }} ringRadius={11} ringOffset={[0, 0.08, 0]}>
        <group rotation={[0, FACING_ROTATION[lot.facing], 0]} name={`house:${lot.id}`}>
          <mesh position={[0, 2, 0]} visible={false}>
            <boxGeometry args={[lot.width - 2, 6, lot.depth - 4]} />
            <meshBasicMaterial />
          </mesh>
        </group>
      </Selectable>
      <group position={[condenser.x - lot.center.x, 0, condenser.z - lot.center.z]}>
        <Condenser position={[0, 0, 0]} running={!hasActiveJob} />
        {(hasActiveJob || isSelected) && (
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.0, 1.25, 32]} />
            <meshBasicMaterial color={hasActiveJob ? '#ffb347' : PALETTE.egoTeal} transparent opacity={0.85} />
          </mesh>
        )}
      </group>
    </group>
  );
}
