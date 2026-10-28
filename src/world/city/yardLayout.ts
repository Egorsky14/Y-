import type { Lot } from '@/game/world/cityLayout';
import { hashLot, propertyPlan, type PlantPlacement, type Species } from './propertyPlan';

/**
 * Per-lot planting, now derived from the property plan (src/world/city/propertyPlan.ts), which
 * lays out every yard by archetype around the house, driveway, walk and condenser access. The
 * instanced vegetation layer reads this; the house builder renders the rest of the plan.
 */
export type { Species };
export { hashLot };

export type PlantInstance = PlantPlacement;

export interface YardPlan {
  seed: number;
  plants: PlantInstance[];
}

export function yardPlan(lot: Lot): YardPlan {
  const plan = propertyPlan(lot);
  return { seed: plan.seed, plants: plan.plants };
}
