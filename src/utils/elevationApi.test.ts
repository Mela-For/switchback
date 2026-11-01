import { downsampleCoords, computeGainLoss, mergeElevationIntoTrails } from './elevationApi';
import type { Trail } from '../types';

describe('downsampleCoords', () => {
  it('returns the input unchanged when already at or under the cap', () => {
    const coords = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
    expect(downsampleCoords(coords, 5)).toEqual(coords);
  });

  it('always includes the first and last point', () => {
    const coords = Array.from({ length: 100 }, (_, i) => ({ lat: i, lng: i }));
    const result = downsampleCoords(coords, 10);
    expect(result[0]).toEqual(coords[0]);
    expect(result[result.length - 1]).toEqual(coords[coords.length - 1]);
  });

  it('caps the result at maxSamples', () => {
    const coords = Array.from({ length: 500 }, (_, i) => ({ lat: i, lng: i }));
    expect(downsampleCoords(coords, 25).length).toBe(25);
  });
});

describe('computeGainLoss', () => {
  it('sums a simple climb then descent', () => {
    // 0 -> 100 -> 0, well above the noise threshold
    expect(computeGainLoss([0, 50, 100, 50, 0])).toEqual({ gainM: 100, lossM: 100 });
  });

  it('ignores jitter below the noise threshold', () => {
    // Sub-2m back-and-forth noise around a flat elevation should net to ~0
    expect(computeGainLoss([100, 100.5, 99.7, 100.3, 100])).toEqual({ gainM: 0, lossM: 0 });
  });

  it('accumulates a long gentle climb made of sub-threshold steps', () => {
    // Each step is 1m (below the 2m threshold), but 20 of them in the same direction is a real 20m climb
    const elevations = Array.from({ length: 21 }, (_, i) => i);
    expect(computeGainLoss(elevations)).toEqual({ gainM: 20, lossM: 0 });
  });

  it('returns zero for a flat or single-point profile', () => {
    expect(computeGainLoss([100, 100, 100])).toEqual({ gainM: 0, lossM: 0 });
    expect(computeGainLoss([100])).toEqual({ gainM: 0, lossM: 0 });
  });
});

describe('mergeElevationIntoTrails', () => {
  const trails: Trail[] = [
    { id: 'a', name: 'Trail A' },
    { id: 'b', name: 'Trail B' },
  ];

  it('sets elevation fields only on the matching trail', () => {
    const result = mergeElevationIntoTrails(trails, 'b', { gainM: 300, lossM: 150 });
    expect(result.find((t) => t.id === 'a')?.elevationGainM).toBeUndefined();
    expect(result.find((t) => t.id === 'b')).toEqual({ id: 'b', name: 'Trail B', elevationGainM: 300, elevationLossM: 150 });
  });

  it('does not mutate the input array', () => {
    const original = JSON.parse(JSON.stringify(trails));
    mergeElevationIntoTrails(trails, 'a', { gainM: 10, lossM: 5 });
    expect(trails).toEqual(original);
  });

  it('is a no-op when the trail id is not found', () => {
    const result = mergeElevationIntoTrails(trails, 'nonexistent', { gainM: 10, lossM: 5 });
    expect(result).toEqual(trails);
  });
});
