import { kmToMi, miToKm, mToFt, formatMiles, formatFeet } from './units';

describe('kmToMi / miToKm', () => {
  it('converts a known distance both ways', () => {
    expect(kmToMi(1.609344)).toBeCloseTo(1, 5);
    expect(miToKm(1)).toBeCloseTo(1.609344, 5);
  });

  it('round-trips', () => {
    expect(kmToMi(miToKm(26.2))).toBeCloseTo(26.2, 5);
  });
});

describe('mToFt', () => {
  it('converts a known height', () => {
    expect(mToFt(0.3048)).toBeCloseTo(1, 5);
    expect(mToFt(1000)).toBeCloseTo(3280.84, 1);
  });
});

describe('formatMiles', () => {
  it('formats with one decimal and a unit suffix', () => {
    expect(formatMiles(1.609344)).toBe('1.0 mi');
  });
});

describe('formatFeet', () => {
  it('rounds and adds thousands separators', () => {
    expect(formatFeet(1000)).toBe('3,281 ft');
  });
});
