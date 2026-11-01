import { getTripNights, getNightlyStays, summarizeNightlyStays } from './overnightStays';
import type { ItineraryEvent, TripPlace } from '../types';

function place(overrides: Partial<TripPlace> & Pick<TripPlace, 'placeId' | 'category'>): TripPlace {
  return {
    name: 'Test place',
    address: '123 Test St',
    lat: 0,
    lng: 0,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function event(overrides: Partial<ItineraryEvent> & Pick<ItineraryEvent, 'id' | 'date'>): ItineraryEvent {
  return {
    title: 'Test event',
    ...overrides,
  };
}

describe('getTripNights', () => {
  it('returns no nights for a single-day trip', () => {
    expect(getTripNights('2026-06-10', '2026-06-10')).toEqual([]);
  });

  it('returns every night except the last (departure) day', () => {
    expect(getTripNights('2026-06-10', '2026-06-13')).toEqual([
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
    ]);
  });
});

describe('getNightlyStays', () => {
  it('treats every night as a gap when there is no itinerary or places', () => {
    const stays = getNightlyStays('2026-06-10', '2026-06-12', [], []);
    expect(stays).toEqual([
      { date: '2026-06-10', place: null, eventId: null },
      { date: '2026-06-11', place: null, eventId: null },
    ]);
  });

  it('resolves a campground stay repeated across multiple nights', () => {
    const campground = place({ placeId: 'p1', category: 'campground', name: 'Pine Campground' });
    const itinerary = [
      event({ id: 'e1', date: '2026-06-10', placeId: 'p1' }),
      event({ id: 'e2', date: '2026-06-11', placeId: 'p1' }),
    ];
    const stays = getNightlyStays('2026-06-10', '2026-06-12', itinerary, [campground]);
    expect(stays.map((s) => s.place?.placeId)).toEqual(['p1', 'p1']);
  });

  it('resolves a lodging place the same as a campground', () => {
    const hotel = place({ placeId: 'p1', category: 'lodging', name: 'Mountain Inn' });
    const itinerary = [event({ id: 'e1', date: '2026-06-10', placeId: 'p1' })];
    const stays = getNightlyStays('2026-06-10', '2026-06-11', itinerary, [hotel]);
    expect(stays[0].place?.placeId).toBe('p1');
  });

  it('does not count a non-overnight category place as a stay', () => {
    const restaurant = place({ placeId: 'p1', category: 'restaurant' });
    const itinerary = [event({ id: 'e1', date: '2026-06-10', placeId: 'p1' })];
    const stays = getNightlyStays('2026-06-10', '2026-06-11', itinerary, [restaurant]);
    expect(stays[0].place).toBeNull();
  });

  it('treats a dangling placeId (place no longer in trip.places) as a gap without throwing', () => {
    const itinerary = [event({ id: 'e1', date: '2026-06-10', placeId: 'missing' })];
    expect(() => getNightlyStays('2026-06-10', '2026-06-11', itinerary, [])).not.toThrow();
    const stays = getNightlyStays('2026-06-10', '2026-06-11', itinerary, []);
    expect(stays[0].place).toBeNull();
    expect(stays[0].eventId).toBeNull();
  });

  it('picks the earliest startTime when two overnight events land on the same night', () => {
    const campground = place({ placeId: 'p1', category: 'campground' });
    const hotel = place({ placeId: 'p2', category: 'lodging' });
    const itinerary = [
      event({ id: 'e1', date: '2026-06-10', placeId: 'p1', startTime: '18:00' }),
      event({ id: 'e2', date: '2026-06-10', placeId: 'p2', startTime: '09:00' }),
    ];
    const stays = getNightlyStays('2026-06-10', '2026-06-11', itinerary, [campground, hotel]);
    expect(stays[0].eventId).toBe('e2');
    expect(stays[0].place?.placeId).toBe('p2');
  });
});

describe('summarizeNightlyStays', () => {
  it('counts assigned/gap nights correctly', () => {
    const stays = [
      { date: '2026-06-10', place: place({ placeId: 'p1', category: 'campground' }), eventId: 'e1' },
      { date: '2026-06-11', place: null, eventId: null },
      { date: '2026-06-12', place: null, eventId: null },
    ];
    expect(summarizeNightlyStays(stays)).toEqual({
      totalNights: 3,
      assignedNights: 1,
      gapNights: ['2026-06-11', '2026-06-12'],
    });
  });
});
