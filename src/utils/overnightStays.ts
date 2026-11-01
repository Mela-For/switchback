import type { ItineraryEvent, PlaceCategory, TripPlace } from '../types';
import { generateTripDays } from './dateUtils';

/** Place categories that count as an overnight stay for the nightly-sleeping summary. */
export const OVERNIGHT_CATEGORIES: PlaceCategory[] = ['campground', 'lodging'];

export function isOvernightCategory(category: PlaceCategory): boolean {
  return OVERNIGHT_CATEGORIES.includes(category);
}

/** A trip's "nights" are every day in its range except the last (checkout/departure day). */
export function getTripNights(startDate: string, endDate: string): string[] {
  return generateTripDays(startDate, endDate).slice(0, -1);
}

export interface NightlyStay {
  date: string;
  /** The resolved overnight place for this night, or null if none is assigned yet. */
  place: TripPlace | null;
  /** The itinerary event that established this stay, or null if unassigned. */
  eventId: string | null;
}

/**
 * Joins a trip's itinerary events to its places to derive, for each night of the trip,
 * which overnight-category place (if any) the group is staying at.
 */
export function getNightlyStays(
  startDate: string,
  endDate: string,
  itinerary: ItineraryEvent[],
  places: TripPlace[]
): NightlyStay[] {
  const placesById = new Map(places.map((p) => [p.placeId, p]));

  return getTripNights(startDate, endDate).map((date) => {
    const overnightEvents = itinerary
      .filter((e) => e.date === date && e.placeId && placesById.has(e.placeId))
      .filter((e) => isOvernightCategory(placesById.get(e.placeId!)!.category))
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));

    const stayEvent = overnightEvents[0];
    return {
      date,
      place: stayEvent ? placesById.get(stayEvent.placeId!) ?? null : null,
      eventId: stayEvent?.id ?? null,
    };
  });
}

export interface NightlyStaysSummary {
  totalNights: number;
  assignedNights: number;
  gapNights: string[];
}

export function summarizeNightlyStays(stays: NightlyStay[]): NightlyStaysSummary {
  const gapNights = stays.filter((s) => !s.place).map((s) => s.date);
  return {
    totalNights: stays.length,
    assignedNights: stays.length - gapNights.length,
    gapNights,
  };
}
