import type { PackingCategory, PlaceCategory } from '../types';
import type { TripHistoryEntry } from './tripHistory';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Ledger (Wrapped-style recap stats) ──────────────────────────────────────

export interface TripHistoryLedger {
  totalTrips: number;
  totalNights: number;
  nightsByCategory: Partial<Record<PlaceCategory, number>>;
  totalTrailDistanceKm: number;
  totalElevationGainM: number;
  totalElevationLossM: number;
  longestTrail: { name: string; distanceKm: number; tripName: string } | null;
  mostVisitedLocation: { location: string; count: number } | null;
}

const EMPTY_LEDGER: TripHistoryLedger = {
  totalTrips: 0,
  totalNights: 0,
  nightsByCategory: {},
  totalTrailDistanceKm: 0,
  totalElevationGainM: 0,
  totalElevationLossM: 0,
  longestTrail: null,
  mostVisitedLocation: null,
};

export function computeTripHistoryLedger(entries: TripHistoryEntry[]): TripHistoryLedger {
  if (entries.length === 0) return EMPTY_LEDGER;

  let totalNights = 0;
  const nightsByCategory: Partial<Record<PlaceCategory, number>> = {};
  let totalTrailDistanceKm = 0;
  let totalElevationGainM = 0;
  let totalElevationLossM = 0;
  let longestTrail: TripHistoryLedger['longestTrail'] = null;
  const locationCounts = new Map<string, { display: string; count: number }>();

  for (const entry of entries) {
    totalNights += entry.totalNights;
    for (const [category, count] of Object.entries(entry.nightsByCategory) as [PlaceCategory, number][]) {
      nightsByCategory[category] = (nightsByCategory[category] ?? 0) + count;
    }
    for (const trail of entry.trails) {
      totalTrailDistanceKm += trail.distanceKm ?? 0;
      totalElevationGainM += trail.elevationGainM ?? 0;
      totalElevationLossM += trail.elevationLossM ?? 0;
      if (
        trail.distanceKm != null &&
        (!longestTrail ||
          trail.distanceKm > longestTrail.distanceKm ||
          (trail.distanceKm === longestTrail.distanceKm && trail.name < longestTrail.name))
      ) {
        longestTrail = { name: trail.name, distanceKm: trail.distanceKm, tripName: entry.name };
      }
    }
    if (entry.location?.trim()) {
      const key = entry.location.trim().toLowerCase();
      const existing = locationCounts.get(key);
      if (existing) existing.count += 1;
      else locationCounts.set(key, { display: entry.location.trim(), count: 1 });
    }
  }

  let mostVisitedLocation: TripHistoryLedger['mostVisitedLocation'] = null;
  let mostVisitedKey = '';
  for (const [key, { display, count }] of locationCounts) {
    if (!mostVisitedLocation || count > mostVisitedLocation.count || (count === mostVisitedLocation.count && key < mostVisitedKey)) {
      mostVisitedLocation = { location: display, count };
      mostVisitedKey = key;
    }
  }

  return {
    totalTrips: entries.length,
    totalNights,
    nightsByCategory,
    totalTrailDistanceKm: round1(totalTrailDistanceKm),
    totalElevationGainM: Math.round(totalElevationGainM),
    totalElevationLossM: Math.round(totalElevationLossM),
    longestTrail,
    mostVisitedLocation,
  };
}

// ── Life-list ────────────────────────────────────────────────────────────────

export interface LifeListPlace {
  key: string;
  name: string;
  category: PlaceCategory;
  location?: string;
  visitCount: number;
  lastVisitedDate: string;
}

export interface LifeListTrail {
  key: string;
  name: string;
  distanceKm?: number;
  visitCount: number;
  lastVisitedDate: string;
}

/**
 * Dedup key: TripPlace.placeId for places (stable Google Place ID, already used as the React key
 * elsewhere), Trail.osmId for trails, falling back to a normalized name for manually-entered trails
 * with no osmId (an acknowledged imperfect-dedup limitation for that case, not silently glossed over).
 * Grouping is generic over whatever PlaceCategory value is present, so new categories flow through
 * with zero changes here.
 */
export function computeLifeList(entries: TripHistoryEntry[]): { places: LifeListPlace[]; trails: LifeListTrail[] } {
  const placesByKey = new Map<string, LifeListPlace>();
  const trailsByKey = new Map<string, LifeListTrail>();

  for (const entry of entries) {
    const visitedDate = entry.endDate;

    for (const place of entry.places) {
      const existing = placesByKey.get(place.placeId);
      if (existing) {
        existing.visitCount += 1;
        if (visitedDate > existing.lastVisitedDate) existing.lastVisitedDate = visitedDate;
      } else {
        placesByKey.set(place.placeId, {
          key: place.placeId,
          name: place.name,
          category: place.category,
          ...(entry.location ? { location: entry.location } : {}),
          visitCount: 1,
          lastVisitedDate: visitedDate,
        });
      }
    }

    for (const trail of entry.trails) {
      const key = trail.osmId ?? `name:${trail.name.trim().toLowerCase()}`;
      const existing = trailsByKey.get(key);
      if (existing) {
        existing.visitCount += 1;
        if (visitedDate > existing.lastVisitedDate) existing.lastVisitedDate = visitedDate;
      } else {
        trailsByKey.set(key, {
          key,
          name: trail.name,
          ...(trail.distanceKm != null ? { distanceKm: trail.distanceKm } : {}),
          visitCount: 1,
          lastVisitedDate: visitedDate,
        });
      }
    }
  }

  return {
    places: Array.from(placesByKey.values()).sort((a, b) => b.lastVisitedDate.localeCompare(a.lastVisitedDate)),
    trails: Array.from(trailsByKey.values()).sort((a, b) => b.lastVisitedDate.localeCompare(a.lastVisitedDate)),
  };
}

// ── Packing / recipe suggestions ────────────────────────────────────────────

export interface PackingSuggestion {
  name: string;
  category: PackingCategory;
  count: number;
  lastUsedDate: string;
}

/** Empty query returns the top-N most-used items ("your usuals"); a non-empty query substring-filters first. */
export function suggestPackingItemNames(entries: TripHistoryEntry[], query: string, limit = 5): PackingSuggestion[] {
  const byKey = new Map<string, PackingSuggestion>();
  for (const entry of entries) {
    for (const item of entry.packingList) {
      const name = item.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        if (entry.endDate > existing.lastUsedDate) existing.lastUsedDate = entry.endDate;
      } else {
        byKey.set(key, { name, category: item.category, count: 1, lastUsedDate: entry.endDate });
      }
    }
  }

  let results = Array.from(byKey.values());
  const q = query.trim().toLowerCase();
  if (q) results = results.filter((r) => r.name.toLowerCase().includes(q));
  results.sort((a, b) => b.count - a.count || b.lastUsedDate.localeCompare(a.lastUsedDate) || a.name.localeCompare(b.name));
  return results.slice(0, limit);
}

export interface RecipeSuggestion {
  recipeName: string;
  recipeUrl?: string;
  ingredients?: { name: string; amount?: string }[];
  count: number;
  lastUsedDate: string;
}

export function suggestRecipeNames(entries: TripHistoryEntry[], query: string, limit = 5): RecipeSuggestion[] {
  const byKey = new Map<string, RecipeSuggestion>();
  for (const entry of entries) {
    for (const meal of entry.meals) {
      const recipeName = meal.recipeName?.trim();
      if (!recipeName) continue;
      const key = recipeName.toLowerCase();
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        if (entry.endDate > existing.lastUsedDate) existing.lastUsedDate = entry.endDate;
      } else {
        byKey.set(key, {
          recipeName,
          ...(meal.recipeUrl ? { recipeUrl: meal.recipeUrl } : {}),
          ...(meal.ingredients?.length ? { ingredients: meal.ingredients } : {}),
          count: 1,
          lastUsedDate: entry.endDate,
        });
      }
    }
  }

  let results = Array.from(byKey.values());
  const q = query.trim().toLowerCase();
  if (q) results = results.filter((r) => r.recipeName.toLowerCase().includes(q));
  results.sort(
    (a, b) => b.count - a.count || b.lastUsedDate.localeCompare(a.lastUsedDate) || a.recipeName.localeCompare(b.recipeName)
  );
  return results.slice(0, limit);
}
