import { buildTripHistorySnapshot, tripToHistoryEntry, snapshotToHistoryEntry, mergeTripHistory } from './tripHistory';
import type { Trip, TripHistorySnapshot } from '../types';

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip1',
    name: 'Yosemite Backpacking',
    startDate: '2026-06-10',
    endDate: '2026-06-13',
    type: 'backpacking',
    location: 'Yosemite',
    packingList: [],
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ownerUid: 'owner1',
    collaboratorUids: ['owner1', 'friend1'],
    collaborators: { owner1: 'Owner', friend1: 'Friend' },
    inviteCode: 'ABC123',
    ...overrides,
  };
}

describe('buildTripHistorySnapshot', () => {
  it('carries basic trip fields', () => {
    const snapshot = buildTripHistorySnapshot(makeTrip());
    expect(snapshot.tripId).toBe('trip1');
    expect(snapshot.name).toBe('Yosemite Backpacking');
    expect(snapshot.startDate).toBe('2026-06-10');
    expect(snapshot.endDate).toBe('2026-06-13');
    expect(snapshot.type).toBe('backpacking');
    expect(snapshot.location).toBe('Yosemite');
  });

  it('omits the location key entirely when absent, rather than writing undefined', () => {
    const snapshot = buildTripHistorySnapshot(makeTrip({ location: undefined }));
    expect('location' in snapshot).toBe(false);
  });

  it('never retains collaborator/invite/ownership/itinerary data', () => {
    const trip = makeTrip({
      itinerary: [{ id: 'e1', date: '2026-06-10', title: 'Arrive' }],
    });
    const snapshot = buildTripHistorySnapshot(trip);
    expect(snapshot).not.toHaveProperty('collaborators');
    expect(snapshot).not.toHaveProperty('collaboratorUids');
    expect(snapshot).not.toHaveProperty('ownerUid');
    expect(snapshot).not.toHaveProperty('inviteCode');
    expect(snapshot).not.toHaveProperty('itinerary');
  });

  it('trims packingList to name/category, stripping assignedTo/checked/quantity/notes', () => {
    const trip = makeTrip({
      packingList: [
        { id: 'i1', name: 'Tent', category: 'Shelter', checked: true, quantity: 2, assignedTo: ['friend1'], notes: 'red one' },
      ],
    });
    const snapshot = buildTripHistorySnapshot(trip);
    expect(snapshot.packingList).toEqual([{ name: 'Tent', category: 'Shelter' }]);
  });

  it('trims meals to slot/recipeName/recipeUrl/ingredients, stripping assigneeUids/checked/notes/id/date', () => {
    const trip = makeTrip({
      meals: [
        {
          id: 'm1',
          date: '2026-06-11',
          slot: 'dinner',
          recipeName: 'Camp chili',
          recipeUrl: 'https://example.com/chili',
          ingredients: [{ id: 'ing1', name: 'Beans', amount: '2 cans', assigneeUids: ['friend1'], checked: true }],
          assigneeUids: ['owner1'],
          notes: 'spicy',
        },
      ],
    });
    const snapshot = buildTripHistorySnapshot(trip);
    expect(snapshot.meals).toEqual([
      {
        slot: 'dinner',
        recipeName: 'Camp chili',
        recipeUrl: 'https://example.com/chili',
        ingredients: [{ name: 'Beans', amount: '2 cans' }],
      },
    ]);
  });

  it('filters out meals with no recipeName', () => {
    const trip = makeTrip({ meals: [{ id: 'm1', date: '2026-06-11', slot: 'snack', ingredients: [] }] });
    expect(buildTripHistorySnapshot(trip).meals).toEqual([]);
  });

  it('computes nightsByCategory and totalNights from itinerary + places', () => {
    const trip = makeTrip({
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      places: [{ placeId: 'p1', name: 'Camp A', address: '', category: 'campground', lat: 0, lng: 0, addedAt: '2026-01-01' }],
      itinerary: [
        { id: 'e1', date: '2026-06-10', title: 'Camp', placeId: 'p1' },
        { id: 'e2', date: '2026-06-11', title: 'Camp', placeId: 'p1' },
      ],
    });
    const snapshot = buildTripHistorySnapshot(trip);
    expect(snapshot.totalNights).toBe(2); // getTripNights excludes the last (checkout) day
    expect(snapshot.nightsByCategory).toEqual({ campground: 2 });
  });
});

describe('tripToHistoryEntry / snapshotToHistoryEntry / mergeTripHistory', () => {
  it('tags live trips and snapshots with the right source', () => {
    const liveEntry = tripToHistoryEntry(makeTrip({ id: 'live1' }));
    expect(liveEntry.source).toBe('live');
    expect(liveEntry.tripId).toBe('live1');

    const snapshot: TripHistorySnapshot = {
      ...buildTripHistorySnapshot(makeTrip({ id: 'snap1' })),
      snapshottedAt: '2026-07-01T00:00:00.000Z',
    };
    const snapshotEntry = snapshotToHistoryEntry(snapshot);
    expect(snapshotEntry.source).toBe('snapshot');
    expect(snapshotEntry.tripId).toBe('snap1');
    expect(snapshotEntry).not.toHaveProperty('snapshottedAt');
  });

  it('merges archived trips and snapshots into one flat list', () => {
    const trip1 = makeTrip({ id: 't1' });
    const trip2 = makeTrip({ id: 't2' });
    const snapshot: TripHistorySnapshot = {
      ...buildTripHistorySnapshot(makeTrip({ id: 's1' })),
      snapshottedAt: '2026-07-01T00:00:00.000Z',
    };

    const merged = mergeTripHistory([trip1, trip2], [snapshot]);
    expect(merged).toHaveLength(3);
    expect(merged.map((e) => e.tripId).sort()).toEqual(['s1', 't1', 't2']);
  });
});
