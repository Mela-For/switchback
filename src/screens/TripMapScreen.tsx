import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, FlatList, SectionList, ScrollView, Pressable } from 'react-native';
import MapView, { Marker, Callout, Polyline } from 'react-native-maps';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { usePreventRemove } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import type { TripPlace, Trail, ItineraryEvent, PlaceCategory } from '../types';
import { PLACE_CATEGORIES, placeCategoryIcon, trailDifficultyTone } from '../types';
import { colors, fontFamily, radii, shadows, spacing, typography } from '../constants/theme';
import { useTripsContext } from '../context/TripsContext';
import { formatMiles, formatFeet } from '../utils/units';
import { formatDayChip } from '../utils/dateUtils';
import { useTrailElevationBackfill } from '../hooks/useTrailElevationBackfill';
import { Badge, Button, Icon, Tabs, type IconName } from '../components/ui';
import PlaceDetailOverlay from '../components/PlaceDetailOverlay';

type Props = NativeStackScreenProps<RootStackParamList, 'TripMap'>;
type ListMode = 'itinerary' | 'places' | 'trails';

const ITINERARY_COLOR = colors.accent;
const ITINERARY_COLOR_DARK = colors.rust700;

const CATEGORY_COLORS: Record<string, string> = {
  campground: colors.forest400,
  restaurant: colors.rust600,
  lodging: colors.slate600,
  tourist_attraction: colors.gold500,
  cafe: colors.brown600,
  bar: colors.clay600,
  other: colors.textTertiary,
};

const TRAIL_COLOR = colors.primary;
const TRAIL_COLOR_SELECTED = colors.primaryPress;

/** Format "YYYY-MM-DD" → "Tue, Aug 4" for the Places/Trails tab scheduled badge. */
function formatCardDate(dateStr: string): string {
  return new Date(dateStr.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MarkerPin({
  category,
  selected,
  scheduled,
}: {
  category: PlaceCategory;
  selected: boolean;
  scheduled?: boolean;
}) {
  const bg = scheduled ? ITINERARY_COLOR : (CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other);
  return (
    <View style={[styles.markerPin, { backgroundColor: bg }, selected && styles.markerPinSelected]}>
      <Icon name={placeCategoryIcon(category) as IconName} size={16} color={colors.textInverse} />
    </View>
  );
}

function TrailheadMarker({
  selected,
  scheduled,
}: {
  selected: boolean;
  scheduled?: boolean;
}) {
  return (
    <View style={[
      styles.trailMarker,
      selected && styles.trailMarkerSelected,
      scheduled && !selected && styles.trailMarkerScheduled,
    ]}>
      <Icon name="signpost" size={16} color={colors.textInverse} />
    </View>
  );
}

function PlaceCard({
  place,
  isSelected,
  scheduledDate,
  onPress,
}: {
  place: TripPlace;
  isSelected: boolean;
  scheduledDate?: string;
  onPress: () => void;
}) {
  const catInfo = PLACE_CATEGORIES.find((c) => c.value === place.category);
  return (
    <Pressable style={[styles.card, isSelected && styles.cardSelected]} onPress={onPress}>
      {place.photoUrl ? (
        <Image source={{ uri: place.photoUrl }} style={styles.cardPhoto} resizeMode="cover" />
      ) : (
        <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
          <Icon name={placeCategoryIcon(place.category) as IconName} size={22} color={colors.forest500} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
        <View style={styles.cardMetaRow}>
          <Icon name={placeCategoryIcon(place.category) as IconName} size={12} color={colors.textSecondary} />
          <Text style={styles.cardCategory} numberOfLines={1}>{catInfo?.label ?? place.category}</Text>
        </View>
        {place.rating != null && (
          <View style={styles.cardMetaRow}>
            <Icon name="star" size={12} color={colors.gold500} />
            <Text style={styles.cardRating}>{place.rating.toFixed(1)}</Text>
          </View>
        )}
        <Text style={styles.cardAddress} numberOfLines={1}>{place.address}</Text>
        {scheduledDate && (
          <View style={styles.cardMetaRow}>
            <Icon name="calendar" size={11} color={ITINERARY_COLOR} />
            <Text style={styles.cardScheduledBadge}>{formatCardDate(scheduledDate)}</Text>
          </View>
        )}
      </View>
      {isSelected && (
        <View style={styles.cardChevron}>
          <Icon name="chevron-right" size={16} color={colors.primary} />
        </View>
      )}
    </Pressable>
  );
}

function TrailCard({
  trail,
  index,
  isSelected,
  scheduledDate,
  onPress,
}: {
  trail: Trail;
  index: number;
  isSelected: boolean;
  scheduledDate?: string;
  onPress: () => void;
}) {
  const scheduled = scheduledDate != null;
  return (
    <Pressable style={[styles.card, isSelected && styles.cardSelected]} onPress={onPress}>
      <View style={[
        styles.trailCardBadge,
        isSelected && styles.trailCardBadgeSelected,
        scheduled && !isSelected && styles.trailCardBadgeScheduled,
      ]}>
        <Text style={styles.trailCardBadgeText}>{index + 1}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{trail.name}</Text>
        <View style={styles.trailCardMeta}>
          {trail.distanceKm != null && (
            <Text style={styles.cardCategory}>{formatMiles(trail.distanceKm)}</Text>
          )}
          {trail.elevationGainM != null && (
            <Text style={styles.cardCategory}>↑{formatFeet(trail.elevationGainM)}</Text>
          )}
          {trail.difficulty && <Badge tone={trailDifficultyTone(trail.difficulty)}>{trail.difficulty}</Badge>}
          {!trail.geometry && <Text style={styles.manualLabel}>manual</Text>}
          {scheduledDate && (
            <View style={styles.cardMetaRow}>
              <Icon name="calendar" size={11} color={ITINERARY_COLOR} />
              <Text style={styles.scheduledLabel}>{formatCardDate(scheduledDate)}</Text>
            </View>
          )}
        </View>
      </View>
      {isSelected && (
        <View style={styles.cardChevron}>
          <Icon name="chevron-right" size={16} color={colors.primary} />
        </View>
      )}
    </Pressable>
  );
}

function EventCard({
  event,
  place,
  trail,
  onPlacePress,
  onTrailPress,
}: {
  event: ItineraryEvent;
  place?: TripPlace;
  trail?: Trail;
  onPlacePress?: () => void;
  onTrailPress?: () => void;
}) {
  const formatTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };
  const timeLabel = event.startTime ? formatTime(event.startTime) : null;
  const endLabel = event.endTime ? formatTime(event.endTime) : null;

  return (
    <View style={styles.eventCard}>
      {timeLabel && (
        <Text style={styles.eventTime}>
          {timeLabel}{endLabel ? ` – ${endLabel}` : ''}
        </Text>
      )}
      <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
      {place && (
        <Pressable onPress={onPlacePress} style={styles.eventLink}>
          <Icon name="map-pin" size={13} color={colors.primary} />
          <Text style={styles.eventLinkText} numberOfLines={1}>{place.name}</Text>
        </Pressable>
      )}
      {trail && (
        <Pressable onPress={onTrailPress} style={styles.eventLink}>
          <Icon name="signpost" size={13} color={TRAIL_COLOR} />
          <Text style={[styles.eventLinkText, { color: TRAIL_COLOR }]} numberOfLines={1}>{trail.name}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function TripMapScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { trips, updateTrip } = useTripsContext();
  const trip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [trips, tripId]);
  const places = useMemo(() => trip?.places ?? [], [trip]);
  const trails = useMemo(() => trip?.trails ?? [], [trip]);
  const itinerary = useMemo(() => trip?.itinerary ?? [], [trip]);
  // Backfills elevation for any saved trail missing it (added before this feature existed, or a
  // prior fetch failed) whenever this map screen is open.
  useTrailElevationBackfill(trip, updateTrip);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const [listMode, setListMode] = useState<ListMode>('itinerary');
  // Day highlighted on the map's itinerary tab (null = show the whole trip). Distinct from
  // selectedPlaceId/selectedTrailId, which track an individual pin, not a day.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // "View details" from a place's map callout opens the same full-screen place page used by
  // TripDetailScreen's Places tab.
  const [detailPlace, setDetailPlace] = useState<TripPlace | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);

  const mapRef = useRef<MapView>(null);
  const placesListRef = useRef<FlatList<TripPlace>>(null);
  const trailsListRef = useRef<FlatList<Trail>>(null);
  const eventsListRef = useRef<SectionList<ItineraryEvent>>(null);
  // date → measured Y offset of that day's section header within the SectionList's scroll
  // content, captured via onLayout in renderSectionHeader below. SectionList.scrollToLocation
  // estimates position from (possibly still-unmeasured) item layout and proved unreliable with
  // this list's variable-height cards; scrolling to a directly-measured pixel offset instead
  // sidesteps that entirely.
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const hasFitted = useRef(false);

  // Set title and default list mode once trip loads
  useEffect(() => {
    if (!trip) return;
    navigation.setOptions({ title: `${trip.name} — Map` });
    if ((trip.itinerary?.length ?? 0) > 0) setListMode('itinerary');
    else if ((trip.places?.length ?? 0) > 0) setListMode('places');
    else setListMode('trails');
    setSelectedDay(null);
  }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sort itinerary events by date then start time
  const sortedEvents = useMemo(() => {
    return [...itinerary].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99');
    });
  }, [itinerary]);

  // Set of placeIds referenced anywhere in the itinerary — drives the "scheduled" pin tint.
  const placeItinerarySet = useMemo(() => {
    const set = new Set<string>();
    sortedEvents.forEach((evt) => { if (evt.placeId) set.add(evt.placeId); });
    return set;
  }, [sortedEvents]);

  // placeId → first scheduled date — drives the Places tab's "scheduled" badge, which shows
  // the date rather than the cross-trip order number (a bare "#N" doesn't say *when*).
  const placeItineraryDate = useMemo(() => {
    const map = new Map<string, string>();
    sortedEvents.forEach((evt) => {
      if (evt.placeId && !map.has(evt.placeId)) map.set(evt.placeId, evt.date);
    });
    return map;
  }, [sortedEvents]);

  // Set of trail IDs referenced in itinerary
  const trailItinerarySet = useMemo(() => {
    const set = new Set<string>();
    sortedEvents.forEach((evt) => { if (evt.trailId) set.add(evt.trailId); });
    return set;
  }, [sortedEvents]);

  // trailId → first scheduled date — same purpose as placeItineraryDate, for the Trails tab.
  const trailItineraryDate = useMemo(() => {
    const map = new Map<string, string>();
    sortedEvents.forEach((evt) => {
      if (evt.trailId && !map.has(evt.trailId)) map.set(evt.trailId, evt.date);
    });
    return map;
  }, [sortedEvents]);

  // Distinct dates that have at least one itinerary event, for the day-filter chip strip
  const itineraryDays = useMemo(() => {
    const set = new Set<string>();
    sortedEvents.forEach((evt) => set.add(evt.date));
    return Array.from(set).sort();
  }, [sortedEvents]);

  // placeIds/trailIds scheduled on selectedDay — drives dimming everything else on the map
  const activeDayPlaceIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedDay) return set;
    sortedEvents.forEach((evt) => { if (evt.date === selectedDay && evt.placeId) set.add(evt.placeId); });
    return set;
  }, [sortedEvents, selectedDay]);

  const activeDayTrailIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedDay) return set;
    sortedEvents.forEach((evt) => { if (evt.date === selectedDay && evt.trailId) set.add(evt.trailId); });
    return set;
  }, [sortedEvents, selectedDay]);

  // Events grouped by date for the SectionList
  const eventSections = useMemo(() => {
    const map = new Map<string, ItineraryEvent[]>();
    sortedEvents.forEach((evt) => {
      if (!map.has(evt.date)) map.set(evt.date, []);
      map.get(evt.date)!.push(evt);
    });
    return Array.from(map.entries()).map(([date, data]) => ({ title: date, data }));
  }, [sortedEvents]);

  // Total header+row count across all sections. A trip itinerary is always small (at most a
  // few dozen events), so it's rendered in full up front — see the SectionList's
  // initialNumToRender below, which uses this to disable virtualization for this list.
  const totalItineraryRows = useMemo(
    () => eventSections.reduce((sum, s) => sum + s.data.length, 0) + eventSections.length,
    [eventSections]
  );

  // Fit map to all places + trails on first load
  useEffect(() => {
    if (hasFitted.current) return;
    const coords: { latitude: number; longitude: number }[] = [];
    places.forEach((p) => coords.push({ latitude: p.lat, longitude: p.lng }));
    trails.forEach((t) => {
      if (t.trailheadLat != null) {
        coords.push({ latitude: t.trailheadLat, longitude: t.trailheadLng! });
      }
      if (t.geometry && t.geometry.length > 0) {
        coords.push({ latitude: t.geometry[0].lat, longitude: t.geometry[0].lng });
        const last = t.geometry[t.geometry.length - 1];
        coords.push({ latitude: last.lat, longitude: last.lng });
      }
    });
    if (coords.length === 0) return;
    hasFitted.current = true;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 80, left: 60 },
        animated: false,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [places, trails]);

  // Re-fit the map when the day filter changes: zoom to just that day's places/trails, or back
  // out to everything when the "All days" chip is tapped. Skipped on mount — the effect above
  // already performs the initial fit for the (null) starting state.
  const skipDayFitRef = useRef(true);
  useEffect(() => {
    if (skipDayFitRef.current) {
      skipDayFitRef.current = false;
      return;
    }
    const coords: { latitude: number; longitude: number }[] = [];
    const dayPlaces = selectedDay ? places.filter((p) => activeDayPlaceIds.has(p.placeId)) : places;
    const dayTrails = selectedDay ? trails.filter((t) => activeDayTrailIds.has(t.id)) : trails;
    dayPlaces.forEach((p) => coords.push({ latitude: p.lat, longitude: p.lng }));
    dayTrails.forEach((t) => {
      if (t.trailheadLat != null) {
        coords.push({ latitude: t.trailheadLat, longitude: t.trailheadLng! });
      }
      if (t.geometry && t.geometry.length > 0) {
        coords.push({ latitude: t.geometry[0].lat, longitude: t.geometry[0].lng });
        const last = t.geometry[t.geometry.length - 1];
        coords.push({ latitude: last.lat, longitude: last.lng });
      }
    });
    if (coords.length === 0) return;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 80, right: 60, bottom: 80, left: 60 },
      animated: true,
    });
    // Only the day selection itself should trigger a re-fit, not every places/trails edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  // Scroll the itinerary list so the selected day's section sits at the top, mirroring the
  // map's zoom-to-day. Retries briefly in case this fires before that header's onLayout has
  // reported its offset (e.g. right after switching trips or first opening the itinerary tab).
  useEffect(() => {
    if (!selectedDay) return;
    let attempts = 0;
    let cancelled = false;
    const tryScroll = () => {
      if (cancelled) return;
      const offset = sectionOffsetsRef.current[selectedDay];
      if (offset != null) {
        eventsListRef.current?.getScrollResponder()?.scrollTo({ y: offset, animated: true });
        return;
      }
      attempts += 1;
      if (attempts < 10) setTimeout(tryScroll, 50);
    };
    tryScroll();
    return () => { cancelled = true; };
  }, [selectedDay]);

  // Scroll place list to selected card
  useEffect(() => {
    if (!selectedPlaceId) return;
    const idx = places.findIndex((p) => p.placeId === selectedPlaceId);
    if (idx >= 0) placesListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0 });
  }, [selectedPlaceId, places]);

  // Scroll trail list to selected card
  useEffect(() => {
    if (!selectedTrailId) return;
    const idx = trails.findIndex((t) => t.id === selectedTrailId);
    if (idx >= 0) trailsListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0 });
  }, [selectedTrailId, trails]);

  const handlePlaceCardPress = useCallback((place: TripPlace) => {
    setSelectedPlaceId(place.placeId);
    setSelectedTrailId(null);
    mapRef.current?.animateToRegion(
      { latitude: place.lat, longitude: place.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      350
    );
  }, []);

  const handleTrailCardPress = useCallback((trail: Trail) => {
    setSelectedTrailId(trail.id);
    setSelectedPlaceId(null);
    if (trail.trailheadLat != null) {
      mapRef.current?.animateToRegion(
        { latitude: trail.trailheadLat, longitude: trail.trailheadLng!, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        350
      );
    }
  }, []);

  const handleSavePlaceNotes = useCallback(
    (notes: string) => {
      if (!trip || !detailPlace) return;
      const nextPlaces = (trip.places ?? []).map((p) =>
        p.placeId === detailPlace.placeId ? { ...p, notes: notes ? notes : undefined } : p
      );
      updateTrip(tripId, { places: nextPlaces });
      setDetailPlace((prev) => (prev ? { ...prev, notes: notes ? notes : undefined } : prev));
    },
    [trip, tripId, detailPlace, updateTrip]
  );

  // The place detail overlay isn't a real navigator screen, so without this the header's back
  // button, the Android hardware back button, and iOS's edge-swipe gesture would skip straight
  // past it to the previous screen instead of just closing the overlay (see TripDetailScreen,
  // which has the same overlay and the same fix).
  const overlayOpen = mapExpanded || detailPlace !== null;
  usePreventRemove(overlayOpen, () => {
    if (mapExpanded) setMapExpanded(false);
    else if (detailPlace !== null) setDetailPlace(null);
  });

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (places.length === 0 && trails.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="map" size={56} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>Nothing on the map yet</Text>
        <Text style={styles.emptySubtitle}>
          Add places from the Browse tab, or add trails from the trip detail page.
        </Text>
      </View>
    );
  }

  const hasItinerary = itinerary.length > 0;
  const tabItems = [
    ...(hasItinerary ? [{ value: 'itinerary', label: 'Itinerary' }] : []),
    ...(places.length > 0 ? [{ value: 'places', label: `Places (${places.length})` }] : []),
    ...(trails.length > 0 ? [{ value: 'trails', label: `Trails (${trails.length})` }] : []),
  ];

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={styles.map}>

        {/* All place markers */}
        {places.map((place) => {
          const dimmed = selectedDay != null && !activeDayPlaceIds.has(place.placeId);
          const scheduled = selectedDay
            ? activeDayPlaceIds.has(place.placeId)
            : placeItinerarySet.has(place.placeId);
          return (
            <Marker
              key={place.placeId}
              coordinate={{ latitude: place.lat, longitude: place.lng }}
              onPress={() => handlePlaceCardPress(place)}
              opacity={dimmed ? 0.35 : 1}
              tracksViewChanges={false}
            >
              <MarkerPin category={place.category} selected={selectedPlaceId === place.placeId} scheduled={scheduled} />
              <Callout onPress={() => setDetailPlace(place)}>
                <View style={styles.callout}>
                  <Text style={styles.calloutName} numberOfLines={2}>{place.name}</Text>
                  <Text style={styles.calloutCategory}>
                    {PLACE_CATEGORIES.find((c) => c.value === place.category)?.label ?? place.category}
                  </Text>
                  {place.rating != null && (
                    <Text style={styles.calloutRating}>★ {place.rating.toFixed(1)}</Text>
                  )}
                  {placeItineraryDate.has(place.placeId) && (
                    <Text style={styles.calloutScheduled}>
                      {formatCardDate(placeItineraryDate.get(place.placeId)!)}
                    </Text>
                  )}
                  <Text style={styles.calloutTap}>Tap to view details →</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}

        {/* All trail polylines + trailhead markers */}
        {trails.map((trail) => {
          const isSelected = selectedTrailId === trail.id;
          const isScheduledAnyDay = trailItinerarySet.has(trail.id);
          const isActiveToday = selectedDay ? activeDayTrailIds.has(trail.id) : isScheduledAnyDay;
          const dimmed = selectedDay != null && !isActiveToday;
          const strokeColor = dimmed
            ? colors.borderStrong
            : isSelected
            ? TRAIL_COLOR_SELECTED
            : isActiveToday
            ? ITINERARY_COLOR_DARK
            : TRAIL_COLOR;
          const strokeWidth = dimmed ? 2 : isSelected ? 5 : isActiveToday ? 4 : 3;
          return [
            trail.geometry && trail.geometry.length > 1 && (
              <Polyline
                key={`poly_${trail.id}`}
                coordinates={trail.geometry.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
              />
            ),
            trail.trailheadLat != null && (
              <Marker
                key={`head_${trail.id}`}
                coordinate={{ latitude: trail.trailheadLat, longitude: trail.trailheadLng! }}
                onPress={() => handleTrailCardPress(trail)}
                opacity={dimmed ? 0.35 : 1}
                tracksViewChanges={false}
              >
                <TrailheadMarker selected={isSelected} scheduled={isActiveToday} />
                <Callout>
                  <View style={styles.callout}>
                    <Text style={styles.calloutName} numberOfLines={2}>{trail.name}</Text>
                    {trail.distanceKm != null && (
                      <Text style={styles.calloutCategory}>{formatMiles(trail.distanceKm)}</Text>
                    )}
                    {trail.elevationGainM != null && (
                      <Text style={styles.calloutCategory}>↑{formatFeet(trail.elevationGainM)}</Text>
                    )}
                    {trailItineraryDate.has(trail.id) && (
                      <Text style={styles.calloutScheduled}>
                        {formatCardDate(trailItineraryDate.get(trail.id)!)}
                      </Text>
                    )}
                  </View>
                </Callout>
              </Marker>
            ),
          ];
        })}
      </MapView>

      {/* Bottom list panel */}
      <View style={styles.listSection}>

        {/* Segment control */}
        <View style={styles.segmentBar}>
          <Tabs
            items={tabItems}
            value={listMode}
            onChange={(v) => {
              setListMode(v as ListMode);
              if (v !== 'itinerary') setSelectedDay(null);
            }}
          />
        </View>

        {/* Itinerary list */}
        {listMode === 'itinerary' && (
          hasItinerary ? (
            <>
              {itineraryDays.length > 1 && (
                <View style={styles.dayFilterWrapper}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dayFilterStrip}
                  >
                    <Pressable
                      style={[styles.dayFilterChip, selectedDay == null && styles.dayFilterChipSelected]}
                      onPress={() => setSelectedDay(null)}
                    >
                      <Text style={[styles.dayFilterChipLabel, selectedDay == null && styles.dayFilterChipTextSelected]}>
                        All days
                      </Text>
                    </Pressable>
                    {itineraryDays.map((day) => {
                      const { dow, day: dayNum } = formatDayChip(day);
                      const isSelected = selectedDay === day;
                      return (
                        <Pressable
                          key={day}
                          style={[styles.dayFilterChip, isSelected && styles.dayFilterChipSelected]}
                          onPress={() => setSelectedDay(isSelected ? null : day)}
                        >
                          <Text style={[styles.dayFilterChipDow, isSelected && styles.dayFilterChipTextSelected]}>
                            {dow}
                          </Text>
                          <Text style={[styles.dayFilterChipNum, isSelected && styles.dayFilterChipTextSelected]}>
                            {dayNum}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
              <SectionList
                ref={eventsListRef}
                sections={eventSections}
                keyExtractor={(item) => item.id}
                initialNumToRender={Math.max(totalItineraryRows, 1)}
                renderSectionHeader={({ section }) => (
                  <View onLayout={(e) => { sectionOffsetsRef.current[section.title] = e.nativeEvent.layout.y; }}>
                    <Text style={styles.dayHeader}>
                      {new Date(section.title.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, {
                        weekday: 'long', month: 'short', day: 'numeric',
                      })}
                    </Text>
                  </View>
                )}
                renderItem={({ item }) => {
                  const place = item.placeId ? places.find((p) => p.placeId === item.placeId) : undefined;
                  const trail = item.trailId ? trails.find((t) => t.id === item.trailId) : undefined;
                  return (
                    <EventCard
                      event={item}
                      place={place}
                      trail={trail}
                      onPlacePress={place ? () => handlePlaceCardPress(place) : undefined}
                      onTrailPress={trail ? () => handleTrailCardPress(trail) : undefined}
                    />
                  );
                }}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            </>
          ) : (
            <View style={styles.modeEmpty}>
              <Text style={styles.modeEmptyText}>No itinerary events yet.</Text>
              <Button onPress={() => navigation.navigate('TripItinerary', { tripId })}>Plan itinerary</Button>
            </View>
          )
        )}

        {/* Places list */}
        {listMode === 'places' && (
          <FlatList
            ref={placesListRef}
            data={places}
            keyExtractor={(p) => p.placeId}
            renderItem={({ item }) => (
              <PlaceCard
                place={item}
                isSelected={selectedPlaceId === item.placeId}
                scheduledDate={placeItineraryDate.get(item.placeId)}
                onPress={() => {
                  if (selectedPlaceId === item.placeId) setDetailPlace(item);
                  else handlePlaceCardPress(item);
                }}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onScrollToIndexFailed={() => {}}
          />
        )}

        {/* Trails list */}
        {listMode === 'trails' && (
          <FlatList
            ref={trailsListRef}
            data={trails}
            keyExtractor={(t) => t.id}
            renderItem={({ item, index }) => (
              <TrailCard
                trail={item}
                index={index}
                isSelected={selectedTrailId === item.id}
                scheduledDate={trailItineraryDate.get(item.id)}
                onPress={() => handleTrailCardPress(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onScrollToIndexFailed={() => {}}
          />
        )}
      </View>

      {detailPlace && (
        <PlaceDetailOverlay
          place={detailPlace}
          onClose={() => setDetailPlace(null)}
          onSaveNotes={handleSavePlaceNotes}
          mapExpanded={mapExpanded}
          onExpandMap={() => setMapExpanded(true)}
          onCollapseMap={() => setMapExpanded(false)}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  map: {
    flex: 2,
  },

  // Custom place marker
  markerPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.cream50,
    ...shadows.md,
  },
  markerPinSelected: {
    borderWidth: 3,
  },

  // Trail trailhead marker
  trailMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TRAIL_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.cream50,
    ...shadows.md,
  },
  trailMarkerSelected: {
    borderWidth: 3,
    backgroundColor: TRAIL_COLOR_SELECTED,
  },
  trailMarkerScheduled: {
    backgroundColor: ITINERARY_COLOR,
  },

  // Callout
  callout: {
    width: 200,
    padding: 6,
    gap: 2,
  },
  calloutName: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  calloutCategory: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  calloutRating: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.brown800,
  },
  calloutScheduled: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: ITINERARY_COLOR,
    marginTop: 2,
  },
  calloutTap: {
    ...typography.caption,
    color: colors.primary,
    marginTop: 4,
  },

  // Segment control
  segmentBar: {
    paddingHorizontal: spacing.space4,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },

  // Day-filter chip strip (highlight one day's places/trails/route on the map)
  dayFilterWrapper: {
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  dayFilterStrip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.space3,
    paddingVertical: spacing.space2,
    gap: spacing.space2,
  },
  dayFilterChip: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: spacing.space2,
    paddingVertical: spacing.space1,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceApp,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  dayFilterChipSelected: {
    backgroundColor: ITINERARY_COLOR,
    borderColor: ITINERARY_COLOR,
  },
  dayFilterChipLabel: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  dayFilterChipDow: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
  },
  dayFilterChipNum: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
    marginTop: 1,
  },
  dayFilterChipTextSelected: {
    color: colors.textInverse,
  },

  // Day header for itinerary SectionList
  dayHeader: {
    ...typography.label,
    color: colors.textSecondary,
    paddingHorizontal: spacing.space4,
    paddingVertical: spacing.space2,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },

  // Event card
  eventCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.space3,
    gap: 4,
  },
  eventTime: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  eventTitle: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  eventLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventLinkText: {
    ...typography.bodySm,
    color: colors.primary,
    flex: 1,
  },

  // Bottom list panel
  listSection: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  listContent: {
    padding: spacing.space3,
    gap: spacing.space2,
    paddingBottom: spacing.space6,
  },

  // Shared card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.forest100,
  },
  cardPhoto: {
    width: 60,
    height: 60,
  },
  cardPhotoPlaceholder: {
    backgroundColor: colors.forest100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: spacing.space2,
    paddingVertical: spacing.space2,
    gap: 2,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardName: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  cardCategory: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardRating: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.brown800,
  },
  cardAddress: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  cardChevron: {
    paddingHorizontal: spacing.space2,
  },
  cardScheduledBadge: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: ITINERARY_COLOR,
  },

  // Trail card specifics
  trailCardBadge: {
    width: 40,
    height: 60,
    backgroundColor: TRAIL_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trailCardBadgeSelected: {
    backgroundColor: TRAIL_COLOR_SELECTED,
  },
  trailCardBadgeScheduled: {
    backgroundColor: ITINERARY_COLOR,
  },
  trailCardBadgeText: {
    color: colors.textInverse,
    fontSize: 16,
    fontFamily: fontFamily.bodyBold,
  },
  trailCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.space2,
    marginTop: 2,
  },
  manualLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  scheduledLabel: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: ITINERARY_COLOR,
  },

  // Empty states
  modeEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.space7,
    gap: spacing.space3,
  },
  modeEmptyText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.space8,
    gap: spacing.space3,
    backgroundColor: colors.surfacePage,
  },
  emptyTitle: {
    ...typography.titleMd,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
