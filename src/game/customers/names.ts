import { pick, type RngState } from '../simulation/rng';

const FIRST = ['Maria', 'James', 'Linda', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Daniel', 'Karen', 'Carlos', 'Nancy', 'Luis', 'Angela', 'Kevin', 'Diane', 'Brian', 'Priya', 'Marcus', 'Hannah', 'Tyler', 'Grace', 'Omar', 'Sofia', 'Andre', 'Naomi', 'Victor', 'Rosa', 'Ethan', 'Mei', 'Jordan'];
const LAST = ['Garcia', 'Nguyen', 'Johnson', 'Martinez', 'Patel', 'Brown', 'Kim', 'Lopez', 'Williams', 'Hernandez', 'Davis', 'Rodriguez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Lee', 'Perez', 'Ramirez', 'Flores', 'Rivera', 'Torres', 'Reed', 'Cook', 'Bell', 'Ward', 'Cruz', 'Ortiz', 'Sandoval', 'Okafor', 'Chen', 'Walsh', 'Delgado'];

export function randomPersonName(rng: RngState): string {
  return `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
}

export function nameSeed(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

const WARRANTY_COMPANIES = ['ShieldHome Warranty', 'First Choice Home Protect', 'Silver State Home Warranty'];
export function randomWarrantyCompany(rng: RngState): string {
  return pick(rng, WARRANTY_COMPANIES);
}

const BRANDS = ['Carrier', 'Trane', 'Goodman', 'Lennox', 'Rheem', 'York', 'Amana', 'Day & Night'];
export function randomBrand(rng: RngState): string {
  return pick(rng, BRANDS);
}
