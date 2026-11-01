import type { Trip, TripHistorySnapshot, HistoryPackingItem, HistoryMeal, PlaceCategory } from '../types';
import { getNightlyStays } from './overnightStays';

export interface TripHistoryEntry extends Omit<TripHistorySnapshot, 'snapshottedAt'> {
  source: 'live' | 'snapshot';
}

function computeNightsByCategory(
  trip: Trip
): { nightsByCategory: Partial<Record<PlaceCategory, number>>; totalNights: number } {
  const stays = getNightlyStays(trip.startDate, trip.endDate, trip.itinerary ?? [], trip.places ?? []);
  const nightsByCategory: Partial<Record<PlaceCategory, number>> = {};
  for (const stay of stays) {
    if (stay.place) {
      nightsByCategory[stay.place.category] = (nightsByCategory[stay.place.category] ?? 0) + 1;
    }
  }
  return { nightsByCategory, totalNights: stays.length };
}

function trimPackingList(packingList: Trip['packingList']): HistoryPackingItem[] {
  return packingList.map((item) => ({ name: item.name, category: item.category }));
}

function trimMeals(meals: Trip['meals']): HistoryMeal[] {
  return (meals ?? [])
    .filter((meal) => meal.recipeName?.trim())
    .map((meal) => ({
      slot: meal.slot,
      ...(meal.recipeName ? { recipeName: meal.recipeName } : {}),
      ...(meal.recipeUrl ? { recipeUrl: meal.recipeUrl } : {}),
      ...(meal.ingredients?.length
        ? { ingredients: meal.ingredients.map((i) => ({ name: i.name, ...(i.amount ? { amount: i.amount } : {}) })) }
        : {}),
    }));
}

/**
 * Builds the trimmed, privacy-conscious record written to userTripHistory/{uid}/entries/{tripId} the
 * moment a user leaves an already-archived trip. Places/trails carry no other-collaborator data and
 * are copied as-is; packingList/meals are the two fields that do (assignedTo/assigneeUids), so those
 * are the two trimmed down to their minimum useful shape.
 */
export function buildTripHistorySnapshot(trip: Trip): Omit<TripHistorySnapshot, 'snapshottedAt'> {
  const { nightsByCategory, totalNights } = computeNightsByCategory(trip);
  return {
    tripId: trip.id,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    type: trip.type,
    ...(trip.location ? { location: trip.location } : {}),
    places: trip.places ?? [],
    trails: trip.trails ?? [],
    packingList: trimPackingList(trip.packingList),
    meals: trimMeals(trip.meals),
    nightsByCategory,
    totalNights,
  };
}

/** A live archived trip, mapped down to the same shape as a snapshot for uniform aggregation. */
export function tripToHistoryEntry(trip: Trip): TripHistoryEntry {
  return { ...buildTripHistorySnapshot(trip), source: 'live' };
}

export function snapshotToHistoryEntry(snapshot: TripHistorySnapshot): TripHistoryEntry {
  const { snapshottedAt: _snapshottedAt, ...rest } = snapshot;
  return { ...rest, source: 'snapshot' };
}

/**
 * Archived trips still live in `trips` (read live, so edits after the fact are reflected) and
 * snapshots in `userTripHistory` (written once, the moment a user left) are mutually exclusive by
 * construction — a snapshot only ever gets created the instant a trip leaves the live query results
 * — so this is a plain concatenation, not a dedup.
 */
export function mergeTripHistory(archivedTrips: Trip[], snapshots: TripHistorySnapshot[]): TripHistoryEntry[] {
  return [...archivedTrips.map(tripToHistoryEntry), ...snapshots.map(snapshotToHistoryEntry)];
}
