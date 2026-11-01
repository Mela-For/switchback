import { haversineKm } from './overpassApi';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(45.5, -122.6, 45.5, -122.6)).toBe(0);
  });

  it('matches the known ~111.2km length of one degree of longitude at the equator', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
  });

  it('matches the known distance between New York City and Los Angeles', () => {
    const nyc = { lat: 40.7128, lon: -74.006 };
    const la = { lat: 34.0522, lon: -118.2437 };
    expect(haversineKm(nyc.lat, nyc.lon, la.lat, la.lon)).toBeCloseTo(3936, -1);
  });

  it('is symmetric', () => {
    const a = haversineKm(47.6062, -122.3321, 37.7749, -122.4194);
    const b = haversineKm(37.7749, -122.4194, 47.6062, -122.3321);
    expect(a).toBeCloseTo(b, 10);
  });
});
