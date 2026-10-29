import { condenserPosition, type Lot } from '@/game/world/cityLayout';
import { PALETTE } from '../assets/palette';
import { CondenserFan } from './parts';
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
      <Selectable selection={{ kind: 'lot', id: lot.id }} bracket={[lot.width - 0.6, lot.depth - 0.6]} ringOffset={[0, 0.09, 0]}>
        <group rotation={[0, FACING_ROTATION[lot.facing], 0]} name={`house:${lot.id}`}>
          <mesh position={[0, 2, 0]} visible={false}>
            <boxGeometry args={[lot.width - 2, 6, lot.depth - 4]} />
            <meshBasicMaterial />
          </mesh>
        </group>
      </Selectable>
      <group position={[condenser.x - lot.center.x, 0, condenser.z - lot.center.z]}>
        <CondenserFan running={!hasActiveJob} />
        {(hasActiveJob || isSelected) && (
          // A slim outline around the unit's pad marks the job without painting the work area.
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.98, 1.06, 40]} />
            <meshBasicMaterial color={hasActiveJob ? '#ffb347' : PALETTE.egoTeal} transparent opacity={0.7} depthWrite={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}
