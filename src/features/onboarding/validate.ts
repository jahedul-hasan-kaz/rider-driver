import type { VehicleInput } from '@/api/endpoints/driver';

// Form checks for the driver application, kept out of the route files so they can be tested.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD date after today (licence and document expiry). */
export function isFutureDate(value: string, today = new Date().toISOString().slice(0, 10)): boolean {
  return DATE.test(value) && !Number.isNaN(Date.parse(value)) && value > today;
}

export function vehicleValid(v: Omit<VehicleInput, 'year'> & { year: string }, thisYear = new Date().getFullYear()): boolean {
  const year = Number(v.year);
  return (
    !!v.categoryId &&
    v.make.trim().length >= 2 &&
    v.model.trim().length >= 1 &&
    v.color.trim().length >= 3 &&
    v.registrationNumber.trim().length >= 5 &&
    Number.isInteger(year) &&
    year >= 1990 &&
    year <= thisYear + 1
  );
}
