import { isFutureDate, vehicleValid } from '../validate';

describe('isFutureDate', () => {
  it('accepts only a well-formed date after today', () => {
    expect(isFutureDate('2030-01-31', '2026-11-13')).toBe(true);
    expect(isFutureDate('2026-11-13', '2026-11-13')).toBe(false);
    expect(isFutureDate('2025-01-01', '2026-11-13')).toBe(false);
    expect(isFutureDate('31/01/2030', '2026-11-13')).toBe(false);
  });
});

describe('vehicleValid', () => {
  const base = { categoryId: 'c', make: 'Bajaj', model: 'Pulsar', color: 'Black', registrationNumber: 'DHAKA-HA-12', year: '2020' };
  it('needs every field and a sensible year', () => {
    expect(vehicleValid(base, 2026)).toBe(true);
    expect(vehicleValid({ ...base, categoryId: '' }, 2026)).toBe(false);
    expect(vehicleValid({ ...base, year: '1980' }, 2026)).toBe(false);
    expect(vehicleValid({ ...base, year: '2028' }, 2026)).toBe(false);
  });
});
