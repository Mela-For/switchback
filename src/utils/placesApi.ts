import type { PlaceCategory } from '../types';

const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

export interface GooglePlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  photos?: { photo_reference: string }[];
  types: string[];
}

/** Search places using the Google Places Text Search API. */
export async function searchPlaces(
  query: string,
  type: PlaceCategory | null,
  apiKey: string
): Promise<GooglePlaceResult[]> {
  const params: Record<string, string> = { query, key: apiKey };
  if (type && type !== 'other') params.type = type;

  const url = `${BASE_URL}/textsearch/json?${new URLSearchParams(params)}`;
  const response = await fetch(url);
  const json = await response.json();

  if (json.status === 'REQUEST_DENIED') {
    throw new Error(`API key error: ${json.error_message ?? 'Request denied. Check your Places API key.'}`);
  }
  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API error: ${json.status}`);
  }
  return (json.results ?? []) as GooglePlaceResult[];
}

/**
 * Searches all place categories in parallel and merges the results.
 *
 * Instead of using the `type` parameter (which finds places *named* like the
 * query), we prefix each search with the category name so the API finds
 * places *within* the location — e.g. "restaurants in San Francisco".
 */
export async function searchAllTypes(
  query: string,
  apiKey: string
): Promise<GooglePlaceResult[]> {
  const typeQueries = [
    'campgrounds in',
    'national parks and state parks in',
    'beaches in',
    'scenic overlooks and viewpoints in',
    'ski resorts in',
    'restaurants in',
    'hotels and lodging in',
  ];
  const searches = await Promise.allSettled(
    typeQueries.map((prefix) => searchPlaces(`${prefix} ${query}`, null, apiKey))
  );

  // If every sub-search failed (e.g. bad API key, billing not enabled, quota
  // exceeded), surface that error instead of silently returning zero results.
  const failures = searches.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  );
  if (failures.length === searches.length) {
    throw failures[0].reason instanceof Error
      ? failures[0].reason
      : new Error('Search failed. Please try again.');
  }

  const seen = new Set<string>();
  const merged: GooglePlaceResult[] = [];
  for (const result of searches) {
    if (result.status === 'fulfilled') {
      for (const place of result.value) {
        if (!seen.has(place.place_id)) {
          seen.add(place.place_id);
          merged.push(place);
        }
      }
    }
  }

  // Sort by rating desc, then review count desc
  merged.sort((a, b) => {
    const ra = a.rating ?? 0;
    const rb = b.rating ?? 0;
    if (rb !== ra) return rb - ra;
    return (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0);
  });

  return merged;
}

/** Returns the URL for a place photo (usable directly as an Image uri). */
export function getPhotoUrl(photoReference: string, apiKey: string, maxWidth = 400): string {
  return `${BASE_URL}/photo?maxwidth=${maxWidth}&photo_reference=${encodeURIComponent(photoReference)}&key=${apiKey}`;
}

/** Maps Google's types array to our simplified PlaceCategory. */
export function detectCategory(types: string[]): PlaceCategory {
  if (types.includes('campground')) return 'campground';
  if (types.includes('ski_resort')) return 'ski_resort';
  if (types.includes('beach')) return 'beach';
  if (types.includes('park') || types.includes('national_park')) return 'park';
  // 'trail' is intentionally not assigned here — trails are sourced from OSM/Overpass now, not Google Places (see Trail type / elevationApi.ts). natural_feature results (cliffs, summits, landmarks) read closest to 'viewpoint'.
  if (types.includes('natural_feature')) return 'viewpoint';
  if (types.includes('tourist_attraction')) return 'viewpoint';
  if (types.includes('restaurant') || types.includes('food')) return 'restaurant';
  if (types.includes('lodging')) return 'lodging';
  if (types.includes('cafe')) return 'cafe';
  if (types.includes('bar') || types.includes('night_club')) return 'bar';
  return 'other';
}

/** Opens a place in Google Maps (native app or browser). Requires a real Google Place ID. */
export function googleMapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

/**
 * Opens driving directions to a coordinate in Google Maps. Use this instead of googleMapsUrl()
 * for places that don't have a real Google Place ID — e.g. recreation.gov-sourced TripPlaces,
 * whose placeId is a synthetic `recgov_<facilityId>` string that Google's place_id lookup
 * would reject.
 */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

export interface AutocompleteSuggestion {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
}

/** Returns up to 5 autocomplete predictions as the user types. Fails silently. */
export async function getAutocompleteSuggestions(
  input: string,
  apiKey: string
): Promise<AutocompleteSuggestion[]> {
  const url = `${BASE_URL}/autocomplete/json?input=${encodeURIComponent(input)}&key=${apiKey}`;
  try {
    const response = await fetch(url);
    const json = await response.json();
    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') return [];
    return (json.predictions ?? []) as AutocompleteSuggestion[];
  } catch {
    return [];
  }
}

// ── Place Details ─────────────────────────────────────────────────────────────

export interface PlaceReview {
  author_name: string;
  rating: number;
  text: string;
  relative_time_description: string;
}

/** Full place details including reviews. Extends GooglePlaceResult. */
export interface PlaceDetails extends GooglePlaceResult {
  reviews?: PlaceReview[];
}

/** Fetches full place details (photos, reviews, geometry, etc.). */
export async function getPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<PlaceDetails> {
  const fields = 'place_id,name,formatted_address,geometry,rating,user_ratings_total,photos,types,reviews';
  const url = `${BASE_URL}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}`;
  const response = await fetch(url);
  const json = await response.json();
  if (json.status !== 'OK') throw new Error(`Place Details error: ${json.status}`);
  return json.result as PlaceDetails;
}

// ── Static Map ────────────────────────────────────────────────────────────────

/**
 * Returns a Google Static Maps image URL centered on the given coordinates.
 * Requires the "Maps Static API" to be enabled in Google Cloud Console
 * (same project as your Places API key).
 */
export function staticMapUrl(lat: number, lng: number, apiKey: string, zoom = 15): string {
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=600x300&markers=color:red|${lat},${lng}&key=${apiKey}`;
}

/**
 * Returns a Google Static Maps image URL showing up to 20 places as numbered
 * markers. The API auto-fits the viewport to include all markers.
 * Requires the "Maps Static API" to be enabled in Google Cloud Console.
 */
export function staticMapMultiUrl(
  locations: { lat: number; lng: number }[],
  apiKey: string,
): string {
  const MAX_MARKERS = 20;
  const shown = locations.slice(0, MAX_MARKERS);
  const parts: string[] = ['size=600x500'];
  shown.forEach((loc, i) => {
    parts.push(`markers=color:red|label:${i + 1}|${loc.lat},${loc.lng}`);
  });
  parts.push(`key=${apiKey}`);
  return `https://maps.googleapis.com/maps/api/staticmap?${parts.join('&')}`;
}
