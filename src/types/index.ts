/**
 * Trip types for the outdoor trip planner.
 * Use these when creating/editing a trip.
 */
export type TripType =
  | 'hiking'
  | 'camping'
  | 'backpacking'
  | 'surfing'
  | 'road tripping'
  | 'skiing'
  | 'fishing'
  | 'climbing'
  | 'biking';

/** All trip types in display order (single source of truth for UI). */
export const TRIP_TYPES: TripType[] = [
  'hiking',
  'camping',
  'backpacking',
  'surfing',
  'road tripping',
  'skiing',
  'fishing',
  'climbing',
  'biking',
];

export type TrailDifficulty = 'easy' | 'moderate' | 'hard';

/** Badge tone (see src/components/ui/Badge.tsx) for a trail difficulty — single source of truth so TripDetailScreen, TripMapScreen, and BrowseTrailsScreen don't each define their own difficulty→color mapping. */
export function trailDifficultyTone(diff?: TrailDifficulty): 'success' | 'warning' | 'danger' | 'neutral' {
  if (diff === 'easy') return 'success';
  if (diff === 'moderate') return 'warning';
  if (diff === 'hard') return 'danger';
  return 'neutral';
}

export interface TrailCoord {
  lat: number;
  lng: number;
}

export interface Trail {
  id: string;
  name: string;
  distanceKm?: number;
  difficulty?: TrailDifficulty;
  notes?: string;
  osmId?: string;
  /** Full polyline from OSM; absent for manually-entered trails. */
  geometry?: TrailCoord[];
  trailheadLat?: number;
  trailheadLng?: number;
  /** Cumulative elevation gain/loss in meters, computed from `geometry` via USGS 3DEP (see src/utils/elevationApi.ts). Absent until computed, or for manually-entered trails with no geometry to sample. */
  elevationGainM?: number;
  elevationLossM?: number;
}

export type PackingCategory = 'Shelter' | 'Clothing' | 'Food' | 'Other';

export interface PackingItem {
  id: string;
  name: string;
  category: PackingCategory;
  checked: boolean;
  quantity?: number;
  /** Names (or future user IDs) of people assigned to bring this item. */
  assignedTo?: string[];
  notes?: string;
}

export type PlaceCategory =
  | 'campground'
  | 'trail' // kept for backward compatibility — trails are now sourced from OSM/Overpass (see src/utils/elevationApi.ts, the Trail type) instead of Google Places, so this is no longer assigned to newly-added places
  | 'park'
  | 'beach'
  | 'viewpoint'
  | 'ski_resort'
  | 'restaurant'
  | 'lodging'
  | 'cafe'
  | 'bar'
  | 'tourist_attraction' // kept for backward compatibility
  | 'other';

export const PLACE_CATEGORIES: { label: string; value: PlaceCategory | 'all'; lucideIcon: string }[] = [
  { label: 'All', value: 'all', lucideIcon: 'map' },
  { label: 'Campgrounds', value: 'campground', lucideIcon: 'tent' },
  { label: 'Parks', value: 'park', lucideIcon: 'trees' },
  { label: 'Beaches', value: 'beach', lucideIcon: 'umbrella' },
  { label: 'Viewpoints', value: 'viewpoint', lucideIcon: 'mountain' },
  { label: 'Ski Resorts', value: 'ski_resort', lucideIcon: 'snowflake' },
  { label: 'Restaurants', value: 'restaurant', lucideIcon: 'utensils' },
  { label: 'Lodging', value: 'lodging', lucideIcon: 'bed' },
];

/** Lucide icon name for a place category, falling back to a generic pin for categories not in PLACE_CATEGORIES (cafe, bar, tourist_attraction, other). */
export function placeCategoryIcon(category: PlaceCategory): string {
  const fallbacks: Partial<Record<PlaceCategory, string>> = {
    cafe: 'coffee',
    bar: 'wine',
    tourist_attraction: 'landmark',
    trail: 'signpost',
    other: 'map-pin',
  };
  return PLACE_CATEGORIES.find((c) => c.value === category)?.lucideIcon ?? fallbacks[category] ?? 'map-pin';
}

/**
 * Structured facility data pulled from the official RIDB API when a place is added via a
 * pasted recreation.gov campground link (see functions/src/index.ts's recreationGovLookup,
 * ARCHITECTURE.md). Only `description` is AI-summarized — every other field
 * is RIDB data passed through as-is, not extracted/guessed by a model.
 */
export interface RecreationGovInfo {
  facilityId: string;
  description?: string;
  /** e.g. "Campground", "Day Use Area". */
  facilityType?: string;
  activities?: string[];
  feeDescription?: string;
  stayLimit?: string;
  adaAccess?: string;
  reservable?: boolean;
  reservationUrl?: string;
  directions?: string;
  phone?: string;
  sourceUrl: string;
}

/** A place (restaurant, hotel, attraction, etc.) saved to a trip. */
export interface TripPlace {
  placeId: string;
  name: string;
  address: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  rating?: number;
  userRatingsTotal?: number;
  photoUrl?: string;
  addedAt: string;
  notes?: string;
  /** Present only for places added via the recreation.gov link paste flow. */
  recreationGov?: RecreationGovInfo;
}

export type TransportMode = 'walk' | 'bike' | 'car' | 'transit' | 'fly';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';

export interface MealIngredient {
  id: string;
  name: string;
  amount?: string;         // e.g. "2 cups", "300 g"
  assigneeUids?: string[]; // collaborator UIDs who bring this ingredient
  checked?: boolean;       // whether this ingredient has been packed/brought
}

export interface DayMeal {
  id: string;
  date: string;            // "YYYY-MM-DD"
  slot: MealSlot;
  recipeName?: string;
  recipeUrl?: string;
  ingredients?: MealIngredient[];
  assigneeUids?: string[]; // who is cooking overall
  notes?: string;
}

export interface ItineraryEvent {
  id: string;
  date: string;              // "YYYY-MM-DD"
  title: string;
  startTime?: string;        // "HH:MM" 24h
  endTime?: string;
  placeId?: string;          // references TripPlace.placeId
  trailId?: string;          // references Trail.id
  transport?: TransportMode;
  meal?: MealSlot;
  mealAssignees?: string[];  // collaborator UIDs
  packingItemIds?: string[]; // references PackingItem.id
  notes?: string;
}

export interface Trip {
  id: string;
  name: string;
  startDate: string; // ISO date string
  endDate: string;
  type: TripType;
  location?: string; // optional, e.g. "Yosemite"
  packingList: PackingItem[];
  /** Places (restaurants, hotels, attractions, etc.) saved to this trip. */
  places?: TripPlace[];
  /** Ordered list of trails for the trip itinerary. */
  trails?: Trail[];
  notes: string;
  /** Day-by-day itinerary events for this trip. */
  itinerary?: ItineraryEvent[];
  /** Planned meals per day (breakfast/lunch/dinner/snack). */
  meals?: DayMeal[];
  createdAt: string; // ISO string
  updatedAt: string;
  // ── Collaboration fields (set by Firestore hook) ──────────────────────────
  /** UID of the user who created the trip. */
  ownerUid: string;
  /** UIDs of all users who can access this trip (includes ownerUid). Used in Firestore security rules. */
  collaboratorUids: string[];
  /** Maps each collaborator's UID to their display name. */
  collaborators: Record<string, string>;
  /** 8-char (6-char for older trips) code shared to invite others to this trip. */
  inviteCode: string;
}

// ── Trip history ──────────────────────────────────────────────────────────────

/** Packing item as retained in trip history — trimmed of id/checked/quantity/assignedTo/notes. */
export interface HistoryPackingItem {
  name: string;
  category: PackingCategory;
}

/** Meal as retained in trip history — trimmed of id/date/assigneeUids/checked/notes. */
export interface HistoryMeal {
  slot: MealSlot;
  recipeName?: string;
  recipeUrl?: string;
  ingredients?: { name: string; amount?: string }[];
}

/**
 * Condensed, privacy-trimmed record written to userTripHistory/{uid}/entries/{tripId} the moment a
 * user leaves an already-archived trip (see useFirestoreTrips.ts's deleteTrip). Deliberately omits
 * collaborators, collaboratorUids, ownerUid, inviteCode, and the raw itinerary — this is the leaving
 * user's own personal record, not a trip backup, so it shouldn't retain other collaborators' names or
 * assignment data. A trip the user is still a collaborator on never gets one of these — it's read live
 * instead (see src/utils/tripHistory.ts).
 */
export interface TripHistorySnapshot {
  tripId: string;
  name: string;
  startDate: string;
  endDate: string;
  type: TripType;
  location?: string;
  places: TripPlace[];
  trails: Trail[];
  packingList: HistoryPackingItem[];
  meals: HistoryMeal[];
  nightsByCategory: Partial<Record<PlaceCategory, number>>;
  totalNights: number;
  snapshottedAt: string; // ISO — when this snapshot was written, not the trip's own dates
}

// ── Chat ──────────────────────────────────────────────────────────────────────

/** A single message in the trip group chat (stored in trips/{tripId}/messages). */
export interface TripMessage {
  id: string;
  senderUid: string;
  senderName: string;
  text: string;
  createdAt: string; // ISO string, ascending order
}
