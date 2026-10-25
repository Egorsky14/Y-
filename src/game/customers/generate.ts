import { HOUSE_LOTS, STREETS } from '../world/cityLayout';
import { chance, nextInt, nextRange, type RngState } from '../simulation/rng';
import type { Customer, Equipment } from '../simulation/types';
import { randomBrand, randomPersonName, randomWarrantyCompany } from './names';
import type { EquipmentType } from '../jobs/faults';

function addressFor(lotId: string, index: number): string {
  const lot = HOUSE_LOTS.find((l) => l.id === lotId)!;
  const street = STREETS.find((s) => s.id === lot.streetId)!;
  const number = 2400 + index * 8 + (lot.facing === 'north' ? 1 : 0);
  return `${number} ${street.name}`;
}

export function randomEquipment(rng: RngState): Equipment {
  const ageYears = nextInt(rng, 2, 22);
  const type: EquipmentType = chance(rng, 0.7) ? 'split-ac-gas-furnace' : chance(rng, 0.6) ? 'heat-pump' : 'package-unit';
  const refrigerant = ageYears > 15 ? 'R-22' : ageYears > 1 ? 'R-410A' : 'R-454B';
  return {
    type,
    brand: randomBrand(rng),
    tonnage: [2, 2.5, 3, 3.5, 4, 5][nextInt(rng, 0, 5)],
    ageYears,
    refrigerant,
    condition: Math.round(Math.max(15, 100 - ageYears * 4 - nextRange(rng, 0, 15))),
    seer: ageYears > 12 ? 10 + nextInt(rng, 0, 3) : 13 + nextInt(rng, 0, 5),
  };
}

/** Creates one customer per house lot; channel mix defaults to ~80% warranty. */
export function generateCustomers(rng: RngState, warrantyShare = 0.8): Record<string, Customer> {
  const customers: Record<string, Customer> = {};
  HOUSE_LOTS.forEach((lot, i) => {
    const channel = chance(rng, warrantyShare) ? 'warranty' : 'direct';
    const customer: Customer = {
      id: `cust-${lot.id}`,
      name: randomPersonName(rng),
      lotId: lot.id,
      address: addressFor(lot.id, i),
      channel,
      equipment: randomEquipment(rng),
      trust: Math.round(nextRange(rng, 35, 60)),
      history: [],
      warrantyCompany: channel === 'warranty' ? randomWarrantyCompany(rng) : undefined,
    };
    customers[customer.id] = customer;
  });
  return customers;
}
