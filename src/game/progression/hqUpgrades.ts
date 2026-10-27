export type HqUpgradeId =
  | 'expanded-garage'
  | 'additional-parking'
  | 'dispatch-center'
  | 'training-room'
  | 'parts-warehouse'
  | 'staging-area'
  | 'sales-office'
  | 'fleet-maintenance'
  | 'operations-center';

export interface HqUpgrade {
  id: HqUpgradeId;
  name: string;
  cost: number;
  description: string;
  effect: string;
  requires?: HqUpgradeId[];
  /** Minimum company level. */
  level: number;
  /** Minimum technicians on staff (owner included: the owner works as a technician). */
  minTechnicians?: number;
}

export const HQ_UPGRADES: HqUpgrade[] = [
  { id: 'expanded-garage', name: 'Expanded Garage', cost: 18000, description: 'Second service bay with roll-up door.', effect: '+2 vehicle capacity. Vehicles depreciate 20% slower.', level: 1 },
  { id: 'additional-parking', name: 'Additional Parking', cost: 7500, description: 'Paved lot extension.', effect: '+4 vehicle capacity, +4 employee capacity.', level: 1 },
  { id: 'dispatch-center', name: 'Dispatch Center', cost: 14000, description: 'Call desk, boards, dual monitors.', effect: 'Leads stay open 2 hours longer; dispatcher conversion +10%.', level: 2 },
  { id: 'training-room', name: 'Technician Training Room', cost: 12000, description: 'Live training rig with bench units.', effect: 'Training programs finish 1 day faster (min 1).', level: 2 },
  { id: 'parts-warehouse', name: 'Parts Warehouse', cost: 22000, description: 'Racking and stocked common parts.', effect: 'Parts cost -12%. First-visit completion +10%.', level: 2 },
  { id: 'staging-area', name: 'Installation Staging Area', cost: 16000, description: 'Covered yard for staging equipment.', effect: 'Replacement install time -15%. Enables a second install crew.', requires: ['expanded-garage'], level: 3 },
  { id: 'sales-office', name: 'Sales Office', cost: 15000, description: 'Comfort advisor offices and showroom.', effect: 'Replacement close rate +8%.', level: 3 },
  { id: 'operations-center', name: 'Automated Operations Center', cost: 1000, description: 'Dispatch software and procedures that let technicians run routine calls on their own.', effect: 'Unlocks automatic diagnostics and automatic estimates (Settings › Operations Automation). Owner decisions go to the Owner Attention queue.', level: 1, minTechnicians: 3 },
  { id: 'fleet-maintenance', name: 'Fleet Maintenance Bay', cost: 26000, description: 'Lift and tire service.', effect: 'Vehicle upkeep -30%, breakdowns -50%.', requires: ['expanded-garage'], level: 4 },
];

export function hqUpgradeById(id: HqUpgradeId): HqUpgrade {
  return HQ_UPGRADES.find((u) => u.id === id)!;
}
