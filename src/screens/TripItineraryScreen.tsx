import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import type {
  ItineraryEvent,
  TransportMode,
  MealSlot,
  TripPlace,
  Trail,
  DayMeal,
  MealIngredient,
} from '../types';
import { placeCategoryIcon } from '../types';
import { colors, fontFamily, radii, shadows, spacing, typography } from '../constants/theme';
import { useTripsContext } from '../context/TripsContext';
import { useTripHistoryContext } from '../context/TripHistoryContext';
import { suggestRecipeNames } from '../utils/tripHistoryStats';
import SuggestionInput from '../components/SuggestionInput';
import { toDateString, formatDayChip, generateTripDays, formatDayHeading } from '../utils/dateUtils';
import { isOvernightCategory } from '../utils/overnightStays';
import {
  getAutocompleteSuggestions,
  getPlaceDetails,
  detectCategory,
  getPhotoUrl,
  type AutocompleteSuggestion,
} from '../utils/placesApi';
import { GOOGLE_PLACES_API_KEY } from '../config/googlePlaces';
import { geocodeLocation, searchTrails } from '../utils/overpassApi';
import { getTrailElevation, mergeElevationIntoTrails } from '../utils/elevationApi';
import { formatMiles, formatFeet } from '../utils/units';
import { logger } from '../utils/logger';
import { openExternalUrl } from '../utils/safeUrl';
import { Icon, IconButton, Tag, type IconName } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'TripItinerary'>;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Strip undefined values from an event object so Firestore doesn't reject them. */
function sanitizeEvent(e: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined));
}

/** Format "HH:MM" to "9:30 AM" */
function formatTime(t?: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

const TRANSPORT_OPTIONS: { value: TransportMode; label: string; icon: IconName }[] = [
  { value: 'walk', label: 'Walk', icon: 'footprints' },
  { value: 'bike', label: 'Bike', icon: 'bike' },
  { value: 'car', label: 'Car', icon: 'car' },
  { value: 'transit', label: 'Transit', icon: 'bus' },
  { value: 'fly', label: 'Fly', icon: 'plane' },
];

const MEAL_OPTIONS: { value: MealSlot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'dessert', label: 'Dessert' },
];

// ── blank factories & sanitizers ──────────────────────────────────────────────

function blankMeal(date: string, slot: MealSlot): Omit<DayMeal, 'id'> {
  return { date, slot, recipeName: '', recipeUrl: '', ingredients: [], assigneeUids: [], notes: '' };
}

/** Strip undefined from a DayMeal (including nested ingredient objects). */
function sanitizeMeal(m: Record<string, unknown>): Record<string, unknown> {
  const result = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined));
  if (Array.isArray(result.ingredients)) {
    result.ingredients = (result.ingredients as Record<string, unknown>[]).map((ing) =>
      Object.fromEntries(Object.entries(ing).filter(([, v]) => v !== undefined))
    );
  }
  return result;
}

/** True if a DayMeal has nothing beyond what an event's meal tag would sync in (recipeName/assignees) —
 * safe to delete outright when the event that put it there moves away, rather than leaving a stale entry. */
function isMealAutoSyncedOnly(m: DayMeal): boolean {
  return !m.recipeUrl && !(m.ingredients && m.ingredients.length > 0) && !m.notes;
}

// ── blank event factory ───────────────────────────────────────────────────────

function blankEvent(date: string): Omit<ItineraryEvent, 'id'> {
  return {
    date,
    title: '',
    startTime: undefined,
    endTime: undefined,
    placeId: undefined,
    trailId: undefined,
    transport: undefined,
    meal: undefined,
    mealAssignees: [],
    packingItemIds: [],
    notes: '',
  };
}

// ── main screen ───────────────────────────────────────────────────────────────

export default function TripItineraryScreen({ route }: Props) {
  const { tripId, initialDate, openAddEvent: autoOpenAddEvent } = route.params;
  const { trips, updateTrip } = useTripsContext();
  const { entries: historyEntries } = useTripHistoryContext();

  const trip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [trips, tripId]);

  // Always-current trip, for the background elevation backfill below (which resolves after
  // this component may have re-rendered several times, so a captured closure would be stale)
  const tripRef = useRef(trip);
  useEffect(() => { tripRef.current = trip; }, [trip]);

  const tripDays = useMemo(
    () => (trip ? generateTripDays(trip.startDate, trip.endDate) : []),
    [trip]
  );

  // Default selected day: initialDate param, or today if in range, or first day
  const defaultDay = useMemo(() => {
    if (!tripDays.length) return '';
    const today = toDateString(new Date());
    if (initialDate && tripDays.includes(initialDate)) return initialDate;
    if (tripDays.includes(today)) return today;
    return tripDays[0];
  }, [tripDays, initialDate]);

  const [selectedDay, setSelectedDay] = useState(defaultDay);

  const dayScrollRef = useRef<ScrollView>(null);

  // Events for selected day, sorted by startTime
  const dayEvents = useMemo(() => {
    if (!trip?.itinerary) return [];
    return [...(trip.itinerary.filter((e) => e.date === selectedDay))].sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [trip?.itinerary, selectedDay]);

  // ── event form state ──────────────────────────────────────────────────────

  const [formVisible, setFormVisible] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<ItineraryEvent, 'id'>>(blankEvent(selectedDay));
  // Snapshot of the event's date/meal at the moment editing began, so saveEvent can tell
  // whether its meal tag moved off its previous day/slot and needs to vacate that slot.
  const [editingOriginal, setEditingOriginal] = useState<{ date: string; meal?: MealSlot } | null>(null);

  const [pickingStart, setPickingStart] = useState(false);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [pickingEventDate, setPickingEventDate] = useState(false);
  const [startTimeDraft, setStartTimeDraft] = useState(new Date());
  const [endTimeDraft, setEndTimeDraft] = useState(new Date());

  // Place picker sub-modal
  const [placePickerVisible, setPlacePickerVisible] = useState(false);
  const [placeSearch, setPlaceSearch] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [addingPlace, setAddingPlace] = useState(false);
  const placeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trail picker sub-modal
  const [trailPickerVisible, setTrailPickerVisible] = useState(false);
  const [trailSearch, setTrailSearch] = useState('');
  const [trailLocation, setTrailLocation] = useState(trip?.location ?? '');
  const [trailGeocodedCoords, setTrailGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [trailSuggestions, setTrailSuggestions] = useState<Trail[]>([]);
  const [searchingTrail, setSearchingTrail] = useState(false);
  const trailGeoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailSuggestAbortRef = useRef<AbortController | null>(null);

  // Meal planning
  const [mealFormVisible, setMealFormVisible] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealDraft, setMealDraft] = useState<Omit<DayMeal, 'id'>>(blankMeal(selectedDay, 'breakfast'));
  const [pickingMealDate, setPickingMealDate] = useState(false);

  // Track keyboard height so picker overlays (position:absolute) stay above the keyboard
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const onHide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  // Geocode trailLocation so OSM trail search has a coordinate anchor
  useEffect(() => {
    if (trailGeoDebounceRef.current) clearTimeout(trailGeoDebounceRef.current);
    const loc = trailLocation.trim();
    if (loc.length < 2) { setTrailGeocodedCoords(null); return; }
    trailGeoDebounceRef.current = setTimeout(async () => {
      const coords = await geocodeLocation(loc);
      setTrailGeocodedCoords(coords);
    }, 600);
    return () => { if (trailGeoDebounceRef.current) clearTimeout(trailGeoDebounceRef.current); };
  }, [trailLocation]);

  // Search OSM trails as the name input changes
  useEffect(() => {
    if (trailSuggestDebounceRef.current) clearTimeout(trailSuggestDebounceRef.current);
    const q = trailSearch.trim();
    if (q.length < 3 || !trailGeocodedCoords) { setTrailSuggestions([]); return; }
    trailSuggestDebounceRef.current = setTimeout(async () => {
      trailSuggestAbortRef.current?.abort();
      const controller = new AbortController();
      trailSuggestAbortRef.current = controller;
      setSearchingTrail(true);
      try {
        const results = await searchTrails(q, trailGeocodedCoords.lat, trailGeocodedCoords.lng, undefined, controller.signal);
        setTrailSuggestions(results.slice(0, 6));
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.error('Trail autocomplete search failed', err);
        setTrailSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearchingTrail(false);
      }
    }, 500);
    return () => {
      if (trailSuggestDebounceRef.current) clearTimeout(trailSuggestDebounceRef.current);
      trailSuggestAbortRef.current?.abort();
    };
  }, [trailSearch, trailGeocodedCoords]);

  const openAddEvent = useCallback((date: string = selectedDay) => {
    setEditingEventId(null);
    setEditingOriginal(null);
    setDraft(blankEvent(date));
    setPickingStart(false);
    setPickingEnd(false);
    setPickingEventDate(false);
    setFormVisible(true);
  }, [selectedDay]);

  // Arriving here from the "Where We're Sleeping" screen's gap rows opens the add-event form
  // pre-filled with that night, instead of just jumping to the day like initialDate alone does.
  // Ref-guarded (not just an empty dep array) so it fires once for this navigation even though
  // openAddEvent's identity changes with selectedDay.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (autoOpenAddEvent && initialDate) {
      autoOpenedRef.current = true;
      openAddEvent(initialDate);
    }
  }, [autoOpenAddEvent, initialDate, openAddEvent]);

  const openEditEvent = useCallback((event: ItineraryEvent) => {
    setEditingEventId(event.id);
    setEditingOriginal({ date: event.date, meal: event.meal });
    setDraft({
      date: event.date,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      placeId: event.placeId,
      trailId: event.trailId,
      transport: event.transport,
      meal: event.meal,
      mealAssignees: event.mealAssignees ?? [],
      packingItemIds: event.packingItemIds ?? [],
      notes: event.notes ?? '',
    });
    setPickingStart(false);
    setPickingEnd(false);
    setPickingEventDate(false);
    setFormVisible(true);
  }, []);

  const saveEvent = useCallback(() => {
    if (!trip || !draft.title.trim()) {
      Alert.alert('Title required', 'Please enter a title for this event.');
      return;
    }
    const existing = trip.itinerary ?? [];
    let next: ItineraryEvent[];
    let savedEvent: ItineraryEvent;
    if (editingEventId) {
      savedEvent = sanitizeEvent({ ...draft, id: editingEventId }) as unknown as ItineraryEvent;
      next = existing.map((e) => (e.id === editingEventId ? savedEvent : e));
    } else {
      savedEvent = sanitizeEvent({ ...draft, id: `evt_${Date.now()}` }) as unknown as ItineraryEvent;
      next = [...existing, savedEvent];
    }

    let meals = trip.meals ?? [];
    let mealsChanged = false;

    // If this event's meal tag moved off the day/slot it was previously on, vacate that slot —
    // but only if nothing beyond the event's own sync (recipe/ingredients/notes) was added to it,
    // so we don't silently wipe out a meal plan the user has since customized by hand.
    if (
      editingOriginal?.meal &&
      (editingOriginal.date !== savedEvent.date || editingOriginal.meal !== savedEvent.meal)
    ) {
      const staleIdx = meals.findIndex((m) => m.date === editingOriginal.date && m.slot === editingOriginal.meal);
      if (staleIdx !== -1 && isMealAutoSyncedOnly(meals[staleIdx])) {
        meals = meals.filter((_, i) => i !== staleIdx);
        mealsChanged = true;
      }
    }

    if (savedEvent.meal) {
      const matchIdx = meals.findIndex((m) => m.date === savedEvent.date && m.slot === savedEvent.meal);
      if (matchIdx === -1) {
        const newMeal = sanitizeMeal({
          id: `meal_${Date.now()}`,
          date: savedEvent.date,
          slot: savedEvent.meal,
          recipeName: savedEvent.title,
          assigneeUids: savedEvent.mealAssignees ?? [],
        }) as unknown as DayMeal;
        meals = [...meals, newMeal];
      } else {
        meals = meals.map((m, i) =>
          i === matchIdx
            ? (sanitizeMeal({
                ...m,
                recipeName: savedEvent.title,
                assigneeUids: savedEvent.mealAssignees?.length ? savedEvent.mealAssignees : m.assigneeUids,
              }) as unknown as DayMeal)
            : m
        );
      }
      mealsChanged = true;
    }

    const updates: { itinerary: ItineraryEvent[]; meals?: DayMeal[] } = { itinerary: next };
    if (mealsChanged) updates.meals = meals;

    updateTrip(tripId, updates);
    setSelectedDay(savedEvent.date);
    setFormVisible(false);
  }, [trip, draft, editingEventId, editingOriginal, tripId, updateTrip]);

  const deleteEvent = useCallback((eventId: string) => {
    Alert.alert('Delete event', 'Remove this event from the itinerary?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!trip) return;
          const deleted = (trip.itinerary ?? []).find((e) => e.id === eventId);
          const next = (trip.itinerary ?? []).filter((e) => e.id !== eventId);
          const updates: { itinerary: ItineraryEvent[]; meals?: DayMeal[] } = { itinerary: next };
          if (deleted?.meal) {
            const meals = trip.meals ?? [];
            const staleIdx = meals.findIndex((m) => m.date === deleted.date && m.slot === deleted.meal);
            if (staleIdx !== -1 && isMealAutoSyncedOnly(meals[staleIdx])) {
              updates.meals = meals.filter((_, i) => i !== staleIdx);
            }
          }
          updateTrip(tripId, updates);
          setFormVisible(false);
        },
      },
    ]);
  }, [trip, tripId, updateTrip]);

  // ── place search ──────────────────────────────────────────────────────────

  const handlePlaceSearchChange = useCallback((text: string) => {
    setPlaceSearch(text);
    if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current);
    if (text.trim().length < 2 || GOOGLE_PLACES_API_KEY === 'YOUR_PLACES_API_KEY') {
      setPlaceSuggestions([]);
      return;
    }
    placeDebounceRef.current = setTimeout(async () => {
      const results = await getAutocompleteSuggestions(text.trim(), GOOGLE_PLACES_API_KEY);
      setPlaceSuggestions(results.slice(0, 5));
    }, 300);
  }, []);

  const handleSelectSuggestion = useCallback(async (suggestion: AutocompleteSuggestion) => {
    if (!trip) return;
    // Check if already in trip.places
    const existing = (trip.places ?? []).find((p) => p.placeId === suggestion.place_id);
    if (existing) {
      setDraft((d) => ({ ...d, placeId: suggestion.place_id }));
      setPlacePickerVisible(false);
      setPlaceSearch('');
      setPlaceSuggestions([]);
      return;
    }
    // Fetch full details and add to trip
    setAddingPlace(true);
    try {
      const details = await getPlaceDetails(suggestion.place_id, GOOGLE_PLACES_API_KEY);
      const photoUrl =
        details.photos?.[0]
          ? getPhotoUrl(details.photos[0].photo_reference, GOOGLE_PLACES_API_KEY)
          : undefined;
      const newPlace: TripPlace = {
        placeId: details.place_id,
        name: details.name,
        address: details.formatted_address,
        category: detectCategory(details.types),
        lat: details.geometry.location.lat,
        lng: details.geometry.location.lng,
        rating: details.rating,
        userRatingsTotal: details.user_ratings_total,
        photoUrl,
        addedAt: new Date().toISOString(),
      };
      const nextPlaces = [...(trip.places ?? []), newPlace];
      await updateTrip(tripId, { places: nextPlaces });
      setDraft((d) => ({ ...d, placeId: details.place_id }));
    } catch {
      Alert.alert('Error', 'Could not fetch place details. Please try again.');
    } finally {
      setAddingPlace(false);
      setPlacePickerVisible(false);
      setPlaceSearch('');
      setPlaceSuggestions([]);
    }
  }, [trip, tripId, updateTrip]);

  // ── trail search ──────────────────────────────────────────────────────────

  // Backfills elevation (USGS 3DEP) after a trail is added here — this picker adds
  // immediately with no preview step, so elevation is always computed in the background
  // rather than blocking the pick. See BrowseTrailsScreen for the same pattern.
  const enrichTrailElevation = useCallback(async (trail: Trail) => {
    const stats = await getTrailElevation(trail);
    if (!stats) return;
    const currentTrip = tripRef.current;
    if (!currentTrip?.trails?.some((t) => t.id === trail.id)) return; // removed before elevation resolved
    updateTrip(tripId, { trails: mergeElevationIntoTrails(currentTrip.trails, trail.id, stats) });
  }, [tripId, updateTrip]);

  const handleSelectTrailSuggestion = useCallback(async (trail: Trail) => {
    if (!trip) return;
    const alreadyAdded = (trip.trails ?? []).some((t) => t.id === trail.id);
    if (!alreadyAdded) {
      await updateTrip(tripId, { trails: [...(trip.trails ?? []), trail] });
      if (trail.elevationGainM == null) void enrichTrailElevation(trail);
    }
    setDraft((d) => ({ ...d, trailId: trail.id }));
    setTrailPickerVisible(false);
    setTrailSearch('');
    setTrailSuggestions([]);
  }, [trip, tripId, updateTrip, enrichTrailElevation]);

  // ── packing item toggle ───────────────────────────────────────────────────

  const togglePackingItem = useCallback((itemId: string) => {
    setDraft((d) => {
      const ids = d.packingItemIds ?? [];
      const next = ids.includes(itemId) ? ids.filter((i) => i !== itemId) : [...ids, itemId];
      return { ...d, packingItemIds: next };
    });
  }, []);

  // ── meal assignee toggle ──────────────────────────────────────────────────

  const toggleMealAssignee = useCallback((uid: string) => {
    setDraft((d) => {
      const ids = d.mealAssignees ?? [];
      const next = ids.includes(uid) ? ids.filter((i) => i !== uid) : [...ids, uid];
      return { ...d, mealAssignees: next };
    });
  }, []);

  // ── day-meal planning ─────────────────────────────────────────────────────

  const openAddMeal = useCallback((slot: MealSlot) => {
    setEditingMealId(null);
    setMealDraft(blankMeal(selectedDay, slot));
    setPickingMealDate(false);
    setMealFormVisible(true);
  }, [selectedDay]);

  const openEditMeal = useCallback((meal: DayMeal) => {
    setEditingMealId(meal.id);
    setMealDraft({
      date: meal.date,
      slot: meal.slot,
      recipeName: meal.recipeName ?? '',
      recipeUrl: meal.recipeUrl ?? '',
      ingredients: meal.ingredients ?? [],
      assigneeUids: meal.assigneeUids ?? [],
      notes: meal.notes ?? '',
    });
    setPickingMealDate(false);
    setMealFormVisible(true);
  }, []);

  const saveMeal = useCallback(() => {
    if (!trip) return;
    const existing = trip.meals ?? [];
    let next: DayMeal[];
    let savedMeal: DayMeal;
    if (editingMealId) {
      savedMeal = sanitizeMeal({ ...mealDraft, id: editingMealId }) as unknown as DayMeal;
      next = existing.map((m) => (m.id === editingMealId ? savedMeal : m));
    } else {
      savedMeal = sanitizeMeal({ ...mealDraft, id: `meal_${Date.now()}` }) as unknown as DayMeal;
      next = [...existing, savedMeal];
    }
    updateTrip(tripId, { meals: next });
    setSelectedDay(savedMeal.date);
    setMealFormVisible(false);
  }, [trip, mealDraft, editingMealId, tripId, updateTrip]);

  const deleteMeal = useCallback((mealId: string) => {
    Alert.alert('Delete meal', 'Remove this meal plan?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!trip) return;
          updateTrip(tripId, { meals: (trip.meals ?? []).filter((m) => m.id !== mealId) });
          setMealFormVisible(false);
        },
      },
    ]);
  }, [trip, tripId, updateTrip]);

  const addIngredient = useCallback(() => {
    const ing: MealIngredient = { id: `ing_${Date.now()}`, name: '', assigneeUids: [] };
    setMealDraft((d) => ({ ...d, ingredients: [...(d.ingredients ?? []), ing] }));
  }, []);

  // Suggestions from past trips' meals — only while actively typing, not shown at rest.
  const recipeSuggestions = useMemo(() => {
    if (!mealDraft.recipeName?.trim()) return [];
    return suggestRecipeNames(historyEntries, mealDraft.recipeName);
  }, [historyEntries, mealDraft.recipeName]);
  const recipeSuggestionByKey = useMemo(
    () => new Map(recipeSuggestions.map((s) => [s.recipeName.toLowerCase(), s])),
    [recipeSuggestions]
  );

  const handleSelectRecipeSuggestion = useCallback(
    (key: string) => {
      const suggestion = recipeSuggestionByKey.get(key);
      if (!suggestion) return;
      setMealDraft((d) => ({
        ...d,
        recipeName: suggestion.recipeName,
        recipeUrl: suggestion.recipeUrl ?? '',
        ingredients: (suggestion.ingredients ?? []).map((ing, idx) => ({
          id: `ing_${Date.now()}_${idx}`,
          name: ing.name,
          ...(ing.amount ? { amount: ing.amount } : {}),
          assigneeUids: [],
        })),
      }));
    },
    [recipeSuggestionByKey]
  );

  const updateIngredient = useCallback((id: string, patch: Partial<MealIngredient>) => {
    setMealDraft((d) => ({
      ...d,
      ingredients: (d.ingredients ?? []).map((ing) => ing.id === id ? { ...ing, ...patch } : ing),
    }));
  }, []);

  const removeIngredient = useCallback((id: string) => {
    setMealDraft((d) => ({ ...d, ingredients: (d.ingredients ?? []).filter((ing) => ing.id !== id) }));
  }, []);

  const toggleIngredientAssignee = useCallback((ingredientId: string, uid: string) => {
    setMealDraft((d) => ({
      ...d,
      ingredients: (d.ingredients ?? []).map((ing) => {
        if (ing.id !== ingredientId) return ing;
        const uids = ing.assigneeUids ?? [];
        return { ...ing, assigneeUids: uids.includes(uid) ? uids.filter((u) => u !== uid) : [...uids, uid] };
      }),
    }));
  }, []);

  const toggleDayMealAssignee = useCallback((uid: string) => {
    setMealDraft((d) => {
      const uids = d.assigneeUids ?? [];
      return { ...d, assigneeUids: uids.includes(uid) ? uids.filter((u) => u !== uid) : [...uids, uid] };
    });
  }, []);

  if (!trip) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Trip not found.</Text>
      </View>
    );
  }

  const selectedPlace = draft.placeId
    ? (trip.places ?? []).find((p) => p.placeId === draft.placeId)
    : null;

  const selectedTrail = draft.trailId
    ? (trip.trails ?? []).find((t) => t.id === draft.trailId)
    : null;

  const dayMeals = (trip.meals ?? []).filter((m) => m.date === selectedDay);
  const dayMealsBySlot = Object.fromEntries(dayMeals.map((m) => [m.slot, m])) as Partial<Record<MealSlot, DayMeal>>;

  const collaboratorEntries = Object.entries(trip.collaborators ?? {});

  return (
    <View style={styles.container}>
      {/* ── Day strip ──────────────────────────────────────────────── */}
      <View style={styles.dayStripWrapper}>
        <ScrollView
          ref={dayScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayStrip}
        >
          {tripDays.map((day) => {
            const { dow, day: dayNum } = formatDayChip(day);
            const isSelected = day === selectedDay;
            const hasEvents = (trip.itinerary ?? []).some((e) => e.date === day);
            return (
              <Pressable
                key={day}
                style={[styles.dayChip, isSelected && styles.dayChipSelected]}
                onPress={() => setSelectedDay(day)}
              >
                <Text style={[styles.dayChipDow, isSelected && styles.dayChipTextSelected]}>
                  {dow}
                </Text>
                <Text style={[styles.dayChipNum, isSelected && styles.dayChipTextSelected]}>
                  {dayNum}
                </Text>
                {hasEvents && (
                  <View style={[styles.dayDot, isSelected && styles.dayDotSelected]} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Day heading ────────────────────────────────────────────── */}
      <View style={styles.dayHeading}>
        <Text style={styles.dayHeadingText}>{formatDayHeading(selectedDay)}</Text>
        <Text style={styles.dayHeadingCount}>
          {dayEvents.length === 0
            ? 'No events'
            : `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* ── Day content ────────────────────────────────────────────── */}
      <ScrollView style={styles.eventList} contentContainerStyle={styles.eventListContent}>

        {/* ── Meals section ──────────────────────────────────────── */}
        <View style={styles.daySectionHeader}>
          <Text style={styles.daySectionTitle}>Meals</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mealSlotRow}
        >
          {MEAL_OPTIONS.map(({ value, label }) => {
            const meal = dayMealsBySlot[value];
            return (
              <Pressable
                key={value}
                style={[styles.mealSlotChip, meal && styles.mealSlotChipFilled]}
                onPress={() => meal ? openEditMeal(meal) : openAddMeal(value)}
              >
                <Text style={[styles.mealSlotLabel, meal && styles.mealSlotLabelFilled]}>{label}</Text>
                {meal?.recipeName
                  ? <Text style={styles.mealSlotRecipe} numberOfLines={1}>{meal.recipeName}</Text>
                  : <Icon name="plus" size={14} color={meal ? colors.textInverse : colors.textSecondary} />
                }
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Events section ─────────────────────────────────────── */}
        <View style={styles.daySectionHeader}>
          <Text style={styles.daySectionTitle}>Events</Text>
        </View>
        {dayEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="calendar" size={40} color={colors.borderStrong} />
            <Text style={styles.emptyStateText}>No events for this day.</Text>
            <Text style={styles.emptyStateHint}>Tap &quot;Add event&quot; to plan your day.</Text>
          </View>
        ) : (
          dayEvents.map((event) => {
            const place = (trip.places ?? []).find((p) => p.placeId === event.placeId);
            const trail = (trip.trails ?? []).find((t) => t.id === event.trailId);
            const transport = TRANSPORT_OPTIONS.find((o) => o.value === event.transport);
            const packingCount = (event.packingItemIds ?? []).length;
            const isOvernight = !!place && isOvernightCategory(place.category);
            return (
              <Pressable
                key={event.id}
                style={[styles.eventCard, isOvernight && styles.eventCardOvernight]}
                onPress={() => openEditEvent(event)}
              >
                <View style={styles.eventCardLeft}>
                  <View style={styles.eventTimeDot}>
                    <View style={styles.eventDotCircle} />
                  </View>
                </View>
                <View style={styles.eventCardBody}>
                  {(event.startTime || event.endTime) && (
                    <Text style={styles.eventTime}>
                      {[formatTime(event.startTime), formatTime(event.endTime)]
                        .filter(Boolean)
                        .join(' – ')}
                    </Text>
                  )}
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <View style={styles.eventMeta}>
                    {place && (
                      <View style={styles.eventMetaChip}>
                        <Icon
                          name={(isOvernight ? placeCategoryIcon(place.category) : 'map-pin') as IconName}
                          size={13}
                          color={colors.textSecondary}
                        />
                        <Text style={styles.eventMetaText} numberOfLines={1}>{place.name}</Text>
                      </View>
                    )}
                    {trail && (
                      <View style={styles.eventMetaChip}>
                        <Icon name="map" size={13} color={colors.textSecondary} />
                        <Text style={styles.eventMetaText} numberOfLines={1}>{trail.name}</Text>
                      </View>
                    )}
                    {transport && (
                      <View style={styles.eventMetaChip}>
                        <Icon name={transport.icon} size={13} color={colors.textSecondary} />
                        <Text style={styles.eventMetaText}>{transport.label}</Text>
                      </View>
                    )}
                    {event.meal && (
                      <View style={styles.eventMetaChip}>
                        <Icon name="utensils" size={13} color={colors.textSecondary} />
                        <Text style={styles.eventMetaText}>{event.meal}</Text>
                      </View>
                    )}
                    {packingCount > 0 && (
                      <View style={styles.eventMetaChip}>
                        <Icon name="shopping-bag" size={13} color={colors.textSecondary} />
                        <Text style={styles.eventMetaText}>{packingCount} item{packingCount > 1 ? 's' : ''}</Text>
                      </View>
                    )}
                  </View>
                  {!!event.notes && (
                    <Text style={styles.eventNotes} numberOfLines={2}>{event.notes}</Text>
                  )}
                </View>
                <Icon name="chevron-right" size={18} color={colors.textTertiary} />
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* ── Add Event button ───────────────────────────────────────── */}
      <View style={styles.addBtnWrapper}>
        <Pressable style={styles.addBtn} onPress={() => openAddEvent()}>
          <Icon name="plus" size={22} color={colors.textInverse} />
          <Text style={styles.addBtnText}>Add event</Text>
        </Pressable>
      </View>

      {/* ── Event form modal ───────────────────────────────────────── */}
      <Modal visible={formVisible} animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.formHeader}>
            <Pressable onPress={() => setFormVisible(false)} hitSlop={12}>
              <Text style={styles.formHeaderCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.formHeaderTitle}>
              {editingEventId ? 'Edit event' : 'New event'}
            </Text>
            <Pressable onPress={saveEvent} hitSlop={12}>
              <Text style={styles.formHeaderSave}>Save</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title */}
            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput
              style={styles.fieldInput}
              value={draft.title}
              onChangeText={(t) => setDraft((d) => ({ ...d, title: t }))}
              placeholder="e.g. Arrive at campsite"
              placeholderTextColor={colors.textTertiary}
            />

            {/* Date */}
            <Text style={styles.fieldLabel}>Date</Text>
            <Pressable
              style={styles.pickerField}
              onPress={() => { setPickingEventDate(true); setPickingStart(false); setPickingEnd(false); }}
            >
              <Icon name="calendar" size={18} color={colors.textSecondary} />
              <Text style={styles.pickerFieldText}>{formatDayHeading(draft.date)}</Text>
            </Pressable>
            {pickingEventDate && (
              <View style={styles.pickerRow}>
                <DateTimePicker
                  value={new Date(draft.date.slice(0, 10) + 'T00:00:00')}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={new Date(trip.startDate.slice(0, 10) + 'T00:00:00')}
                  maximumDate={new Date(trip.endDate.slice(0, 10) + 'T00:00:00')}
                  onChange={(_, d) => {
                    if (d) setDraft((prev) => ({ ...prev, date: toDateString(d) }));
                    if (Platform.OS === 'android') setPickingEventDate(false);
                  }}
                />
                {Platform.OS === 'ios' && (
                  <Pressable onPress={() => setPickingEventDate(false)}>
                    <Text style={styles.pickerDone}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Time */}
            <Text style={styles.fieldLabel}>Time</Text>
            <View style={styles.timeRow}>
              <Pressable
                style={[styles.timeBtn, { flex: 1 }]}
                onPress={() => { setPickingStart(true); setPickingEnd(false); setPickingEventDate(false); }}
              >
                <Text style={styles.timeBtnLabel}>Start</Text>
                <Text style={styles.timeBtnValue}>
                  {draft.startTime ? formatTime(draft.startTime) : 'None'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.timeBtn, { flex: 1 }]}
                onPress={() => { setPickingEnd(true); setPickingStart(false); setPickingEventDate(false); }}
              >
                <Text style={styles.timeBtnLabel}>End</Text>
                <Text style={styles.timeBtnValue}>
                  {draft.endTime ? formatTime(draft.endTime) : 'None'}
                </Text>
              </Pressable>
              {(draft.startTime || draft.endTime) && (
                <Pressable
                  style={styles.clearTimeBtn}
                  onPress={() => setDraft((d) => ({ ...d, startTime: undefined, endTime: undefined }))}
                  hitSlop={8}
                >
                  <Icon name="circle-x" size={20} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
            {pickingStart && (
              <View style={styles.pickerRow}>
                <DateTimePicker
                  value={startTimeDraft}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => {
                    if (d) {
                      setStartTimeDraft(d);
                      const h = String(d.getHours()).padStart(2, '0');
                      const m = String(d.getMinutes()).padStart(2, '0');
                      setDraft((prev) => ({ ...prev, startTime: `${h}:${m}` }));
                    }
                    if (Platform.OS === 'android') setPickingStart(false);
                  }}
                />
                {Platform.OS === 'ios' && (
                  <Pressable onPress={() => setPickingStart(false)}>
                    <Text style={styles.pickerDone}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}
            {pickingEnd && (
              <View style={styles.pickerRow}>
                <DateTimePicker
                  value={endTimeDraft}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => {
                    if (d) {
                      setEndTimeDraft(d);
                      const h = String(d.getHours()).padStart(2, '0');
                      const m = String(d.getMinutes()).padStart(2, '0');
                      setDraft((prev) => ({ ...prev, endTime: `${h}:${m}` }));
                    }
                    if (Platform.OS === 'android') setPickingEnd(false);
                  }}
                />
                {Platform.OS === 'ios' && (
                  <Pressable onPress={() => setPickingEnd(false)}>
                    <Text style={styles.pickerDone}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Place */}
            <Text style={styles.fieldLabel}>Place</Text>
            <Pressable
              style={styles.pickerField}
              onPress={() => { setPlaceSearch(''); setPlaceSuggestions([]); setPlacePickerVisible(true); }}
            >
              <Icon name="map-pin" size={18} color={colors.textSecondary} />
              <Text style={[styles.pickerFieldText, !selectedPlace && styles.pickerFieldPlaceholder]}>
                {selectedPlace ? selectedPlace.name : 'Select or search a place'}
              </Text>
              {selectedPlace && (
                <Pressable onPress={() => setDraft((d) => ({ ...d, placeId: undefined }))} hitSlop={8}>
                  <Icon name="circle-x" size={18} color={colors.textSecondary} />
                </Pressable>
              )}
            </Pressable>

            {/* Transport */}
            <Text style={styles.fieldLabel}>Transport</Text>
            <View style={styles.chipRow}>
              {TRANSPORT_OPTIONS.map((opt) => (
                <Tag
                  key={opt.value}
                  icon={opt.icon}
                  selected={draft.transport === opt.value}
                  onPress={() =>
                    setDraft((d) => ({
                      ...d,
                      transport: d.transport === opt.value ? undefined : opt.value,
                    }))
                  }
                >
                  {opt.label}
                </Tag>
              ))}
            </View>

            {/* Trail */}
            <Text style={styles.fieldLabel}>Trail</Text>
            <Pressable style={styles.pickerField} onPress={() => setTrailPickerVisible(true)}>
              <Icon name="map" size={18} color={colors.textSecondary} />
              <Text style={[styles.pickerFieldText, !selectedTrail && styles.pickerFieldPlaceholder]}>
                {selectedTrail ? selectedTrail.name : 'Search or select a trail'}
              </Text>
              {selectedTrail && (
                <Pressable onPress={() => setDraft((d) => ({ ...d, trailId: undefined }))} hitSlop={8}>
                  <Icon name="circle-x" size={18} color={colors.textSecondary} />
                </Pressable>
              )}
            </Pressable>

            {/* Meal */}
            <Text style={styles.fieldLabel}>Meal</Text>
            <View style={styles.chipRow}>
              {MEAL_OPTIONS.map((opt) => (
                <Tag
                  key={opt.value}
                  selected={draft.meal === opt.value}
                  onPress={() =>
                    setDraft((d) => ({
                      ...d,
                      meal: d.meal === opt.value ? undefined : opt.value,
                      mealAssignees: d.meal === opt.value ? [] : d.mealAssignees,
                    }))
                  }
                >
                  {opt.label}
                </Tag>
              ))}
            </View>

            {/* Meal assignees */}
            {draft.meal && Object.keys(trip.collaborators ?? {}).length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Meal responsibility</Text>
                <View style={styles.chipRow}>
                  {Object.entries(trip.collaborators ?? {}).map(([uid, name]) => (
                    <Tag key={uid} selected={(draft.mealAssignees ?? []).includes(uid)} onPress={() => toggleMealAssignee(uid)}>
                      {name as string}
                    </Tag>
                  ))}
                </View>
              </>
            )}

            {/* Packing items */}
            {(trip.packingList ?? []).length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Packing items needed</Text>
                <Text style={styles.fieldHint}>Tag items from your packing list that are relevant to this event.</Text>
                {trip.packingList.map((item) => {
                  const selected = (draft.packingItemIds ?? []).includes(item.id);
                  return (
                    <Pressable key={item.id} style={styles.packingItemRow} onPress={() => togglePackingItem(item.id)}>
                      <Icon name={selected ? 'square-check' : 'square'} size={22} color={selected ? colors.primary : colors.textTertiary} />
                      <Text style={styles.packingItemName}>{item.name}</Text>
                      <Text style={styles.packingItemCat}>{item.category}</Text>
                    </Pressable>
                  );
                })}
              </>
            )}

            {/* Notes */}
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.fieldInput, styles.notesInput]}
              value={draft.notes}
              onChangeText={(t) => setDraft((d) => ({ ...d, notes: t }))}
              placeholder="Any details about this event..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Delete button (edit mode only) */}
            {editingEventId && (
              <Pressable style={styles.deleteBtn} onPress={() => deleteEvent(editingEventId)}>
                <Icon name="trash-2" size={18} color={colors.clay600} />
                <Text style={styles.deleteBtnText}>Delete event</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* ── Place picker — inline overlay inside this Modal ─────── */}
          {placePickerVisible && (
            <Pressable
              style={[styles.pickerOverlay, { bottom: kbHeight }]}
              onPress={() => { setPlacePickerVisible(false); setPlaceSearch(''); setPlaceSuggestions([]); }}
            >
              <Pressable style={styles.subModalBox} onPress={(e) => e.stopPropagation()}>
                <View style={styles.subModalHeader}>
                  <Text style={styles.subModalTitle}>Select a place</Text>
                  <IconButton
                    icon="x"
                    label="Close"
                    variant="ghost"
                    size="sm"
                    onPress={() => { setPlacePickerVisible(false); setPlaceSearch(''); setPlaceSuggestions([]); }}
                  />
                </View>

                {/* Single scrollable area — search first, saved places below */}
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <Text style={styles.subSection}>Search & add a new place</Text>
                  <TextInput
                    style={styles.placeSearchInput}
                    value={placeSearch}
                    onChangeText={handlePlaceSearchChange}
                    placeholder="Search for a place…"
                    placeholderTextColor={colors.textTertiary}
                    autoCorrect={false}
                    autoFocus={false}
                  />
                  {addingPlace && <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />}
                  {placeSuggestions.map((s) => (
                    <Pressable key={s.place_id} style={styles.suggestionRow} onPress={() => handleSelectSuggestion(s)}>
                      <Icon name="map-pin" size={16} color={colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestionMain} numberOfLines={1}>{s.structured_formatting.main_text}</Text>
                        {s.structured_formatting.secondary_text ? (
                          <Text style={styles.suggestionSub} numberOfLines={1}>{s.structured_formatting.secondary_text}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}

                  {(trip.places ?? []).length > 0 && (
                    <>
                      <Text style={styles.subSection}>Saved places</Text>
                      {(trip.places ?? []).map((place) => {
                        return (
                          <Pressable
                            key={place.placeId}
                            style={[styles.placePickerRow, draft.placeId === place.placeId && styles.placePickerRowSelected]}
                            onPress={() => {
                              setDraft((d) => ({ ...d, placeId: place.placeId }));
                              setPlacePickerVisible(false);
                            }}
                          >
                            <Icon name={placeCategoryIcon(place.category) as IconName} size={18} color={colors.forest500} />
                            <View style={styles.placePickerInfo}>
                              <Text style={styles.placePickerName} numberOfLines={1}>{place.name}</Text>
                              <Text style={styles.placePickerAddr} numberOfLines={1}>{place.address}</Text>
                            </View>
                            {draft.placeId === place.placeId && <Icon name="check" size={18} color={colors.primary} />}
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </ScrollView>
              </Pressable>
            </Pressable>
          )}

          {/* ── Trail picker — inline overlay inside this Modal ─────── */}
          {trailPickerVisible && (
            <Pressable
              style={[styles.pickerOverlay, { bottom: kbHeight }]}
              onPress={() => { setTrailPickerVisible(false); setTrailSearch(''); setTrailSuggestions([]); }}
            >
              <Pressable style={styles.subModalBox} onPress={(e) => e.stopPropagation()}>
                <View style={styles.subModalHeader}>
                  <Text style={styles.subModalTitle}>Select a trail</Text>
                  <IconButton
                    icon="x"
                    label="Close"
                    variant="ghost"
                    size="sm"
                    onPress={() => { setTrailPickerVisible(false); setTrailSearch(''); setTrailSuggestions([]); }}
                  />
                </View>

                {/* Single scrollable area — search first, saved trails below */}
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <Text style={styles.subSection}>Search & add a new trail</Text>
                  <TextInput
                    style={styles.placeSearchInput}
                    value={trailSearch}
                    onChangeText={setTrailSearch}
                    placeholder="Trail name…"
                    placeholderTextColor={colors.textTertiary}
                    autoCorrect={false}
                  />
                  <TextInput
                    style={[styles.placeSearchInput, { marginTop: -2 }]}
                    value={trailLocation}
                    onChangeText={setTrailLocation}
                    placeholder="Near (city, park, region)…"
                    placeholderTextColor={colors.textTertiary}
                    autoCorrect={false}
                  />
                  {searchingTrail && <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />}
                  {trailSuggestions.map((t) => {
                    const alreadyAdded = (trip.trails ?? []).some((saved) => saved.id === t.id);
                    return (
                      <Pressable key={t.id} style={styles.suggestionRow} onPress={() => handleSelectTrailSuggestion(t)}>
                        <Icon name="signpost" size={16} color={colors.textSecondary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestionMain} numberOfLines={1}>{t.name}</Text>
                          {t.distanceKm != null && (
                            <Text style={styles.suggestionSub}>{formatMiles(t.distanceKm)}</Text>
                          )}
                        </View>
                        {alreadyAdded && <Icon name="circle-check" size={16} color={colors.primary} />}
                      </Pressable>
                    );
                  })}

                  {(trip.trails ?? []).length > 0 && (
                    <>
                      <Text style={styles.subSection}>Saved trails</Text>
                      {(trip.trails ?? []).map((trail) => (
                        <Pressable
                          key={trail.id}
                          style={[styles.placePickerRow, draft.trailId === trail.id && styles.placePickerRowSelected]}
                          onPress={() => {
                            setDraft((d) => ({ ...d, trailId: trail.id }));
                            setTrailPickerVisible(false);
                          }}
                        >
                          <Icon name="route" size={18} color={colors.forest500} />
                          <View style={styles.placePickerInfo}>
                            <Text style={styles.placePickerName} numberOfLines={1}>{trail.name}</Text>
                            {(trail.distanceKm != null || trail.elevationGainM != null) && (
                              <Text style={styles.placePickerAddr}>
                                {[
                                  trail.distanceKm != null ? formatMiles(trail.distanceKm) : null,
                                  trail.elevationGainM != null ? `↑${formatFeet(trail.elevationGainM)}` : null,
                                ].filter(Boolean).join(' · ')}
                              </Text>
                            )}
                          </View>
                          {draft.trailId === trail.id && <Icon name="check" size={18} color={colors.primary} />}
                        </Pressable>
                      ))}
                    </>
                  )}
                </ScrollView>
              </Pressable>
            </Pressable>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Meal form modal ────────────────────────────────────────── */}
      <Modal visible={mealFormVisible} animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.formHeader}>
            <Pressable onPress={() => setMealFormVisible(false)} hitSlop={12}>
              <Text style={styles.formHeaderCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.formHeaderTitle}>
              {editingMealId ? 'Edit meal' : `Add ${mealDraft.slot.charAt(0).toUpperCase() + mealDraft.slot.slice(1)}`}
            </Text>
            <Pressable onPress={saveMeal} hitSlop={12}>
              <Text style={styles.formHeaderSave}>Save</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Date */}
            <Text style={styles.fieldLabel}>Date</Text>
            <Pressable
              style={styles.pickerField}
              onPress={() => setPickingMealDate(true)}
            >
              <Icon name="calendar" size={18} color={colors.textSecondary} />
              <Text style={styles.pickerFieldText}>{formatDayHeading(mealDraft.date)}</Text>
            </Pressable>
            {pickingMealDate && (
              <View style={styles.pickerRow}>
                <DateTimePicker
                  value={new Date(mealDraft.date.slice(0, 10) + 'T00:00:00')}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={new Date(trip.startDate.slice(0, 10) + 'T00:00:00')}
                  maximumDate={new Date(trip.endDate.slice(0, 10) + 'T00:00:00')}
                  onChange={(_, d) => {
                    if (d) setMealDraft((prev) => ({ ...prev, date: toDateString(d) }));
                    if (Platform.OS === 'android') setPickingMealDate(false);
                  }}
                />
                {Platform.OS === 'ios' && (
                  <Pressable onPress={() => setPickingMealDate(false)}>
                    <Text style={styles.pickerDone}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Slot selector */}
            <Text style={styles.fieldLabel}>Meal slot</Text>
            <View style={styles.chipRow}>
              {MEAL_OPTIONS.map((opt) => (
                <Tag key={opt.value} selected={mealDraft.slot === opt.value} onPress={() => setMealDraft((d) => ({ ...d, slot: opt.value }))}>
                  {opt.label}
                </Tag>
              ))}
            </View>

            {/* Recipe */}
            <Text style={styles.fieldLabel}>Recipe name</Text>
            <SuggestionInput
              inputStyle={styles.fieldInput}
              value={mealDraft.recipeName ?? ''}
              onChangeText={(t) => setMealDraft((d) => ({ ...d, recipeName: t }))}
              placeholder="e.g. Camp chili"
              suggestions={recipeSuggestions.map((s) => ({
                key: s.recipeName.toLowerCase(),
                label: s.recipeName,
                sublabel: `used ${s.count}×${s.ingredients?.length ? ` · ${s.ingredients.length} ingredients` : ''}`,
              }))}
              onSelect={handleSelectRecipeSuggestion}
            />

            <Text style={styles.fieldLabel}>Recipe URL</Text>
            <View style={styles.mealUrlRow}>
              <TextInput
                style={[styles.fieldInput, { flex: 1 }]}
                value={mealDraft.recipeUrl}
                onChangeText={(t) => setMealDraft((d) => ({ ...d, recipeUrl: t }))}
                placeholder="https://…"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              {!!mealDraft.recipeUrl && (
                <Pressable style={styles.mealUrlOpenBtn} onPress={() => openExternalUrl(mealDraft.recipeUrl)}>
                  <Icon name="external-link" size={20} color={colors.primary} />
                </Pressable>
              )}
            </View>

            {/* Ingredients */}
            <Text style={styles.fieldLabel}>Ingredients</Text>
            {(mealDraft.ingredients ?? []).map((ing) => (
              <View key={ing.id} style={styles.ingredientBlock}>
                <View style={styles.ingredientRow}>
                  <TextInput
                    style={[styles.fieldInput, styles.ingredientNameInput]}
                    value={ing.name}
                    onChangeText={(t) => updateIngredient(ing.id, { name: t })}
                    placeholder="Ingredient"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <TextInput
                    style={[styles.fieldInput, styles.ingredientAmountInput]}
                    value={ing.amount}
                    onChangeText={(t) => updateIngredient(ing.id, { amount: t })}
                    placeholder="Amount"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <Pressable onPress={() => removeIngredient(ing.id)} hitSlop={8} style={styles.ingredientRemoveBtn}>
                    <Icon name="trash-2" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
                {collaboratorEntries.length > 0 && (
                  <View style={styles.ingredientAssigneeRow}>
                    <Text style={styles.ingredientAssigneeLabel}>Who brings this:</Text>
                    <View style={styles.chipRow}>
                      {collaboratorEntries.map(([uid, name]) => (
                        <Tag key={uid} selected={(ing.assigneeUids ?? []).includes(uid)} onPress={() => toggleIngredientAssignee(ing.id, uid)}>
                          {name as string}
                        </Tag>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ))}
            <Pressable style={styles.addIngredientBtn} onPress={addIngredient}>
              <Icon name="circle-plus" size={18} color={colors.primary} />
              <Text style={styles.addIngredientText}>Add ingredient</Text>
            </Pressable>

            {/* Who's cooking */}
            {collaboratorEntries.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Who&apos;s cooking?</Text>
                <View style={styles.chipRow}>
                  {collaboratorEntries.map(([uid, name]) => (
                    <Tag key={uid} selected={(mealDraft.assigneeUids ?? []).includes(uid)} onPress={() => toggleDayMealAssignee(uid)}>
                      {name as string}
                    </Tag>
                  ))}
                </View>
              </>
            )}

            {/* Notes */}
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.fieldInput, styles.notesInput]}
              value={mealDraft.notes}
              onChangeText={(t) => setMealDraft((d) => ({ ...d, notes: t }))}
              placeholder="Any details…"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Delete */}
            {editingMealId && (
              <Pressable style={styles.deleteBtn} onPress={() => deleteMeal(editingMealId)}>
                <Icon name="trash-2" size={18} color={colors.clay600} />
                <Text style={styles.deleteBtnText}>Delete meal</Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfacePage,
  },

  // Day strip
  dayStripWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  dayStrip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.space3,
    paddingVertical: spacing.space2,
    gap: spacing.space2,
  },
  dayChip: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    paddingVertical: spacing.space1,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceApp,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  dayChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayChipDow: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
  },
  dayChipNum: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
    marginTop: 1,
  },
  dayChipTextSelected: {
    color: colors.textInverse,
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 2,
  },
  dayDotSelected: {
    backgroundColor: colors.cream50,
  },

  // Day heading
  dayHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.space4,
    paddingVertical: spacing.space2,
  },
  dayHeadingText: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  dayHeadingCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // Event list
  eventList: {
    flex: 1,
  },
  eventListContent: {
    paddingHorizontal: spacing.space5,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    gap: spacing.space2,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  emptyStateText: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textSecondary,
  },
  emptyStateHint: {
    ...typography.bodySm,
    color: colors.textTertiary,
  },

  // Event card
  eventCard: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.space3,
    padding: spacing.space4,
    gap: spacing.space3,
    ...shadows.sm,
  },
  eventCardOvernight: {
    backgroundColor: colors.forest100,
    borderColor: colors.forest200,
  },
  eventCardLeft: {
    alignItems: 'center',
    paddingTop: 4,
  },
  eventTimeDot: {
    alignItems: 'center',
  },
  eventDotCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  eventCardBody: {
    flex: 1,
    gap: 4,
  },
  eventTime: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  eventTitle: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  eventMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space2,
    marginTop: 4,
  },
  eventMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceApp,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.xs,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  eventMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  eventNotes: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: 4,
  },

  // Add button
  addBtnWrapper: {
    position: 'absolute',
    bottom: spacing.space6,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    backgroundColor: colors.primary,
    paddingVertical: spacing.space3,
    paddingHorizontal: spacing.space7,
    borderRadius: radii.pill,
    ...shadows.md,
  },
  addBtnText: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodyBold,
    color: colors.textInverse,
  },

  // Event form modal
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.space5,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: spacing.space4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surfacePage,
  },
  formHeaderCancel: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  formHeaderTitle: {
    ...typography.titleMd,
    color: colors.textPrimary,
  },
  formHeaderSave: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodyBold,
    color: colors.primary,
  },
  formScroll: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  formContent: {
    padding: spacing.space5,
    paddingBottom: spacing.space9,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: spacing.space2,
    marginTop: spacing.space4,
  },
  fieldHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.space2,
    marginTop: -4,
  },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    padding: spacing.space3,
    fontFamily: fontFamily.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceCard,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Time
  timeRow: {
    flexDirection: 'row',
    gap: spacing.space2,
    alignItems: 'center',
  },
  timeBtn: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    padding: spacing.space3,
    backgroundColor: colors.surfaceCard,
  },
  timeBtnLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  timeBtnValue: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  clearTimeBtn: {
    padding: 4,
  },
  pickerRow: {
    marginTop: spacing.space2,
  },
  pickerDone: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.primary,
    marginTop: spacing.space2,
    textAlign: 'right',
  },

  // Picker field (place / trail)
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    padding: spacing.space3,
    backgroundColor: colors.surfaceCard,
  },
  pickerFieldText: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  pickerFieldPlaceholder: {
    color: colors.textTertiary,
  },

  // Chip row (transport / meal)
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space2,
  },

  // Packing items
  packingItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    paddingVertical: spacing.space2,
    paddingHorizontal: spacing.space3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  packingItemName: {
    flex: 1,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  packingItemCat: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // Delete
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    marginTop: spacing.space7,
    alignSelf: 'center',
    paddingVertical: spacing.space3,
    paddingHorizontal: spacing.space5,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.clay200,
    backgroundColor: colors.rust100,
  },
  deleteBtnText: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.clay600,
  },

  // Inline picker overlays (place / trail) — rendered inside the event form Modal
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceOverlay,
    justifyContent: 'flex-end',
  },
  subModalBox: {
    backgroundColor: colors.surfacePage,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.space5,
    maxHeight: '80%',
  },
  subModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.space4,
  },
  subModalTitle: {
    ...typography.titleLg,
    color: colors.textPrimary,
  },
  subSection: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.space2,
    marginTop: spacing.space3,
  },
  placePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    paddingVertical: spacing.space2,
    paddingHorizontal: spacing.space2,
    borderRadius: radii.sm,
    marginBottom: 4,
  },
  placePickerRowSelected: {
    backgroundColor: colors.forest100,
  },
  placePickerInfo: {
    flex: 1,
  },
  placePickerName: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  placePickerAddr: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 1,
  },
  placeSearchInput: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    padding: spacing.space3,
    fontFamily: fontFamily.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceCard,
    marginBottom: spacing.space2,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    paddingVertical: spacing.space2,
    paddingHorizontal: spacing.space2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  suggestionMain: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  suggestionSub: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 1,
  },

  // Day section headers (Meals / Events)
  daySectionHeader: {
    paddingHorizontal: 4,
    paddingTop: spacing.space5,
    paddingBottom: spacing.space2,
  },
  daySectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },

  // Meal slot chips (day view)
  mealSlotRow: {
    flexDirection: 'row',
    gap: spacing.space2,
    marginBottom: 4,
    paddingRight: 4,
  },
  mealSlotChip: {
    width: 90,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.space3,
    paddingHorizontal: spacing.space2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    gap: 4,
    minHeight: 68,
  },
  mealSlotChipFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mealSlotLabel: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  mealSlotLabelFilled: {
    color: colors.textInverse,
  },
  mealSlotRecipe: {
    ...typography.caption,
    color: colors.cream100,
    textAlign: 'center',
    paddingHorizontal: 4,
  },

  // Meal form
  mealUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
  },
  mealUrlOpenBtn: {
    padding: spacing.space2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },

  // Ingredients
  ingredientBlock: {
    marginBottom: spacing.space2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space1,
    padding: spacing.space2,
    backgroundColor: colors.surfaceCard,
  },
  ingredientNameInput: {
    flex: 1,
    marginBottom: 0,
  },
  ingredientAmountInput: {
    width: 90,
    marginBottom: 0,
  },
  ingredientRemoveBtn: {
    padding: spacing.space1,
  },
  ingredientAssigneeRow: {
    paddingHorizontal: spacing.space2,
    paddingVertical: spacing.space2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    gap: spacing.space1,
  },
  ingredientAssigneeLabel: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  addIngredientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space1,
    paddingVertical: spacing.space2,
    paddingHorizontal: 4,
  },
  addIngredientText: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.primary,
  },
});
