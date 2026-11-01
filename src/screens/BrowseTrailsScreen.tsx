import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { useHeaderHeight } from '@react-navigation/elements';
import type { Trail, TrailDifficulty } from '../types';
import { trailDifficultyTone } from '../types';
import { colors, fontFamily, radii, spacing, typography } from '../constants/theme';
import { useTripsContext } from '../context/TripsContext';
import { geocodeLocation, searchTrails, haversineKm, OverpassError } from '../utils/overpassApi';
import { getTrailElevation, mergeElevationIntoTrails, type ElevationStats } from '../utils/elevationApi';
import { formatMiles, formatFeet, miToKm, ftToM } from '../utils/units';
import { logger } from '../utils/logger';
import { Badge, Button, Dialog, Icon, Tag } from '../components/ui';

const DIFFICULTIES: TrailDifficulty[] = ['easy', 'moderate', 'hard'];
/** Literal hex colors for react-native-maps props (pinColor/strokeColor take strings, not Badge components). */
const DIFFICULTY_MAP_COLOR: Record<TrailDifficulty, string> = {
  easy: colors.forest600,
  moderate: colors.gold500,
  hard: colors.clay600,
};
const TRAIL_COLOR = colors.primary;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const DEFAULT_SEARCH_RADIUS_M = 50000;
/** Cap "search this area" radius so zooming way out can't fire a huge, slow Overpass query. */
const MAX_AREA_SEARCH_RADIUS_M = 150000;
/** Show "Search this area" once the map center has drifted more than this fraction of the current viewport's radius away from where it was last searched. */
const REARCH_THRESHOLD_FRACTION = 0.35;
const METERS_PER_DEGREE_LAT = 111320;

function allResultsRegion(trails: Trail[]) {
  const pts: { lat: number; lng: number }[] = [];
  for (const t of trails) {
    if (t.geometry && t.geometry.length > 0) pts.push(...t.geometry);
    else if (t.trailheadLat != null) pts.push({ lat: t.trailheadLat, lng: t.trailheadLng! });
  }
  if (pts.length === 0) return null;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.03),
    longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.03),
  };
}

function trailMarkerCoord(trail: Trail): { latitude: number; longitude: number } | null {
  if (trail.geometry && trail.geometry.length > 0) {
    const mid = trail.geometry[Math.floor(trail.geometry.length / 2)];
    return { latitude: mid.lat, longitude: mid.lng };
  }
  if (trail.trailheadLat != null) return { latitude: trail.trailheadLat, longitude: trail.trailheadLng! };
  return null;
}

function trailRegion(trail: Trail) {
  if (trail.geometry && trail.geometry.length > 0) {
    const lats = trail.geometry.map((c) => c.lat);
    const lngs = trail.geometry.map((c) => c.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latDelta = Math.max((maxLat - minLat) * 1.3, 0.01);
    const lngDelta = Math.max((maxLng - minLng) * 1.3, 0.01);
    return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: latDelta, longitudeDelta: lngDelta };
  }
  if (trail.trailheadLat != null) {
    return { latitude: trail.trailheadLat, longitude: trail.trailheadLng!, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  }
  return null;
}

/**
 * Standalone trail search — the "Browse Trails" tab. Not trip-scoped: search/preview/manual-entry
 * happen here, and adding a trail opens a trip picker (mirroring PlacesSearchScreen's "Add to
 * trip" modal). Once added, a trail's read-only summary lives in TripDetailScreen's Trails tab —
 * this screen has no saved-trail list of its own, same split as Browse Places / the Places tab.
 */
export default function BrowseTrailsScreen() {
  const headerHeight = useHeaderHeight();
  const { trips, updateTrip } = useTripsContext();

  // Search state
  const [searchName, setSearchName] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Trail[] | null>(null);
  // Bumped only on a fresh text search, so the map re-fits to the new results; "search this
  // area" deliberately leaves the camera alone since the user just positioned it on purpose.
  const [mapKeySeed, setMapKeySeed] = useState(0);

  // "Search this area" — the currently-visible map region, the center/radius we actually last
  // queried, and whether that's drifted far enough to offer re-searching.
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [searchedRegion, setSearchedRegion] = useState<{ lat: number; lng: number; radiusM: number } | null>(null);
  const [searchingArea, setSearchingArea] = useState(false);
  const showSearchAreaButton = useMemo(() => {
    if (!mapRegion || !searchedRegion) return false;
    const movedKm = haversineKm(searchedRegion.lat, searchedRegion.lng, mapRegion.latitude, mapRegion.longitude);
    // Judge "moved far enough" against what's currently visible on screen, not the original
    // query radius — the map's initial zoom fits tightly to the closest ~20 results, which can
    // be a couple km across even when the underlying search radius was 50km, so comparing
    // against the query radius meant the button effectively never appeared during normal
    // panning (you'd have to pan several screens' worth before crossing that threshold).
    const viewportRadiusKm = (Math.max(mapRegion.latitudeDelta, mapRegion.longitudeDelta) * METERS_PER_DEGREE_LAT) / 2 / 1000;
    return movedKm > viewportRadiusKm * REARCH_THRESHOLD_FRACTION;
  }, [mapRegion, searchedRegion]);

  // Map preview state
  const [previewTrail, setPreviewTrail] = useState<Trail | null>(null);
  const previewRegion = useMemo(() => previewTrail ? trailRegion(previewTrail) : null, [previewTrail]);

  // Elevation (USGS 3DEP) for the trail currently being previewed
  const [previewElevation, setPreviewElevation] = useState<ElevationStats | null>(null);
  const [previewElevationLoading, setPreviewElevationLoading] = useState(false);

  // Always-current trips, for the background elevation backfill below (which resolves after
  // this component may have re-rendered several times, so a captured closure would be stale)
  const tripsRef = useRef(trips);
  useEffect(() => { tripsRef.current = trips; }, [trips]);

  // Autocomplete state
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [suggestions, setSuggestions] = useState<Trail[]>([]);
  const geocodeDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestAbort = useRef<AbortController | null>(null);

  // Manual entry state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualDistance, setManualDistance] = useState('');
  const [manualElevationGain, setManualElevationGain] = useState('');
  const [manualDifficulty, setManualDifficulty] = useState<TrailDifficulty | undefined>();
  const [manualNotes, setManualNotes] = useState('');
  const [manualLocation, setManualLocation] = useState('');

  // "Add to trip" picker
  const [addTripModal, setAddTripModal] = useState<Trail | null>(null);

  /** For each trail id, which trip ids already have it saved. */
  const trailInTrips = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const trip of trips) {
      for (const trail of trip.trails ?? []) {
        if (!map.has(trail.id)) map.set(trail.id, new Set());
        map.get(trail.id)!.add(trip.id);
      }
    }
    return map;
  }, [trips]);

  // ── Autocomplete ────────────────────────────────────────────────────────────

  // Geocode the location field whenever it changes (debounced)
  useEffect(() => {
    if (geocodeDebounce.current) clearTimeout(geocodeDebounce.current);
    const loc = searchLocation.trim();
    if (loc.length < 2) { setGeocodedCoords(null); return; }
    geocodeDebounce.current = setTimeout(async () => {
      const coords = await geocodeLocation(loc);
      setGeocodedCoords(coords);
    }, 600);
    return () => { if (geocodeDebounce.current) clearTimeout(geocodeDebounce.current); };
  }, [searchLocation]);

  // Search trails as the name field changes (debounced), using cached coords
  useEffect(() => {
    if (suggestDebounce.current) clearTimeout(suggestDebounce.current);
    const q = searchName.trim();
    if (q.length < 3 || !geocodedCoords) { setSuggestions([]); return; }
    suggestDebounce.current = setTimeout(async () => {
      suggestAbort.current?.abort();
      const controller = new AbortController();
      suggestAbort.current = controller;
      try {
        const results = await searchTrails(q, geocodedCoords.lat, geocodedCoords.lng, undefined, controller.signal);
        setSuggestions(results.slice(0, 6));
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.error('Trail autocomplete search failed', err);
        setSuggestions([]);
      }
    }, 500);
    return () => {
      if (suggestDebounce.current) clearTimeout(suggestDebounce.current);
      suggestAbort.current?.abort();
    };
  }, [searchName, geocodedCoords]);

  // ── Elevation ───────────────────────────────────────────────────────────────

  // Compute elevation gain/loss for whichever trail is being previewed, so it's visible
  // before the user decides to add it. Skipped if the trail already has it or has no
  // geometry (manual entries).
  useEffect(() => {
    setPreviewElevation(null);
    setPreviewElevationLoading(false);
    if (!previewTrail || previewTrail.elevationGainM != null || !previewTrail.geometry || previewTrail.geometry.length < 2) {
      return;
    }
    const controller = new AbortController();
    setPreviewElevationLoading(true);
    getTrailElevation(previewTrail, controller.signal)
      .then((stats) => {
        if (!controller.signal.aborted) setPreviewElevation(stats);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewElevationLoading(false);
      });
    return () => controller.abort();
  }, [previewTrail]);

  // Backfill elevation in the background after a trail is saved to a trip, for whichever
  // path (search suggestion, manual entry) skipped waiting on the preview modal's live fetch.
  const enrichTrailElevation = useCallback(async (trail: Trail, tripId: string) => {
    const stats = await getTrailElevation(trail);
    if (!stats) return;
    const currentTrip = tripsRef.current.find((t) => t.id === tripId);
    if (!currentTrip?.trails?.some((t) => t.id === trail.id)) return; // removed before elevation resolved
    updateTrip(tripId, { trails: mergeElevationIntoTrails(currentTrip.trails, trail.id, stats) });
  }, [updateTrip]);

  // ── Search ──────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!searchLocation.trim()) {
      Alert.alert('Location required', 'Enter a location to search trails near.');
      return;
    }
    setSearching(true);
    setSearchResults(null);
    try {
      const coords = await geocodeLocation(searchLocation.trim());
      if (!coords) {
        Alert.alert('Location not found', 'Could not find that location. Try a more specific place name.');
        setSearching(false);
        return;
      }
      const results = await searchTrails(searchName.trim(), coords.lat, coords.lng, DEFAULT_SEARCH_RADIUS_M);
      setSearchResults(results);
      setSearchedRegion({ lat: coords.lat, lng: coords.lng, radiusM: DEFAULT_SEARCH_RADIUS_M });
      setMapKeySeed((k) => k + 1);
    } catch (err) {
      logger.error('Trail search failed', err);
      if (err instanceof OverpassError && err.status === 429) {
        Alert.alert('Trail database busy', 'Too many trail searches right now. Wait a few seconds and try again.');
      } else {
        Alert.alert('Search failed', 'Could not connect to the trail database. Check your connection and try again.');
      }
    } finally {
      setSearching(false);
    }
  }, [searchName, searchLocation]);

  // Re-queries centered on the current map viewport instead of the originally-searched
  // location, so panning/zooming to a new area can surface trails that weren't fetched the
  // first time around. Deliberately manual (a button tap), not automatic on every pan, so it
  // doesn't fire a fresh Overpass request on every drag frame against a shared public service.
  const handleSearchThisArea = useCallback(async () => {
    if (!mapRegion) return;
    setSearchingArea(true);
    try {
      const radiusM = Math.min(
        (Math.max(mapRegion.latitudeDelta, mapRegion.longitudeDelta) * METERS_PER_DEGREE_LAT) / 2,
        MAX_AREA_SEARCH_RADIUS_M
      );
      const results = await searchTrails(searchName.trim(), mapRegion.latitude, mapRegion.longitude, radiusM);
      setSearchResults(results);
      setSearchedRegion({ lat: mapRegion.latitude, lng: mapRegion.longitude, radiusM });
    } catch (err) {
      logger.error('Search-this-area trail search failed', err);
      if (err instanceof OverpassError && err.status === 429) {
        Alert.alert('Trail database busy', 'Too many trail searches right now. Wait a few seconds and try again.');
      } else {
        Alert.alert('Search failed', 'Could not connect to the trail database. Check your connection and try again.');
      }
    } finally {
      setSearchingArea(false);
    }
  }, [mapRegion, searchName]);

  // ── Add to trip ─────────────────────────────────────────────────────────────

  const handleAddToTrip = useCallback(
    (trail: Trail, tripId: string) => {
      const targetTrip = trips.find((t) => t.id === tripId);
      if (!targetTrip) return;
      const alreadyAdded = (targetTrip.trails ?? []).some((t) => t.id === trail.id);
      if (alreadyAdded) return;
      // If this is the trail currently in the preview modal and elevation already resolved
      // there, save it immediately instead of re-fetching in the background.
      const withElevation =
        trail.elevationGainM == null && previewTrail?.id === trail.id && previewElevation
          ? { ...trail, elevationGainM: previewElevation.gainM, elevationLossM: previewElevation.lossM }
          : trail;
      updateTrip(tripId, { trails: [...(targetTrip.trails ?? []), withElevation] });
      if (withElevation.elevationGainM == null) void enrichTrailElevation(withElevation, tripId);
    },
    [trips, updateTrip, previewTrail, previewElevation, enrichTrailElevation]
  );

  const handleAddManual = useCallback(async () => {
    if (!manualName.trim()) return;
    const distMi = parseFloat(manualDistance);
    const distKm = isNaN(distMi) ? undefined : miToKm(distMi);
    const elevGainFt = parseFloat(manualElevationGain);
    const elevGainM = isNaN(elevGainFt) ? undefined : Math.round(ftToM(elevGainFt));
    let trailheadLat: number | undefined;
    let trailheadLng: number | undefined;
    if (manualLocation.trim()) {
      const coords = await geocodeLocation(manualLocation.trim());
      if (coords) {
        trailheadLat = coords.lat;
        trailheadLng = coords.lng;
      }
    }
    const newTrail: Trail = {
      id: `manual_${Date.now()}`,
      name: manualName.trim(),
      distanceKm: distKm != null ? Math.round(distKm * 100) / 100 : undefined,
      elevationGainM: elevGainM,
      difficulty: manualDifficulty,
      notes: manualNotes.trim() || undefined,
      trailheadLat,
      trailheadLng,
    };
    setManualName('');
    setManualDistance('');
    setManualElevationGain('');
    setManualDifficulty(undefined);
    setManualNotes('');
    setManualLocation('');
    setShowManualForm(false);
    setAddTripModal(newTrail);
  }, [manualName, manualDistance, manualElevationGain, manualDifficulty, manualNotes, manualLocation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* OSM search */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search trails</Text>
          <Text style={styles.sectionSubtitle}>Powered by OpenStreetMap — leave the name blank to browse every trail near a location</Text>
          <View style={styles.autocompleteWrap}>
            <TextInput
              style={styles.input}
              value={searchName}
              onChangeText={setSearchName}
              placeholder="Trail name (optional)..."
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              autoCorrect={false}
            />
            {suggestions.length > 0 && (
              <View style={styles.suggestDropdown}>
                {suggestions.map((s) => {
                  const tripCount = trailInTrips.get(s.id)?.size ?? 0;
                  return (
                    <Pressable
                      key={s.id}
                      style={styles.suggestRow}
                      onPress={() => setAddTripModal(s)}
                    >
                      <Icon name="signpost" size={15} color={colors.primary} />
                      <View style={styles.suggestText}>
                        <Text style={styles.suggestName} numberOfLines={1}>{s.name}</Text>
                        {s.distanceKm != null && (
                          <Text style={styles.suggestMeta}>{formatMiles(s.distanceKm)}</Text>
                        )}
                      </View>
                      <Pressable onPress={() => setPreviewTrail(s)} hitSlop={8} style={styles.suggestMapBtn}>
                        <Icon name="map" size={16} color={colors.textSecondary} />
                      </Pressable>
                      {tripCount > 0 && <Badge>{tripCount}</Badge>}
                      <Icon name="circle-plus" size={18} color={colors.primary} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
          <TextInput
            style={styles.input}
            value={searchLocation}
            onChangeText={setSearchLocation}
            placeholder="Near (city, park, region)..."
            placeholderTextColor={colors.textTertiary}
          />
          <Button icon={searching ? undefined : 'search'} onPress={handleSearch} disabled={searching || !searchLocation.trim()}>
            {searching ? <ActivityIndicator color={colors.textInverse} size="small" /> : searchName.trim() ? 'Search' : 'Browse trails here'}
          </Button>

          {searchResults !== null && (
            <View style={styles.resultsWrapper}>
              <Text style={styles.resultsLabel}>
                {searchResults.length === 0
                  ? 'No trails found. Try a different name or expand the location.'
                  : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}, closest first — tap a trail on the map to preview & add`}
              </Text>
              {searchResults.length > 0 && (() => {
                const region = allResultsRegion(searchResults);
                if (!region) return (
                  <Text style={styles.resultsNoGeo}>No location data available for these results.</Text>
                );
                return (
                  <View style={styles.resultsMapWrap}>
                    <MapView
                      key={mapKeySeed}
                      style={styles.resultsMap}
                      initialRegion={region}
                      scrollEnabled
                      zoomEnabled
                      onRegionChangeComplete={setMapRegion}
                    >
                      {/* Polylines first so markers render on top */}
                      {searchResults.map((result) => {
                        if (!result.geometry || result.geometry.length < 2) return null;
                        const color = result.difficulty ? DIFFICULTY_MAP_COLOR[result.difficulty] : TRAIL_COLOR;
                        return (
                          <Polyline
                            key={result.id}
                            coordinates={result.geometry.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
                            strokeColor={color}
                            strokeWidth={3}
                          />
                        );
                      })}
                      {searchResults.map((result) => {
                        const coord = trailMarkerCoord(result);
                        if (!coord) return null;
                        const color = result.difficulty ? DIFFICULTY_MAP_COLOR[result.difficulty] : TRAIL_COLOR;
                        return (
                          <Marker
                            key={`m-${result.id}`}
                            coordinate={coord}
                            pinColor={color}
                            title={result.name}
                            description={result.distanceKm != null ? formatMiles(result.distanceKm) : undefined}
                            onPress={() => setPreviewTrail(result)}
                          />
                        );
                      })}
                    </MapView>
                    {showSearchAreaButton && (
                      <Pressable
                        style={styles.searchAreaButton}
                        onPress={handleSearchThisArea}
                        disabled={searchingArea}
                      >
                        {searchingArea ? (
                          <ActivityIndicator color={colors.textInverse} size="small" />
                        ) : (
                          <>
                            <Icon name="search" size={14} color={colors.textInverse} />
                            <Text style={styles.searchAreaButtonText}>Search this area</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                );
              })()}
            </View>
          )}
        </View>

        {/* Manual entry */}
        <View style={styles.section}>
          <Pressable style={styles.collapsibleHeader} onPress={() => setShowManualForm((v) => !v)}>
            <Text style={styles.sectionTitle}>Add manually</Text>
            <Icon name={showManualForm ? 'chevron-down' : 'chevron-right'} size={18} color={colors.textSecondary} />
          </Pressable>

          {showManualForm && (
            <>
              <TextInput
                style={styles.input}
                value={manualName}
                onChangeText={setManualName}
                placeholder="Trail name *"
                placeholderTextColor={colors.textTertiary}
              />
              <TextInput
                style={styles.input}
                value={manualDistance}
                onChangeText={setManualDistance}
                placeholder="Distance (mi)"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={styles.input}
                value={manualElevationGain}
                onChangeText={setManualElevationGain}
                placeholder="Elevation gain (ft)"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={styles.input}
                value={manualLocation}
                onChangeText={setManualLocation}
                placeholder="Trailhead location (for map pin)"
                placeholderTextColor={colors.textTertiary}
              />
              <View style={styles.difficultyRow}>
                {DIFFICULTIES.map((d) => (
                  <Tag key={d} selected={manualDifficulty === d} onPress={() => setManualDifficulty(manualDifficulty === d ? undefined : d)}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </Tag>
                ))}
              </View>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={manualNotes}
                onChangeText={setManualNotes}
                placeholder="Notes (optional)..."
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
              />
              <Button icon="plus" onPress={handleAddManual} disabled={!manualName.trim()}>Add trail</Button>
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Trail map preview modal */}
      <Modal visible={previewTrail !== null} transparent animationType="slide">
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewTrail(null)}>
          <Pressable style={styles.previewSheet} onPress={(e) => e.stopPropagation()}>

            {/* Sheet handle */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.previewHeader}>
              <View style={styles.previewHeaderInfo}>
                <Text style={styles.previewName} numberOfLines={1}>{previewTrail?.name}</Text>
                <View style={styles.previewMeta}>
                  {previewTrail?.distanceKm != null && (
                    <Text style={styles.previewMetaText}>{formatMiles(previewTrail.distanceKm)}</Text>
                  )}
                  {previewTrail?.difficulty && <Badge tone={trailDifficultyTone(previewTrail.difficulty)}>{previewTrail.difficulty}</Badge>}
                  {previewTrail && !previewTrail.geometry && <Text style={styles.previewManual}>manual entry</Text>}
                  {previewElevationLoading && (
                    <Text style={styles.previewMetaText}>Calculating elevation…</Text>
                  )}
                  {(() => {
                    const gainM = previewTrail?.elevationGainM ?? previewElevation?.gainM;
                    const lossM = previewTrail?.elevationLossM ?? previewElevation?.lossM;
                    if (gainM == null) return null;
                    return (
                      <Text style={styles.previewMetaText}>
                        ↑{formatFeet(gainM)} · ↓{formatFeet(lossM ?? 0)}
                      </Text>
                    );
                  })()}
                </View>
              </View>
              <Pressable onPress={() => setPreviewTrail(null)} hitSlop={12}>
                <Icon name="x" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>

            {/* Map */}
            {previewRegion ? (
              <MapView style={styles.previewMap} initialRegion={previewRegion} scrollEnabled zoomEnabled>
                {previewTrail?.geometry && previewTrail.geometry.length > 1 && (
                  <Polyline
                    coordinates={previewTrail.geometry.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
                    strokeColor={TRAIL_COLOR}
                    strokeWidth={4}
                  />
                )}
                {previewTrail?.trailheadLat != null && (
                  <Marker coordinate={{ latitude: previewTrail.trailheadLat, longitude: previewTrail.trailheadLng! }} pinColor={TRAIL_COLOR} />
                )}
              </MapView>
            ) : (
              <View style={styles.previewNoMap}>
                <Icon name="map" size={40} color={colors.textTertiary} />
                <Text style={styles.previewNoMapText}>No location data available for this trail.</Text>
              </View>
            )}

            {/* Footer */}
            <View style={styles.previewFooter}>
              <Button
                icon="plus"
                size="lg"
                onPress={() => {
                  const trail = previewTrail;
                  setPreviewTrail(null);
                  if (trail) setAddTripModal(trail);
                }}
              >
                Add to trip
              </Button>
            </View>

          </Pressable>
        </Pressable>
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
              const alreadyAdded = trailInTrips.get(addTripModal?.id ?? '')?.has(trip.id) ?? false;
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },

  // Sections
  section: {
    margin: spacing.space4,
    marginBottom: 0,
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.space4,
  },
  sectionTitle: {
    ...typography.titleMd,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.space3,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  // Inputs
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    padding: spacing.space3,
    fontFamily: fontFamily.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceApp,
    marginBottom: spacing.space2,
    marginTop: 4,
  },
  notesInput: {
    minHeight: 80,
  },

  // Difficulty chips
  difficultyRow: {
    flexDirection: 'row',
    gap: spacing.space2,
    marginBottom: spacing.space2,
  },

  // Map preview button (inline in autocomplete rows)
  suggestMapBtn: {
    marginRight: 2,
  },

  // Trail preview modal (bottom sheet)
  previewOverlay: {
    flex: 1,
    backgroundColor: colors.surfaceOverlay,
    justifyContent: 'flex-end',
  },
  previewSheet: {
    height: SCREEN_HEIGHT * 0.65,
    backgroundColor: colors.surfacePage,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.space4,
    paddingVertical: spacing.space3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  previewHeaderInfo: {
    flex: 1,
    marginRight: spacing.space3,
    gap: 4,
  },
  previewName: {
    ...typography.titleMd,
    color: colors.textPrimary,
  },
  previewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.space2,
  },
  previewMetaText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  previewManual: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  previewMap: {
    flex: 1,
  },
  previewNoMap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.space3,
    padding: spacing.space6,
  },
  previewNoMapText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  previewFooter: {
    padding: spacing.space4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },

  // Autocomplete dropdown
  autocompleteWrap: {
    zIndex: 10,
  },
  suggestDropdown: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.sm,
    marginTop: -4,
    marginBottom: spacing.space2,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    paddingHorizontal: spacing.space3,
    paddingVertical: spacing.space2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  suggestText: {
    flex: 1,
  },
  suggestName: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  suggestMeta: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // Search results map
  resultsWrapper: {
    marginTop: spacing.space3,
  },
  resultsLabel: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginBottom: spacing.space2,
  },
  resultsNoGeo: {
    ...typography.bodySm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.space2,
  },
  resultsMapWrap: {
    position: 'relative',
  },
  searchAreaButton: {
    position: 'absolute',
    top: spacing.space3,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.space2,
    paddingHorizontal: spacing.space4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchAreaButtonText: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textInverse,
  },
  resultsMap: {
    height: SCREEN_HEIGHT * 0.42,
    borderRadius: radii.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
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
});
