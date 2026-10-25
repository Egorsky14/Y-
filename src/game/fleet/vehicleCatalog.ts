export type VehicleClass = 'compact-van' | 'full-size-van' | 'pickup' | 'box-truck';

export interface VehicleSpec {
  classId: VehicleClass;
  name: string;
  description: string;
  priceNew: number;
  priceUsed: number;
  /** Cubic feet of cargo. */
  cargoCapacity: number;
  seats: number;
  /** Tool/parts slots that affect first-visit completion rate. */
  toolCapacity: number;
  /** Fuel cost per world unit traveled (dollars). */
  fuelPerUnit: number;
  /** Daily upkeep: insurance, registration, wear. */
  upkeepPerDay: number;
  /** World units per game minute. */
  speed: number;
  /** Can carry a full replacement system. */
  canCarryReplacement: boolean;
  liftgateCompatible: boolean;
  /** Annual depreciation fraction of purchase price. */
  depreciation: number;
}

export const VEHICLE_SPECS: Record<VehicleClass, VehicleSpec> = {
  'compact-van': {
    classId: 'compact-van',
    name: 'Compact Service Van',
    description: 'Nimble and cheap to run. Fits most repair parts, no replacement equipment.',
    priceNew: 31500,
    priceUsed: 15800,
    cargoCapacity: 130,
    seats: 2,
    toolCapacity: 6,
    fuelPerUnit: 0.011,
    upkeepPerDay: 22,
    speed: 13,
    canCarryReplacement: false,
    liftgateCompatible: false,
    depreciation: 0.15,
  },
  'full-size-van': {
    classId: 'full-size-van',
    name: 'Full-Size Service Van',
    description: 'The workhorse. Carries a condenser or air handler and a full parts loadout.',
    priceNew: 52000,
    priceUsed: 26500,
    cargoCapacity: 280,
    seats: 2,
    toolCapacity: 10,
    fuelPerUnit: 0.016,
    upkeepPerDay: 31,
    speed: 12,
    canCarryReplacement: true,
    liftgateCompatible: false,
    depreciation: 0.14,
  },
  pickup: {
    classId: 'pickup',
    name: 'Pickup Truck',
    description: 'Flexible crew hauler. Great for sales visits and installer support.',
    priceNew: 46000,
    priceUsed: 22000,
    cargoCapacity: 70,
    seats: 5,
    toolCapacity: 5,
    fuelPerUnit: 0.015,
    upkeepPerDay: 27,
    speed: 14,
    canCarryReplacement: false,
    liftgateCompatible: false,
    depreciation: 0.13,
  },
  'box-truck': {
    classId: 'box-truck',
    name: 'Installation Box Truck',
    description: 'Hauls complete systems, ductwork and the install crew. Slow but essential for replacements.',
    priceNew: 78000,
    priceUsed: 39500,
    cargoCapacity: 900,
    seats: 3,
    toolCapacity: 14,
    fuelPerUnit: 0.026,
    upkeepPerDay: 48,
    speed: 10,
    canCarryReplacement: true,
    liftgateCompatible: true,
    depreciation: 0.12,
  },
};

export type VehicleUpgradeId = 'full-wrap' | 'basic-decals' | 'ladder-rack' | 'shelving' | 'tool-storage' | 'cargo-upgrade' | 'liftgate';

export interface VehicleUpgrade {
  id: VehicleUpgradeId;
  name: string;
  cost: number;
  description: string;
  /** Gameplay effect summary; applied in fleet/effects.ts */
  effect: string;
}

export const VEHICLE_UPGRADES: VehicleUpgrade[] = [
  { id: 'full-wrap', name: 'EGO HVAC Full Wrap', cost: 3200, description: 'Black and teal full vehicle wrap with wordmark.', effect: '+6% direct lead generation per wrapped vehicle on the road.' },
  { id: 'basic-decals', name: 'Basic Decals', cost: 650, description: 'Door logos and phone number.', effect: '+2% direct lead generation per vehicle.' },
  { id: 'ladder-rack', name: 'Ladder Rack', cost: 900, description: 'Roof rack for extension ladders.', effect: 'Unlocks rooftop package-unit jobs for this vehicle.' },
  { id: 'shelving', name: 'Shelving Package', cost: 1400, description: 'Organized steel shelving.', effect: '+2 tool capacity, -5% repair time.' },
  { id: 'tool-storage', name: 'Tool Storage', cost: 1100, description: 'Locking tool drawers.', effect: '+2 tool capacity.' },
  { id: 'cargo-upgrade', name: 'Cargo Upgrade', cost: 1800, description: 'Partition and bulkhead for larger loads.', effect: '+25% cargo capacity.' },
  { id: 'liftgate', name: 'Liftgate', cost: 4500, description: 'Hydraulic liftgate (box truck only).', effect: '-15% replacement install time.' },
];

export function upgradeById(id: VehicleUpgradeId): VehicleUpgrade {
  return VEHICLE_UPGRADES.find((u) => u.id === id)!;
}

export const PAINT_OPTIONS = ['ego-black', 'arctic-white', 'graphite', 'desert-sand'] as const;
export type PaintId = (typeof PAINT_OPTIONS)[number];
