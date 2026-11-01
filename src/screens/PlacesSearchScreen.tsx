import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Linking,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TripPlace, PlaceCategory } from '../types';
import { PLACE_CATEGORIES, placeCategoryIcon } from '../types';
import { colors, fontFamily, radii, spacing, typography } from '../constants/theme';
import { useTripsContext } from '../context/TripsContext';
import { GOOGLE_PLACES_API_KEY } from '../config/googlePlaces';
import { lookupRecreationGovUrl, type RecreationGovLookupResult } from '../utils/aiApi';
import { logger } from '../utils/logger';
import {
  searchAllTypes,
  getPhotoUrl,
  detectCategory,
  googleMapsUrl,
  getAutocompleteSuggestions,
  getPlaceDetails,
  type GooglePlaceResult,
  type AutocompleteSuggestion,
  type PlaceDetails,
} from '../utils/placesApi';
import MapView, { Marker, Callout } from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { Button, Dialog, Icon, IconButton, Tag, type IconName } from '../components/ui';

// ── Sub-components ────────────────────────────────────────────────────────────

function StarRating({ rating, size = 13 }: { rating: number; size?: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon
          key={i}
          name={i <= full ? 'star' : i === full + 1 && half ? 'star-half' : 'star'}
          size={size}
          color={i <= full || (i === full + 1 && half) ? colors.gold500 : colors.borderStrong}
        />
      ))}
    </View>
  );
}

function PlaceCard({
  place,
  tripCount,
  onAdd,
  onOpenMaps,
  onPress,
  apiKey,
}: {
  place: GooglePlaceResult;
  tripCount: number;
  onAdd: () => void;
  onOpenMaps: () => void;
  onPress: () => void;
  apiKey: string;
}) {
  const photoRef = place.photos?.[0]?.photo_reference;
  const photoUri = photoRef ? getPhotoUrl(photoRef, apiKey) : null;
  const category = detectCategory(place.types);
  const categoryLabel = PLACE_CATEGORIES.find((c) => c.value === category)?.label ?? 'Place';

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.cardPhoto} resizeMode="cover" />
      ) : (
        <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
          <Icon name={placeCategoryIcon(category) as IconName} size={26} color={colors.forest500} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={2}>{place.name}</Text>
        <View style={styles.cardMeta}>
          {place.rating != null && (
            <View style={styles.ratingRow}>
              <StarRating rating={place.rating} />
              <Text style={styles.ratingText}>
                {place.rating.toFixed(1)}
                {place.user_ratings_total != null && (
                  <Text style={styles.ratingCount}> ({place.user_ratings_total.toLocaleString()})</Text>
                )}
              </Text>
            </View>
          )}
          <Text style={styles.cardCategory}>{categoryLabel}</Text>
          <Text style={styles.cardAddress} numberOfLines={2}>{place.formatted_address}</Text>
        </View>
        <View style={styles.cardActions}>
          <Button icon="plus" onPress={onAdd}>
            {tripCount > 0 ? `Added to ${tripCount} trip${tripCount > 1 ? 's' : ''}` : 'Add to trip'}
          </Button>
          <Button icon="map" variant="secondary" onPress={onOpenMaps}>Maps</Button>
        </View>
      </View>
    </Pressable>
  );
}

function MapPlaceCard({
  place,
  isSelected,
  onPress,
  onAdd,
  apiKey,
}: {
  place: GooglePlaceResult;
  isSelected: boolean;
  onPress: () => void;
  onAdd: () => void;
  apiKey: string;
}) {
  const photoRef = place.photos?.[0]?.photo_reference;
  const photoUri = photoRef ? getPhotoUrl(photoRef, apiKey) : null;
  return (
    <Pressable style={[styles.mapCard, isSelected && styles.mapCardSelected]} onPress={onPress}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.mapCardPhoto} resizeMode="cover" />
      ) : (
        <View style={[styles.mapCardPhoto, styles.cardPhotoPlaceholder]}>
          <Icon name={placeCategoryIcon(detectCategory(place.types)) as IconName} size={18} color={colors.forest500} />
        </View>
      )}
      <View style={styles.mapCardBody}>
        <Text style={styles.mapCardName} numberOfLines={1}>{place.name}</Text>
        {place.rating != null && (
          <View style={styles.ratingRow}>
            <StarRating rating={place.rating} size={11} />
            <Text style={styles.ratingText}>{place.rating.toFixed(1)}</Text>
          </View>
        )}
        <Text style={styles.mapCardAddress} numberOfLines={1}>{place.formatted_address}</Text>
      </View>
      <IconButton icon="circle-plus" label="Add to trip" onPress={onAdd} />
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

// Hidden from the UI for now, but kept wired up (state/handlers/dialog below) so it can be re-enabled later.
const SHOW_RECREATION_GOV_LOOKUP = false;

export default function PlacesSearchScreen() {
  const { trips, updateTrip } = useTripsContext();

  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory | 'all'>('all');
  /** All results returned by the last search (unfiltered). */
  const [allResults, setAllResults] = useState<GooglePlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Trip picker modal
  const [addTripModal, setAddTripModal] = useState<GooglePlaceResult | null>(null);

  // Paste-a-recreation.gov-link
  const [recGovExpanded, setRecGovExpanded] = useState(false);
  const [recGovUrl, setRecGovUrl] = useState('');
  const [recGovLoading, setRecGovLoading] = useState(false);
  const [recGovResult, setRecGovResult] = useState<TripPlace | null>(null);

  // Autocomplete
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const autocompleteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set right before a programmatic searchText change (suggestion tap) so the
   * autocomplete effect it triggers doesn't re-fetch and repopulate the dropdown. */
  const skipNextAutocompleteRef = useRef(false);

  // View mode toggle (list vs map)
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const mapRef = useRef<MapView>(null);
  const mapListRef = useRef<FlatList<GooglePlaceResult>>(null);

  // Place detail modal
  const [detailPlace, setDetailPlace] = useState<PlaceDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  // Full-screen photo gallery
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [currentGalleryIndex, setCurrentGalleryIndex] = useState(0);
  const galleryFlatListRef = useRef<FlatList>(null);

  /** For each placeId, which tripIds already have it saved. */
  const placeInTrips = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const trip of trips) {
      for (const place of trip.places ?? []) {
        if (!map.has(place.placeId)) map.set(place.placeId, new Set());
        map.get(place.placeId)!.add(trip.id);
      }
    }
    return map;
  }, [trips]);

  /** allResults filtered by the selected category chip — instant, no extra API call. */
  const filteredResults = useMemo(() => {
    if (selectedCategory === 'all') return allResults;
    return allResults.filter((p) => detectCategory(p.types) === selectedCategory);
  }, [allResults, selectedCategory]);

  /** Initial region computed from all filtered results — auto-fits on first render. */
  const initialMapRegion = useMemo((): Region | undefined => {
    if (filteredResults.length === 0) return undefined;
    const lats = filteredResults.map((p) => p.geometry.location.lat);
    const lngs = filteredResults.map((p) => p.geometry.location.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const pad = 0.35;
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * (1 + pad), 0.04),
      longitudeDelta: Math.max((maxLng - minLng) * (1 + pad), 0.04),
    };
  }, [filteredResults]);

  /** Places whose coordinates fall inside the current map viewport. */
  const visiblePlaces = useMemo((): GooglePlaceResult[] => {
    if (!mapRegion) return filteredResults;
    const latMin = mapRegion.latitude - mapRegion.latitudeDelta / 2;
    const latMax = mapRegion.latitude + mapRegion.latitudeDelta / 2;
    const lngMin = mapRegion.longitude - mapRegion.longitudeDelta / 2;
    const lngMax = mapRegion.longitude + mapRegion.longitudeDelta / 2;
    return filteredResults.filter((p) => {
      const { lat, lng } = p.geometry.location;
      return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
    });
  }, [filteredResults, mapRegion]);

  // Re-fit map whenever the category filter changes while in map view.
  useEffect(() => {
    if (viewMode !== 'map' || filteredResults.length === 0) return;
    const coords = filteredResults.map((p) => ({
      latitude: p.geometry.location.lat,
      longitude: p.geometry.location.lng,
    }));
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }, 300);
    return () => clearTimeout(t);
    // intentionally omits viewMode — fitToCoordinates on mode switch is handled by initialMapRegion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredResults]);

  // When a marker is pressed, scroll the list below to that card.
  useEffect(() => {
    if (!selectedPlaceId) return;
    const idx = visiblePlaces.findIndex((p) => p.place_id === selectedPlaceId);
    if (idx >= 0) {
      mapListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0 });
    }
  }, [selectedPlaceId, visiblePlaces]);

  // ── Autocomplete ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (autocompleteRef.current) clearTimeout(autocompleteRef.current);
    if (skipNextAutocompleteRef.current) {
      skipNextAutocompleteRef.current = false;
      setSuggestions([]);
      return;
    }
    const q = searchText.trim();
    if (q.length < 2 || GOOGLE_PLACES_API_KEY === 'YOUR_PLACES_API_KEY') {
      setSuggestions([]);
      return;
    }
    autocompleteRef.current = setTimeout(async () => {
      const results = await getAutocompleteSuggestions(q, GOOGLE_PLACES_API_KEY);
      setSuggestions(results);
    }, 300);
    return () => {
      if (autocompleteRef.current) clearTimeout(autocompleteRef.current);
    };
  }, [searchText]);

  // ── Search ──────────────────────────────────────────────────────────────────

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setError('Enter a location or search term.');
      return;
    }
    if (GOOGLE_PLACES_API_KEY === 'YOUR_PLACES_API_KEY') {
      setError('Add your Google Places API key in src/config/googlePlaces.ts');
      return;
    }
    if (autocompleteRef.current) {
      clearTimeout(autocompleteRef.current);
      autocompleteRef.current = null;
    }
    setSuggestions([]);
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setViewMode('list');
    setSelectedPlaceId(null);
    setMapRegion(null);
    try {
      const data = await searchAllTypes(query, GOOGLE_PLACES_API_KEY);
      setAllResults(data);
    } catch (e: any) {
      setError(e.message ?? 'Search failed. Please try again.');
      setAllResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(() => {
    Keyboard.dismiss();
    performSearch(searchText.trim());
  }, [searchText, performSearch]);

  const handleSuggestionTap = useCallback((suggestion: AutocompleteSuggestion) => {
    Keyboard.dismiss();
    skipNextAutocompleteRef.current = true;
    setSearchText(suggestion.description);
    setSuggestions([]);
    performSearch(suggestion.description);
  }, [performSearch]);

  const handleClear = useCallback(() => {
    setSearchText('');
    setAllResults([]);
    setHasSearched(false);
    setError(null);
    setSuggestions([]);
  }, []);

  // Scroll full-screen gallery to the tapped photo when it opens
  useEffect(() => {
    if (galleryIndex == null) return;
    setCurrentGalleryIndex(galleryIndex);
    const t = setTimeout(() => {
      galleryFlatListRef.current?.scrollToIndex({ index: galleryIndex, animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [galleryIndex]);

  // ── Place detail ────────────────────────────────────────────────────────────

  const handleOpenDetail = useCallback(async (place: GooglePlaceResult) => {
    setDetailPlace(place as PlaceDetails); // show modal immediately with basic info
    setDetailLoading(true);
    try {
      const details = await getPlaceDetails(place.place_id, GOOGLE_PLACES_API_KEY);
      setDetailPlace(details);
    } catch {
      // Keep basic info if detail fetch fails
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── Add to trip ─────────────────────────────────────────────────────────────

  const handleAddToTrip = useCallback(
    (place: GooglePlaceResult, tripId: string) => {
      const targetTrip = trips.find((t) => t.id === tripId);
      if (!targetTrip) return;
      const photoRef = place.photos?.[0]?.photo_reference;
      const newPlace: TripPlace = {
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        category: detectCategory(place.types),
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        ...(place.rating != null ? { rating: place.rating } : {}),
        ...(place.user_ratings_total != null ? { userRatingsTotal: place.user_ratings_total } : {}),
        ...(photoRef ? { photoUrl: getPhotoUrl(photoRef, GOOGLE_PLACES_API_KEY) } : {}),
        addedAt: new Date().toISOString(),
      };
      const nextPlaces = [...(targetTrip.places ?? []), newPlace];
      updateTrip(tripId, { places: nextPlaces });
      setAddTripModal(null);
    },
    [trips, updateTrip]
  );

  const handleOpenMaps = useCallback((place: GooglePlaceResult) => {
    Linking.openURL(googleMapsUrl(place.place_id)).catch(() => {
      Alert.alert('Could not open Maps', 'Make sure Google Maps is installed or try again.');
    });
  }, []);

  // ── Paste a recreation.gov link ────────────────────────────────────────────

  const handleRecGovLookup = useCallback(async () => {
    const url = recGovUrl.trim();
    if (!url) return;
    setRecGovLoading(true);
    setRecGovResult(null);
    try {
      const result: RecreationGovLookupResult = await lookupRecreationGovUrl(url);
      const description = result.description || result.rawDescription;
      const place: TripPlace = {
        placeId: `recgov_${result.facilityId}`,
        name: result.name,
        address: result.address,
        category: 'campground',
        lat: result.lat ?? 0,
        lng: result.lng ?? 0,
        ...(result.photoUrl ? { photoUrl: result.photoUrl } : {}),
        addedAt: new Date().toISOString(),
        recreationGov: {
          facilityId: result.facilityId,
          sourceUrl: result.sourceUrl,
          ...(description ? { description } : {}),
          ...(result.facilityType ? { facilityType: result.facilityType } : {}),
          ...(result.activities.length > 0 ? { activities: result.activities } : {}),
          ...(result.feeDescription ? { feeDescription: result.feeDescription } : {}),
          ...(result.stayLimit ? { stayLimit: result.stayLimit } : {}),
          ...(result.adaAccess ? { adaAccess: result.adaAccess } : {}),
          ...(result.reservable ? { reservable: result.reservable } : {}),
          ...(result.reservationUrl ? { reservationUrl: result.reservationUrl } : {}),
          ...(result.directions ? { directions: result.directions } : {}),
          ...(result.phone ? { phone: result.phone } : {}),
        },
      };
      setRecGovResult(place);
    } catch (err) {
      logger.error('Recreation.gov lookup failed', err);
      const message = err instanceof Error ? err.message : 'Could not look up that link. Please try again.';
      Alert.alert('Lookup failed', message);
    } finally {
      setRecGovLoading(false);
    }
  }, [recGovUrl]);

  const handleAddRecGovPlace = useCallback(
    (place: TripPlace, tripId: string) => {
      const targetTrip = trips.find((t) => t.id === tripId);
      if (!targetTrip) return;
      const alreadyAdded = (targetTrip.places ?? []).some((p) => p.placeId === place.placeId);
      if (alreadyAdded) return;
      updateTrip(tripId, { places: [...(targetTrip.places ?? []), place] });
    },
    [trips, updateTrip]
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Icon name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search location or place name…"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <Pressable style={styles.searchClearBtn} onPress={handleClear} hitSlop={8}>
              <Icon name="circle-x" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
        <IconButton icon="search" label="Search" variant="filled" onPress={handleSearch} disabled={loading} />
      </View>

      {/* Paste a recreation.gov link */}
      {SHOW_RECREATION_GOV_LOOKUP && (
        <>
          <Pressable style={styles.recGovToggle} onPress={() => setRecGovExpanded((v) => !v)}>
            <Icon name="link" size={14} color={colors.textSecondary} />
            <Text style={styles.recGovToggleText}>Paste a recreation.gov link</Text>
            <Icon name={recGovExpanded ? 'chevron-down' : 'chevron-right'} size={16} color={colors.textSecondary} />
          </Pressable>
          {recGovExpanded && (
            <View style={styles.recGovRow}>
              <TextInput
                style={styles.recGovInput}
                value={recGovUrl}
                onChangeText={setRecGovUrl}
                placeholder="https://www.recreation.gov/camping/campgrounds/…"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={handleRecGovLookup}
              />
              <Button onPress={handleRecGovLookup} disabled={recGovLoading || !recGovUrl.trim()}>
                {recGovLoading ? <ActivityIndicator color={colors.textInverse} size="small" /> : 'Look up'}
              </Button>
            </View>
          )}
        </>
      )}

      {/* Autocomplete suggestions (shown while typing, replaces content below) */}
      {suggestions.length > 0 ? (
        <View style={styles.suggestionsContainer}>
          {suggestions.map((s) => (
            <Pressable key={s.place_id} style={styles.suggestionRow} onPress={() => handleSuggestionTap(s)}>
              <Icon name="map-pin" size={18} color={colors.textSecondary} />
              <View style={styles.suggestionText}>
                <Text style={styles.suggestionMain} numberOfLines={1}>
                  {s.structured_formatting.main_text}
                </Text>
                {s.structured_formatting.secondary_text ? (
                  <Text style={styles.suggestionSub} numberOfLines={1}>
                    {s.structured_formatting.secondary_text}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          {/* Category filters + list/map toggle (combined bar) */}
          <View style={styles.filtersBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtersContent}
              style={styles.filtersScroll}
            >
              {PLACE_CATEGORIES.map((cat) => (
                <View key={cat.value} style={styles.filterChipWrap}>
                  <Tag
                    icon={cat.lucideIcon as IconName}
                    selected={selectedCategory === cat.value}
                    onPress={() => setSelectedCategory(cat.value as PlaceCategory | 'all')}
                  >
                    {cat.label}
                  </Tag>
                </View>
              ))}
            </ScrollView>
            {filteredResults.length > 0 && (
              <View style={styles.viewToggle}>
                <IconButton icon="list-filter" label="List view" variant={viewMode === 'list' ? 'filled' : 'default'} size="sm" onPress={() => setViewMode('list')} />
                <IconButton icon="map" label="Map view" variant={viewMode === 'map' ? 'filled' : 'default'} size="sm" onPress={() => setViewMode('map')} />
              </View>
            )}
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <Icon name="circle-alert" size={18} color={colors.clay600} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Results */}
          {!hasSearched && !loading ? (
            <View style={styles.emptyState}>
              <Icon name="search" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Find places for your trip</Text>
              <Text style={styles.emptySubtitle}>
                Enter a location (e.g. &quot;San Francisco&quot;) and tap Search.
              </Text>
            </View>
          ) : loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.emptySubtitle}>Searching…</Text>
            </View>
          ) : filteredResults.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="map-pin" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>
                {allResults.length > 0 ? 'No matches for this filter' : 'No results found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {allResults.length > 0
                  ? 'Try selecting a different category or tap All.'
                  : 'Try a different location or search term.'}
              </Text>
            </View>
          ) : viewMode === 'list' ? (
            <FlatList
              data={filteredResults}
              keyExtractor={(p) => p.place_id}
              renderItem={({ item }) => (
                <PlaceCard
                  place={item}
                  tripCount={placeInTrips.get(item.place_id)?.size ?? 0}
                  onAdd={() => setAddTripModal(item)}
                  onOpenMaps={() => handleOpenMaps(item)}
                  onPress={() => handleOpenDetail(item)}
                  apiKey={GOOGLE_PLACES_API_KEY}
                />
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.mapContainer}>
              {/* Interactive map */}
              <MapView ref={mapRef} style={styles.mapView} initialRegion={initialMapRegion} onRegionChangeComplete={setMapRegion}>
                {filteredResults.map((place) => (
                  <Marker
                    key={place.place_id}
                    coordinate={{
                      latitude: place.geometry.location.lat,
                      longitude: place.geometry.location.lng,
                    }}
                    pinColor={selectedPlaceId === place.place_id ? colors.accent : undefined}
                    onPress={() => setSelectedPlaceId(place.place_id)}
                  >
                    <Callout onPress={() => handleOpenDetail(place)}>
                      <View style={styles.callout}>
                        <Text style={styles.calloutName} numberOfLines={2}>{place.name}</Text>
                        {place.rating != null && (
                          <View style={styles.ratingRow}>
                            <StarRating rating={place.rating} size={11} />
                            <Text style={styles.ratingText}>{place.rating.toFixed(1)}</Text>
                          </View>
                        )}
                        <Text style={styles.calloutTap}>Tap to view details →</Text>
                      </View>
                    </Callout>
                  </Marker>
                ))}
              </MapView>

              {/* Places visible in the current viewport */}
              <View style={styles.mapListSection}>
                <Text style={styles.mapListHeader}>
                  {visiblePlaces.length} place{visiblePlaces.length !== 1 ? 's' : ''} in view
                </Text>
                <FlatList
                  ref={mapListRef}
                  data={visiblePlaces}
                  keyExtractor={(p) => p.place_id}
                  renderItem={({ item }) => (
                    <MapPlaceCard
                      place={item}
                      isSelected={selectedPlaceId === item.place_id}
                      onPress={() => handleOpenDetail(item)}
                      onAdd={() => setAddTripModal(item)}
                      apiKey={GOOGLE_PLACES_API_KEY}
                    />
                  )}
                  contentContainerStyle={styles.mapListContent}
                  showsVerticalScrollIndicator={false}
                  onScrollToIndexFailed={() => {}}
                  ListEmptyComponent={<Text style={styles.mapListEmpty}>No places visible in this area</Text>}
                />
              </View>
            </View>
          )}
        </>
      )}

      {/* ── Place detail modal ─────────────────────────────────────────────── */}
      <Modal visible={detailPlace != null} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.detailContainer} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={styles.detailHeader}>
            <Pressable onPress={() => { setDetailPlace(null); setMapExpanded(false); }} hitSlop={12}>
              <Icon name="x" size={26} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              {detailPlace?.name}
            </Text>
            <View style={{ width: 26 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScrollContent}>
            {/* Photo gallery */}
            {(detailPlace?.photos?.length ?? 0) > 0 ? (
              <View>
                <FlatList
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  data={detailPlace!.photos!.slice(0, 10)}
                  keyExtractor={(_, i) => String(i)}
                  renderItem={({ item, index }) => (
                    <Pressable onPress={() => setGalleryIndex(index)}>
                      <Image
                        source={{ uri: getPhotoUrl(item.photo_reference, GOOGLE_PLACES_API_KEY, 800) }}
                        style={styles.detailPhoto}
                        resizeMode="cover"
                      />
                    </Pressable>
                  )}
                  style={styles.detailGallery}
                  scrollEnabled
                />
                <View style={styles.galleryHintRow}>
                  <Icon name="maximize" size={13} color={colors.textTertiary} />
                  <Text style={styles.galleryHintText}>Tap a photo to view full screen</Text>
                  <Text style={styles.galleryHintCount}>
                    {Math.min(detailPlace!.photos!.length, 10)} photo{Math.min(detailPlace!.photos!.length, 10) !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.detailPhotoPlaceholder}>
                <Icon name="image" size={40} color={colors.textTertiary} />
              </View>
            )}

            {/* Info */}
            <View style={styles.detailInfo}>
              <Text style={styles.detailName}>{detailPlace?.name}</Text>

              {detailPlace?.rating != null && (
                <View style={styles.ratingRow}>
                  <StarRating rating={detailPlace.rating} size={16} />
                  <Text style={styles.ratingText}>{detailPlace.rating.toFixed(1)}</Text>
                  {detailPlace.user_ratings_total != null && (
                    <Text style={styles.ratingCount}>
                      ({detailPlace.user_ratings_total.toLocaleString()} reviews)
                    </Text>
                  )}
                </View>
              )}

              {detailPlace?.types && (
                <Text style={styles.detailCategory}>
                  {PLACE_CATEGORIES.find((c) => c.value === detectCategory(detailPlace.types))?.label ?? 'Place'}
                </Text>
              )}

              <Text style={styles.detailAddress}>{detailPlace?.formatted_address}</Text>
            </View>

            {/* Interactive map */}
            {detailPlace?.geometry && (
              <Pressable style={styles.detailMap} onPress={() => setMapExpanded(true)}>
                <MapView
                  style={styles.detailMapView}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pointerEvents="none"
                  initialRegion={{
                    latitude: detailPlace.geometry.location.lat,
                    longitude: detailPlace.geometry.location.lng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                >
                  <Marker
                    coordinate={{
                      latitude: detailPlace.geometry.location.lat,
                      longitude: detailPlace.geometry.location.lng,
                    }}
                    title={detailPlace.name}
                  />
                </MapView>
                <View style={styles.detailMapExpandBadge}>
                  <Icon name="maximize" size={14} color={colors.cream50} />
                  <Text style={styles.detailMapExpandText}>Expand</Text>
                </View>
              </Pressable>
            )}

            {/* Loading indicator for details */}
            {detailLoading && (
              <ActivityIndicator color={colors.primary} style={styles.detailLoader} />
            )}

            {/* Reviews */}
            {(detailPlace?.reviews ?? []).length > 0 && (
              <View style={styles.reviewsSection}>
                <Text style={styles.reviewsTitle}>Reviews</Text>
                {detailPlace!.reviews!.map((review, i) => (
                  <View key={i} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewAuthor}>{review.author_name}</Text>
                      <Text style={styles.reviewTime}>{review.relative_time_description}</Text>
                    </View>
                    <StarRating rating={review.rating} />
                    {review.text ? (
                      <Text style={styles.reviewText}>{review.text}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Action buttons */}
          <View style={styles.detailActions}>
            <Button
              icon="plus"
              style={{ flex: 1 }}
              onPress={() => {
                if (!detailPlace) return;
                const place = detailPlace as GooglePlaceResult;
                // Close the detail sheet before opening the trip picker — showing two
                // stacked native Modals at once leaves the app unable to present either.
                setDetailPlace(null);
                setMapExpanded(false);
                setAddTripModal(place);
              }}
            >
              Add to trip
            </Button>
            <Button icon="map" variant="secondary" style={{ flex: 1 }} onPress={() => detailPlace && handleOpenMaps(detailPlace as GooglePlaceResult)}>
              Open in Maps
            </Button>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Full-screen photo gallery modal ────────────────────────────────── */}
      <Modal visible={galleryIndex != null} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent>
        <View style={styles.fullGallery}>
          <FlatList
            ref={galleryFlatListRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={detailPlace?.photos?.slice(0, 10) ?? []}
            keyExtractor={(_, i) => String(i)}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            renderItem={({ item }) => (
              <View style={styles.fullGalleryItem}>
                <Image
                  source={{ uri: getPhotoUrl(item.photo_reference, GOOGLE_PLACES_API_KEY, 1600) }}
                  style={styles.fullGalleryPhoto}
                  resizeMode="contain"
                />
              </View>
            )}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setCurrentGalleryIndex(idx);
            }}
          />

          {/* Counter */}
          <View style={styles.fullGalleryCounter}>
            <Text style={styles.fullGalleryCounterText}>
              {currentGalleryIndex + 1} / {Math.min(detailPlace?.photos?.length ?? 0, 10)}
            </Text>
          </View>

          {/* Close */}
          <IconButton icon="x" label="Close" variant="ghost" style={styles.fullGalleryClose} onPress={() => setGalleryIndex(null)} />
        </View>
      </Modal>

      {/* ── Full-screen map modal ────────────────────────────────────────────── */}
      <Modal visible={mapExpanded} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
        <SafeAreaView style={styles.fullMapContainer} edges={['top']}>
          {mapExpanded && detailPlace?.geometry && (
            <MapView
              style={styles.fullMapView}
              initialRegion={{
                latitude: detailPlace.geometry.location.lat,
                longitude: detailPlace.geometry.location.lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker
                coordinate={{
                  latitude: detailPlace.geometry.location.lat,
                  longitude: detailPlace.geometry.location.lng,
                }}
                title={detailPlace.name}
              />
            </MapView>
          )}
          <IconButton icon="x" label="Close" variant="default" style={styles.fullMapClose} onPress={() => setMapExpanded(false)} />
        </SafeAreaView>
      </Modal>

      {/* ── Trip picker modal ──────────────────────────────────────────────── */}
      <Dialog open={addTripModal != null} title="Add to trip" onClose={() => setAddTripModal(null)}>
        {trips.length === 0 ? (
          <Text style={styles.noTripsText}>
            You don&apos;t have any trips yet. Create one from My Trips first.
          </Text>
        ) : (
          <ScrollView style={styles.tripList} showsVerticalScrollIndicator={false}>
            {trips.map((trip) => {
              const alreadyAdded = placeInTrips.get(addTripModal?.place_id ?? '')?.has(trip.id) ?? false;
              return (
                <Pressable
                  key={trip.id}
                  style={[styles.tripRow, alreadyAdded && styles.tripRowAdded]}
                  onPress={() => {
                    if (addTripModal && !alreadyAdded) handleAddToTrip(addTripModal, trip.id);
                  }}
                  disabled={alreadyAdded}
                >
                  <View style={styles.tripRowInfo}>
                    <Text style={styles.tripRowName} numberOfLines={1}>{trip.name}</Text>
                    <Text style={styles.tripRowDate}>{trip.startDate} – {trip.endDate}</Text>
                  </View>
                  <Icon name={alreadyAdded ? 'circle-check' : 'circle-plus'} size={22} color={colors.primary} />
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </Dialog>

      {/* ── Recreation.gov lookup result + trip picker ──────────────────────── */}
      <Dialog open={recGovResult != null} title="Add to trip" onClose={() => setRecGovResult(null)}>
        {recGovResult && (
          <ScrollView style={styles.recGovDialogScroll} showsVerticalScrollIndicator={false}>
            {recGovResult.photoUrl && (
              <Image source={{ uri: recGovResult.photoUrl }} style={styles.recGovResultPhoto} resizeMode="cover" />
            )}
            <Text style={styles.recGovResultName}>{recGovResult.name}</Text>
            {recGovResult.recreationGov?.facilityType ? (
              <Text style={styles.recGovResultType}>{recGovResult.recreationGov.facilityType}</Text>
            ) : null}
            {recGovResult.address ? (
              <Text style={styles.recGovResultAddress}>{recGovResult.address}</Text>
            ) : null}
            {recGovResult.recreationGov?.description ? (
              <Text style={styles.recGovResultDescription}>{recGovResult.recreationGov.description}</Text>
            ) : null}
            {recGovResult.recreationGov?.activities && recGovResult.recreationGov.activities.length > 0 && (
              <View style={styles.recGovTagRow}>
                {recGovResult.recreationGov.activities.map((activity) => (
                  <Tag key={activity}>{activity}</Tag>
                ))}
              </View>
            )}
            <View style={styles.recGovFactRows}>
              {recGovResult.recreationGov?.feeDescription ? (
                <View style={styles.recGovFactRow}>
                  <Icon name="ticket" size={14} color={colors.textSecondary} />
                  <Text style={styles.recGovFactText}>{recGovResult.recreationGov.feeDescription}</Text>
                </View>
              ) : null}
              {recGovResult.recreationGov?.stayLimit ? (
                <View style={styles.recGovFactRow}>
                  <Icon name="calendar" size={14} color={colors.textSecondary} />
                  <Text style={styles.recGovFactText}>Stay limit: {recGovResult.recreationGov.stayLimit}</Text>
                </View>
              ) : null}
              {recGovResult.recreationGov?.adaAccess ? (
                <View style={styles.recGovFactRow}>
                  <Icon name="accessibility" size={14} color={colors.textSecondary} />
                  <Text style={styles.recGovFactText}>ADA access: {recGovResult.recreationGov.adaAccess}</Text>
                </View>
              ) : null}
              {recGovResult.recreationGov?.phone ? (
                <View style={styles.recGovFactRow}>
                  <Icon name="phone" size={14} color={colors.textSecondary} />
                  <Text style={styles.recGovFactText}>{recGovResult.recreationGov.phone}</Text>
                </View>
              ) : null}
            </View>
            {trips.length === 0 ? (
              <Text style={styles.noTripsText}>
                You don&apos;t have any trips yet. Create one from My Trips first.
              </Text>
            ) : (
              <View>
                {trips.map((trip) => {
                  const alreadyAdded = trip.places?.some((p) => p.placeId === recGovResult.placeId) ?? false;
                  return (
                    <Pressable
                      key={trip.id}
                      style={[styles.tripRow, alreadyAdded && styles.tripRowAdded]}
                      onPress={() => {
                        if (!alreadyAdded) handleAddRecGovPlace(recGovResult, trip.id);
                      }}
                      disabled={alreadyAdded}
                    >
                      <View style={styles.tripRowInfo}>
                        <Text style={styles.tripRowName} numberOfLines={1}>{trip.name}</Text>
                        <Text style={styles.tripRowDate}>{trip.startDate} – {trip.endDate}</Text>
                      </View>
                      <Icon name={alreadyAdded ? 'circle-check' : 'circle-plus'} size={22} color={colors.primary} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}
      </Dialog>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },

  // Search bar
  searchRow: {
    flexDirection: 'row',
    gap: spacing.space2,
    paddingHorizontal: spacing.space4,
    paddingVertical: spacing.space2,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    alignItems: 'center',
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceApp,
    paddingHorizontal: spacing.space3,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.textPrimary,
  },
  searchClearBtn: {
    padding: 2,
  },

  // Paste a recreation.gov link
  recGovToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    paddingHorizontal: spacing.space4,
    paddingVertical: spacing.space2,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  recGovToggleText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  recGovRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    paddingHorizontal: spacing.space4,
    paddingVertical: spacing.space3,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  recGovInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceApp,
    paddingHorizontal: spacing.space3,
    height: 40,
    fontFamily: fontFamily.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.textPrimary,
  },
  recGovDialogScroll: {
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  recGovResultPhoto: {
    width: '100%',
    height: 140,
    borderRadius: radii.sm,
    marginBottom: spacing.space2,
  },
  recGovResultName: {
    ...typography.titleMd,
    color: colors.textPrimary,
  },
  recGovResultType: {
    ...typography.caption,
    color: colors.forest600,
    marginTop: 2,
  },
  recGovResultAddress: {
    ...typography.bodySm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  recGovResultDescription: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.space2,
  },
  recGovTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space2,
    marginTop: spacing.space2,
  },
  recGovFactRows: {
    gap: 6,
    marginTop: spacing.space3,
    marginBottom: spacing.space3,
  },
  recGovFactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  recGovFactText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },

  // Autocomplete suggestions
  suggestionsContainer: {
    backgroundColor: colors.surfacePage,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space3,
    paddingHorizontal: spacing.space4,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMain: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  suggestionSub: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // Category filter chips + view toggle (combined bar)
  filtersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  filtersScroll: {
    flex: 1,
  },
  filtersContent: {
    paddingHorizontal: spacing.space3,
    alignItems: 'center',
  },
  filterChipWrap: {
    marginRight: spacing.space2,
  },

  // Error + empty states
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    marginHorizontal: spacing.space4,
    marginBottom: spacing.space2,
    padding: spacing.space3,
    backgroundColor: colors.clay200,
    borderRadius: radii.sm,
  },
  errorText: {
    flex: 1,
    ...typography.bodySm,
    color: colors.clay600,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.space7,
    gap: spacing.space3,
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
  listContent: {
    padding: spacing.space4,
    paddingBottom: spacing.space7,
    gap: spacing.space3,
  },
  // Place card
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  cardPhoto: {
    width: 100,
    height: 130,
  },
  cardPhotoPlaceholder: {
    backgroundColor: colors.forest100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    padding: spacing.space3,
    justifyContent: 'space-between',
  },
  cardName: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardMeta: {
    gap: 3,
    flex: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
  },
  ratingText: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  ratingCount: {
    color: colors.textTertiary,
    fontFamily: fontFamily.body,
    fontSize: 13,
  },
  cardCategory: {
    ...typography.caption,
    color: colors.primary,
  },
  cardAddress: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.space2,
    marginTop: spacing.space2,
    flexWrap: 'wrap',
  },

  // Place detail modal
  detailContainer: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.space4,
    paddingVertical: spacing.space3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  detailHeaderTitle: {
    flex: 1,
    ...typography.titleMd,
    color: colors.textPrimary,
    textAlign: 'center',
    marginHorizontal: spacing.space2,
  },
  detailScrollContent: {
    paddingBottom: spacing.space6,
  },
  detailGallery: {
    height: 240,
    backgroundColor: colors.surfaceSunken,
  },
  detailPhoto: {
    width: SCREEN_WIDTH,
    height: 240,
  },
  detailPhotoPlaceholder: {
    height: 200,
    backgroundColor: colors.surfaceSunken,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailInfo: {
    padding: spacing.space5,
    gap: 6,
  },
  detailName: {
    ...typography.displayMd,
    color: colors.textPrimary,
  },
  detailCategory: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.primary,
  },
  detailAddress: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  detailMap: {
    marginHorizontal: spacing.space5,
    height: 180,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSunken,
    marginBottom: spacing.space2,
    overflow: 'hidden',
  },
  detailMapView: {
    flex: 1,
  },
  detailMapExpandBadge: {
    position: 'absolute',
    top: spacing.space3,
    right: spacing.space3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceOverlay,
    paddingHorizontal: spacing.space3,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  detailMapExpandText: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.cream50,
  },
  detailLoader: {
    margin: spacing.space5,
  },
  reviewsSection: {
    padding: spacing.space5,
    paddingTop: spacing.space2,
  },
  reviewsTitle: {
    ...typography.titleLg,
    color: colors.textPrimary,
    marginBottom: spacing.space3,
  },
  reviewCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.space4,
    marginBottom: spacing.space3,
    gap: 6,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  reviewAuthor: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.space2,
  },
  reviewTime: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  reviewText: {
    ...typography.bodySm,
    color: colors.textPrimary,
    marginTop: 4,
  },
  detailActions: {
    flexDirection: 'row',
    gap: spacing.space3,
    padding: spacing.space4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surfacePage,
  },

  // Trip picker modal
  noTripsText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tripList: {
    maxHeight: 300,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.space3,
    paddingHorizontal: spacing.space3,
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.space2,
  },
  tripRowAdded: {
    borderColor: colors.primary,
    backgroundColor: colors.forest100,
  },
  tripRowInfo: {
    flex: 1,
    gap: 2,
  },
  tripRowName: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  tripRowDate: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // View toggle (inline in filter bar)
  viewToggle: {
    flexDirection: 'row',
    gap: 4,
    marginRight: spacing.space3,
  },

  // Interactive map view
  mapContainer: {
    flex: 1,
  },
  mapView: {
    flex: 2,
  },
  mapListSection: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  mapListHeader: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textSecondary,
    paddingHorizontal: spacing.space4,
    paddingVertical: spacing.space2,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  mapListContent: {
    padding: spacing.space3,
    gap: spacing.space2,
    paddingBottom: spacing.space6,
  },
  mapListEmpty: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingTop: spacing.space5,
  },

  // Compact card for map list
  mapCard: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    alignItems: 'center',
  },
  mapCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.forest100,
  },
  mapCardPhoto: {
    width: 60,
    height: 60,
  },
  mapCardBody: {
    flex: 1,
    paddingHorizontal: spacing.space2,
    paddingVertical: spacing.space2,
    gap: 3,
  },
  mapCardName: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  mapCardAddress: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // Marker callout
  callout: {
    width: 200,
    padding: 4,
  },
  calloutName: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  calloutTap: {
    ...typography.caption,
    color: colors.primary,
    marginTop: 4,
  },

  // Gallery tap hint strip
  galleryHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.space4,
    paddingVertical: 6,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  galleryHintText: {
    flex: 1,
    ...typography.caption,
    color: colors.textTertiary,
  },
  galleryHintCount: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textTertiary,
  },

  // Full-screen gallery modal
  fullGallery: {
    flex: 1,
    backgroundColor: colors.ink900,
    justifyContent: 'center',
  },
  fullGalleryItem: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullGalleryPhoto: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  fullGalleryCounter: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    backgroundColor: colors.surfaceOverlay,
    paddingHorizontal: spacing.space3,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  fullGalleryCounterText: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.cream50,
  },
  fullGalleryClose: {
    position: 'absolute',
    top: 56,
    right: spacing.space5,
  },
  fullMapContainer: {
    flex: 1,
    backgroundColor: colors.surfaceSunken,
  },
  fullMapView: {
    flex: 1,
  },
  fullMapClose: {
    position: 'absolute',
    top: spacing.space3,
    right: spacing.space5,
  },
});
