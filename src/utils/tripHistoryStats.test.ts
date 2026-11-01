import { computeTripHistoryLedger, computeLifeList, suggestPackingItemNames, suggestRecipeNames } from './tripHistoryStats';
import type { TripHistoryEntry } from './tripHistory';

function makeEntry(overrides: Partial<TripHistoryEntry> = {}): TripHistoryEntry {
  return {
    tripId: 'trip1',
    name: 'Trip',
    startDate: '2026-06-10',
    endDate: '2026-06-13',
    type: 'backpacking',
    places: [],
    trails: [],
    packingList: [],
    meals: [],
    nightsByCategory: {},
    totalNights: 0,
    source: 'live',
    ...overrides,
  };
}

describe('computeTripHistoryLedger', () => {
  it('returns an all-zero/null ledger for no entries, without throwing', () => {
    const ledger = computeTripHistoryLedger([]);
    expect(ledger.totalTrips).toBe(0);
    expect(ledger.totalNights).toBe(0);
    expect(ledger.longestTrail).toBeNull();
    expect(ledger.mostVisitedLocation).toBeNull();
  });

  it('sums nights, nightsByCategory, and trip count across entries', () => {
    const entries = [
      makeEntry({ tripId: 't1', totalNights: 2, nightsByCategory: { campground: 2 } }),
      makeEntry({ tripId: 't2', totalNights: 3, nightsByCategory: { campground: 1, lodging: 2 } }),
    ];
    const ledger = computeTripHistoryLedger(entries);
    expect(ledger.totalTrips).toBe(2);
    expect(ledger.totalNights).toBe(5);
    expect(ledger.nightsByCategory).toEqual({ campground: 3, lodging: 2 });
  });

  it('sums trail distance/elevation and picks the longest trail with a deterministic tie-break', () => {
    const entries = [
      makeEntry({
        tripId: 't1',
        name: 'Trip A',
        trails: [
          { id: 'tr1', name: 'Zebra Trail', distanceKm: 10, elevationGainM: 300, elevationLossM: 100 },
          { id: 'tr2', name: 'Apple Trail', distanceKm: 10, elevationGainM: 200, elevationLossM: 50 },
        ],
      }),
    ];
    const ledger = computeTripHistoryLedger(entries);
    expect(ledger.totalTrailDistanceKm).toBe(20);
    expect(ledger.totalElevationGainM).toBe(500);
    expect(ledger.totalElevationLossM).toBe(150);
    // Tie on distanceKm=10 — alphabetically-first name wins, deterministically.
    expect(ledger.longestTrail).toEqual({ name: 'Apple Trail', distanceKm: 10, tripName: 'Trip A' });
  });

  it('picks the most-visited location case-insensitively, with a deterministic tie-break', () => {
    const entries = [
      makeEntry({ tripId: 't1', location: 'Yosemite' }),
      makeEntry({ tripId: 't2', location: 'yosemite' }),
      makeEntry({ tripId: 't3', location: 'Zion' }),
    ];
    const ledger = computeTripHistoryLedger(entries);
    expect(ledger.mostVisitedLocation).toEqual({ location: 'Yosemite', count: 2 });
  });
});

describe('computeLifeList', () => {
  it('dedupes places by placeId and tracks visit count / last-visited date', () => {
    const entries = [
      makeEntry({
        tripId: 't1',
        endDate: '2026-06-13',
        places: [{ placeId: 'p1', name: 'Camp A', address: '', category: 'campground', lat: 0, lng: 0, addedAt: '' }],
      }),
      makeEntry({
        tripId: 't2',
        endDate: '2026-07-01',
        places: [{ placeId: 'p1', name: 'Camp A', address: '', category: 'campground', lat: 0, lng: 0, addedAt: '' }],
      }),
    ];
    const { places } = computeLifeList(entries);
    expect(places).toHaveLength(1);
    expect(places[0].visitCount).toBe(2);
    expect(places[0].lastVisitedDate).toBe('2026-07-01');
  });

  it('dedupes trails by osmId, falling back to normalized name when absent', () => {
    const entries = [
      makeEntry({ tripId: 't1', endDate: '2026-06-13', trails: [{ id: 'a', name: 'River Trail', osmId: 'osm1', distanceKm: 5 }] }),
      makeEntry({ tripId: 't2', endDate: '2026-07-01', trails: [{ id: 'b', name: 'River Trail', osmId: 'osm1', distanceKm: 5 }] }),
      makeEntry({ tripId: 't3', endDate: '2026-08-01', trails: [{ id: 'c', name: '  River Trail  ' }] }),
    ];
    const { trails } = computeLifeList(entries);
    // The two osmId-tagged trails dedupe together; the manual (no-osmId) one is a separate entry
    // despite sharing a name — an acknowledged imperfect-dedup limitation for manually-entered trails.
    expect(trails).toHaveLength(2);
    const osmTrail = trails.find((t) => t.key === 'osm1');
    expect(osmTrail?.visitCount).toBe(2);
  });
});

describe('suggestPackingItemNames', () => {
  it('ranks by frequency, deduping case-insensitively', () => {
    const entries = [
      makeEntry({
        tripId: 't1',
        endDate: '2026-06-01',
        packingList: [{ name: 'Tent', category: 'Shelter' }, { name: 'headlamp', category: 'Other' }],
      }),
      makeEntry({ tripId: 't2', endDate: '2026-07-01', packingList: [{ name: 'tent', category: 'Shelter' }] }),
    ];
    const results = suggestPackingItemNames(entries, '');
    expect(results[0]).toMatchObject({ name: 'Tent', count: 2 });
    expect(results[1]).toMatchObject({ name: 'headlamp', count: 1 });
  });

  it('filters by substring query, case-insensitively', () => {
    const entries = [
      makeEntry({ packingList: [{ name: 'Tent', category: 'Shelter' }, { name: 'Trowel', category: 'Other' }] }),
    ];
    const results = suggestPackingItemNames(entries, 'tr');
    expect(results.map((r) => r.name)).toEqual(['Trowel']);
  });

  it('respects the limit', () => {
    const entries = [
      makeEntry({
        packingList: [{ name: 'A', category: 'Other' }, { name: 'B', category: 'Other' }, { name: 'C', category: 'Other' }],
      }),
    ];
    expect(suggestPackingItemNames(entries, '', 2)).toHaveLength(2);
  });
});

describe('suggestRecipeNames', () => {
  it('ranks by frequency, deduping case-insensitively, and ignores meals with no recipeName', () => {
    const entries = [
      makeEntry({ tripId: 't1', endDate: '2026-06-01', meals: [{ slot: 'dinner', recipeName: 'Chili' }, { slot: 'snack' }] }),
      makeEntry({ tripId: 't2', endDate: '2026-07-01', meals: [{ slot: 'dinner', recipeName: 'chili' }] }),
    ];
    const results = suggestRecipeNames(entries, '');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ recipeName: 'Chili', count: 2 });
  });
});
