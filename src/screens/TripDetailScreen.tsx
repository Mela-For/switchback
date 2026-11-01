import { useMemo, useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Image,
  Alert,
  Share,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { usePreventRemove } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import type { TripType, TripPlace } from '../types';
import { TRIP_TYPES, PLACE_CATEGORIES, placeCategoryIcon, trailDifficultyTone } from '../types';
import { colors, fontFamily, radii, spacing, typography } from '../constants/theme';
import { useTripsContext } from '../context/TripsContext';
import { formatDisplayDate, toDateString, parseDateString, getTripStatus } from '../utils/dateUtils';
import { googleMapsUrl, googleMapsDirectionsUrl } from '../utils/placesApi';
import { formatMiles, formatFeet } from '../utils/units';
import { useTrailElevationBackfill } from '../hooks/useTrailElevationBackfill';
import LocationAutocompleteInput from '../components/LocationAutocompleteInput';
import PlaceDetailOverlay from '../components/PlaceDetailOverlay';
import TripChatScreen from './TripChatScreen';
import TripItineraryScreen from './TripItineraryScreen';
import TripSleepingScreen from './TripSleepingScreen';
import EditPackingListScreen from './EditPackingListScreen';
import { Badge, Button, Card, Dialog, Icon, IconButton, Tabs, type BadgeTone, type IconName, type TabItem } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetail'>;
type TabKey = 'itinerary' | 'sleeping' | 'packing' | 'trails' | 'places' | 'people' | 'chat';

const TABS: TabItem[] = [
  { value: 'itinerary', label: 'Itinerary' },
  { value: 'sleeping', label: 'Sleeping' },
  { value: 'packing', label: 'Packing' },
  { value: 'trails', label: 'Trails' },
  { value: 'places', label: 'Places' },
  { value: 'people', label: 'People' },
  { value: 'chat', label: 'Chat' },
];

const STATUS_TONE: Record<ReturnType<typeof getTripStatus>, BadgeTone> = {
  upcoming: 'info',
  ongoing: 'success',
  past: 'neutral',
};
const STATUS_LABEL: Record<ReturnType<typeof getTripStatus>, string> = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  past: 'Past',
};

export default function TripDetailScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { trips, updateTrip } = useTripsContext();
  const [activeTab, setActiveTab] = useState<TabKey>('itinerary');
  const [headerHeight, setHeaderHeight] = useState(0);
  const [editDatesVisible, setEditDatesVisible] = useState(false);
  const [editTypeVisible, setEditTypeVisible] = useState(false);
  const [editNotesVisible, setEditNotesVisible] = useState(false);
  const [editLocationVisible, setEditLocationVisible] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(new Date());
  const [draftEndDate, setDraftEndDate] = useState(new Date());
  const [draftNotes, setDraftNotes] = useState('');
  const [draftLocation, setDraftLocation] = useState('');
  const [pickingStart, setPickingStart] = useState(false);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [detailPlace, setDetailPlace] = useState<TripPlace | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);

  // Native stack header height for this screen, plus the custom header block
  // measured above — the exact space rendered above the Itinerary/Packing/
  // Trails/Chat tabs' embedded screens, so their keyboard-avoidance pushes up
  // by the right amount instead of leaving the keyboard covering their inputs.
  const nativeHeaderHeight = useHeaderHeight();
  const embeddedKeyboardOffset = (Platform.OS === 'ios' ? nativeHeaderHeight : 0) + headerHeight;

  const trip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [trips, tripId]);
  const trails = useMemo(() => trip?.trails ?? [], [trip]);
  const totalDistanceKm = useMemo(() => trails.reduce((sum, t) => sum + (t.distanceKm ?? 0), 0), [trails]);
  const hasElevationData = useMemo(() => trails.some((t) => t.elevationGainM != null), [trails]);
  const totalElevationGainM = useMemo(() => trails.reduce((sum, t) => sum + (t.elevationGainM ?? 0), 0), [trails]);
  // Backfills elevation for any saved trail missing it (added before this feature existed, or a
  // prior fetch failed) whenever the Trails tab is actually open.
  useTrailElevationBackfill(trip, updateTrip, activeTab === 'trails');

  useEffect(() => {
    if (trip) {
      navigation.setOptions({
        title: trip.name,
        headerRight: () => (
          <IconButton icon="share-2" label="Invite people" variant="ghost" size="sm" onPress={() => setInviteVisible(true)} />
        ),
      });
    }
  }, [trip, navigation]);

  // Full-screen overlays (place detail) render on top of this screen but
  // aren't real navigator screens, so the header's back button, the Android
  // hardware back button, and iOS's edge-swipe gesture would otherwise skip
  // straight past them to the previous screen (My Trips) instead of just
  // closing the overlay. A raw `beforeRemove` listener with e.preventDefault()
  // isn't safe on native-stack — the native side already completes the pop
  // before JS can cancel it, leaving JS/native state out of sync ("screen was
  // removed natively but didn't get removed from JS state"). usePreventRemove
  // is the native-stack-safe way to block it.
  const overlayOpen = mapExpanded || detailPlace !== null;
  usePreventRemove(overlayOpen, () => {
    if (mapExpanded) setMapExpanded(false);
    else if (detailPlace !== null) setDetailPlace(null);
  });

  const openDatesModal = useCallback(() => {
    if (trip) {
      setDraftStartDate(parseDateString(trip.startDate));
      setDraftEndDate(parseDateString(trip.endDate));
      setEditDatesVisible(true);
      setPickingStart(false);
      setPickingEnd(false);
    }
  }, [trip]);

  const saveDates = useCallback(() => {
    if (!trip) return;
    const startStr = toDateString(draftStartDate);
    const endStr = toDateString(draftEndDate);
    if (endStr >= startStr) {
      updateTrip(tripId, { startDate: startStr, endDate: endStr });
      setEditDatesVisible(false);
    }
  }, [trip, tripId, draftStartDate, draftEndDate, updateTrip]);

  const openNotesModal = useCallback(() => {
    if (trip) {
      setDraftNotes(trip.notes);
      setEditNotesVisible(true);
    }
  }, [trip]);

  const saveNotes = useCallback(() => {
    if (!trip) return;
    updateTrip(tripId, { notes: draftNotes });
    setEditNotesVisible(false);
  }, [trip, tripId, draftNotes, updateTrip]);

  const openLocationModal = useCallback(() => {
    if (trip) {
      setDraftLocation(trip.location ?? '');
      setEditLocationVisible(true);
    }
  }, [trip]);

  const saveLocation = useCallback(() => {
    if (!trip) return;
    updateTrip(tripId, { location: draftLocation.trim() || undefined });
    setEditLocationVisible(false);
  }, [trip, tripId, draftLocation, updateTrip]);

  const setTripType = useCallback(
    (type: TripType) => {
      updateTrip(tripId, { type });
      setEditTypeVisible(false);
    },
    [tripId, updateTrip]
  );

  const handleRemoveTrail = useCallback(
    (trailId: string) => {
      Alert.alert('Remove trail', 'Remove this trail from the trip?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const nextTrails = (trip?.trails ?? []).filter((t) => t.id !== trailId);
            // Clear trailId from any itinerary events that referenced this trail
            // (omit the key entirely — Firestore rejects undefined values in nested objects)
            const nextItinerary = (trip?.itinerary ?? []).map((e) => {
              if (e.trailId !== trailId) return e;
              const { trailId: _removed, ...rest } = e;
              return rest as typeof e;
            });
            updateTrip(tripId, { trails: nextTrails, itinerary: nextItinerary });
          },
        },
      ]);
    },
    [trip, tripId, updateTrip]
  );

  const handleRemovePlace = useCallback(
    (placeId: string, onRemoved?: () => void) => {
      Alert.alert('Remove place', 'Remove this place from the trip?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const nextPlaces = (trip?.places ?? []).filter((p) => p.placeId !== placeId);
            // Clear placeId from any itinerary events that referenced this place
            // (omit the key entirely — Firestore rejects undefined values in nested objects)
            const nextItinerary = (trip?.itinerary ?? []).map((e) => {
              if (e.placeId !== placeId) return e;
              const { placeId: _removed, ...rest } = e;
              return rest as typeof e;
            });
            updateTrip(tripId, { places: nextPlaces, itinerary: nextItinerary });
            onRemoved?.();
          },
        },
      ]);
    },
    [trip, tripId, updateTrip]
  );

  const handleShareInvite = useCallback(() => {
    if (!trip) return;
    Share.share({ message: `Join my trip "${trip.name}" on Switchback! Use invite code ${trip.inviteCode} to join.` });
  }, [trip]);

  const handleOpenPlaceDetail = useCallback((place: TripPlace) => {
    setDetailPlace(place);
    setMapExpanded(false);
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

  if (!trip) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Trip not found.</Text>
      </View>
    );
  }

  const status = getTripStatus(trip.startDate, trip.endDate);

  return (
    <>
      <View style={styles.container}>
        {/* Persistent header, visible above every tab */}
        <View style={styles.header} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
          <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
          <View style={styles.headerMetaRow}>
            <Pressable onPress={openDatesModal}>
              <Text style={styles.headerMetaText}>
                {formatDisplayDate(trip.startDate)} – {formatDisplayDate(trip.endDate)}
              </Text>
            </Pressable>
            <View style={styles.headerMetaDot} />
            <Pressable onPress={openLocationModal}>
              <Text style={styles.headerMetaText} numberOfLines={1}>{trip.location || 'Add location'}</Text>
            </Pressable>
          </View>
          <View style={styles.headerBottomRow}>
            <View style={styles.headerBadgeRow}>
              <Pressable onPress={() => setEditTypeVisible(true)}>
                <Badge>{trip.type}</Badge>
              </Pressable>
              <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
            </View>
            <View style={styles.headerActionsRow}>
              {((trip.places ?? []).length > 0 || (trip.trails ?? []).length > 0) && (
                <IconButton icon="map" label="View map" size="sm" onPress={() => navigation.navigate('TripMap', { tripId })} />
              )}
              <IconButton icon="book-open" label="Notes" size="sm" onPress={openNotesModal} />
            </View>
          </View>
          <View style={styles.tabsWrap}>
            <Tabs items={TABS} value={activeTab} onChange={(v) => setActiveTab(v as TabKey)} />
          </View>
        </View>

        {/* ── Itinerary tab — embeds the real TripItineraryScreen ─────── */}
        {activeTab === 'itinerary' && (
          <View style={styles.tabEmbedWrap}>
            <TripItineraryScreen
              route={{ key: 'trip-detail-itinerary-tab', name: 'TripItinerary', params: { tripId } } as any}
              navigation={navigation as any}
            />
          </View>
        )}

        {/* ── Sleeping tab — embeds the real TripSleepingScreen ───────── */}
        {activeTab === 'sleeping' && (
          <View style={styles.tabEmbedWrap}>
            <TripSleepingScreen
              route={{ key: 'trip-detail-sleeping-tab', name: 'TripSleeping', params: { tripId } } as any}
              navigation={navigation as any}
            />
          </View>
        )}

        {/* ── Packing tab — embeds the real EditPackingListScreen ─────── */}
        {activeTab === 'packing' && (
          <View style={styles.tabEmbedWrap}>
            <EditPackingListScreen
              route={{ key: 'trip-detail-packing-tab', name: 'EditPackingList', params: { tripId } } as any}
              navigation={navigation as any}
            />
          </View>
        )}

        {/* ── Trails tab — read-only summary; search/add happens in the standalone Browse Trails tab ─ */}
        {activeTab === 'trails' && (
          <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            {trails.length === 0 ? (
              <Text style={styles.emptyText}>
                No trails saved yet. Add some from the Browse Trails tab.
              </Text>
            ) : (
              <>
                <View style={styles.trailStatsBar}>
                  <View style={styles.trailStatItem}>
                    <Text style={styles.trailStatValue}>{trails.length}</Text>
                    <Text style={styles.trailStatLabel}>trail{trails.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.trailStatDivider} />
                  <View style={styles.trailStatItem}>
                    <Text style={styles.trailStatValue}>{formatMiles(totalDistanceKm)}</Text>
                    <Text style={styles.trailStatLabel}>total distance</Text>
                  </View>
                  {hasElevationData && (
                    <>
                      <View style={styles.trailStatDivider} />
                      <View style={styles.trailStatItem}>
                        <Text style={styles.trailStatValue}>↑{formatFeet(totalElevationGainM)}</Text>
                        <Text style={styles.trailStatLabel}>elevation gain</Text>
                      </View>
                    </>
                  )}
                </View>
                {trails.map((trail, idx) => (
                  <View key={trail.id} style={styles.trailRow}>
                    <View style={styles.trailOrder}>
                      <Text style={styles.trailOrderText}>{idx + 1}</Text>
                    </View>
                    <View style={styles.trailInfo}>
                      <Text style={styles.trailName} numberOfLines={1}>{trail.name}</Text>
                      <View style={styles.trailMeta}>
                        {trail.distanceKm != null && (
                          <Text style={styles.trailMetaText}>{formatMiles(trail.distanceKm)}</Text>
                        )}
                        {trail.elevationGainM != null && (
                          <Text style={styles.trailMetaText}>
                            ↑{formatFeet(trail.elevationGainM)} / ↓{formatFeet(trail.elevationLossM ?? 0)}
                          </Text>
                        )}
                        {trail.difficulty && <Badge tone={trailDifficultyTone(trail.difficulty)}>{trail.difficulty}</Badge>}
                        {!trail.geometry && <Badge>manual</Badge>}
                      </View>
                      {trail.notes ? (
                        <Text style={styles.trailNotes} numberOfLines={2}>{trail.notes}</Text>
                      ) : null}
                    </View>
                    <IconButton icon="trash-2" label="Remove trail" size="sm" onPress={() => handleRemoveTrail(trail.id)} />
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        )}

        {/* ── Places tab ────────────────────────────────────────────── */}
        {activeTab === 'places' && (
          <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            {(trip.places ?? []).length === 0 ? (
              <Text style={styles.emptyText}>No places saved yet.</Text>
            ) : (
              [...(trip.places ?? [])]
                .map((place) => ({
                  place,
                  scheduledEvent: (trip.itinerary ?? []).find((e) => e.placeId === place.placeId),
                }))
                .sort((a, b) => {
                  if (!a.scheduledEvent && !b.scheduledEvent) return 0;
                  if (!a.scheduledEvent) return 1;
                  if (!b.scheduledEvent) return -1;
                  return a.scheduledEvent.date.localeCompare(b.scheduledEvent.date);
                })
                .map(({ place, scheduledEvent }) => {
                const catInfo = PLACE_CATEGORIES.find((c) => c.value === place.category);
                const scheduledDate = scheduledEvent
                  ? new Date(scheduledEvent.date.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : null;
                return (
                  <Pressable key={place.placeId} onPress={() => handleOpenPlaceDetail(place)}>
                    <Card padding={0} style={styles.placeRow}>
                      {place.photoUrl ? (
                        <Image source={{ uri: place.photoUrl }} style={styles.placePhoto} resizeMode="cover" />
                      ) : (
                        <View style={[styles.placePhoto, styles.placePhotoPlaceholder]}>
                          <Icon name={placeCategoryIcon(place.category) as IconName} size={26} color={colors.forest500} />
                        </View>
                      )}
                      <View style={styles.placeInfo}>
                        <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
                        <View style={styles.placeCategoryRow}>
                          <Icon name={placeCategoryIcon(place.category) as IconName} size={12} color={colors.textSecondary} />
                          <Text style={styles.placeCategory}>{catInfo?.label ?? place.category}</Text>
                        </View>
                        {place.rating != null && (
                          <View style={styles.placeCategoryRow}>
                            <Icon name="star" size={12} color={colors.gold500} />
                            <Text style={styles.placeRating}>{place.rating.toFixed(1)}</Text>
                          </View>
                        )}
                        <Text style={styles.placeAddress} numberOfLines={1}>{place.address}</Text>
                        {scheduledDate && scheduledEvent && (
                          <Pressable
                            style={styles.placeCategoryRow}
                            onPress={() => navigation.navigate('TripItinerary', { tripId, initialDate: scheduledEvent.date })}
                            hitSlop={8}
                          >
                            <Icon name="calendar" size={12} color={colors.primary} />
                            <Text style={styles.placeScheduledBadge}>{scheduledDate}</Text>
                          </Pressable>
                        )}
                      </View>
                      <View style={styles.placeActions}>
                        <IconButton
                          icon="map"
                          label="Open in Maps"
                          size="sm"
                          onPress={() =>
                            Linking.openURL(
                              place.recreationGov ? googleMapsDirectionsUrl(place.lat, place.lng) : googleMapsUrl(place.placeId)
                            )
                          }
                        />
                        <IconButton icon="trash-2" label="Remove place" size="sm" onPress={() => handleRemovePlace(place.placeId)} />
                      </View>
                    </Card>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        )}

        {/* ── People tab ────────────────────────────────────────────── */}
        {activeTab === 'people' && (
          <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            {Object.entries(trip.collaborators ?? {}).map(([uid, name]) => (
              <Pressable
                key={uid}
                style={styles.personRow}
                onPress={() => navigation.navigate('MyAssignments', { tripId, uid })}
              >
                <View style={styles.personAvatar}>
                  <Text style={styles.personAvatarText}>{(name as string)[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <Text style={styles.personName} numberOfLines={1}>{name as string}</Text>
                <Badge tone={uid === trip.ownerUid ? 'success' : 'neutral'}>
                  {uid === trip.ownerUid ? 'Organizer' : 'Member'}
                </Badge>
                <Icon name="chevron-right" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
            <View style={styles.peopleActions}>
              <Button variant="secondary" icon="user" onPress={() => navigation.navigate('MyAssignments', { tripId })}>
                My assignments
              </Button>
              <IconButton icon="user-plus" label="Invite" onPress={() => setInviteVisible(true)} />
            </View>
          </ScrollView>
        )}

        {/* ── Chat tab — embeds the real TripChatScreen ────────────────── */}
        {activeTab === 'chat' && (
          <View style={styles.tabEmbedWrap}>
            <TripChatScreen
              route={{ key: 'trip-detail-chat-tab', name: 'TripChat', params: { tripId } } as any}
              navigation={navigation as any}
              keyboardVerticalOffset={embeddedKeyboardOffset}
            />
          </View>
        )}
      </View>

      {/* Place detail view */}
      {detailPlace && (
        <PlaceDetailOverlay
          place={detailPlace}
          onClose={() => setDetailPlace(null)}
          onRemove={() => handleRemovePlace(detailPlace.placeId, () => setDetailPlace(null))}
          onSaveNotes={handleSavePlaceNotes}
          mapExpanded={mapExpanded}
          onExpandMap={() => setMapExpanded(true)}
          onCollapseMap={() => setMapExpanded(false)}
        />
      )}

      {/* Edit dates modal with calendar */}
      <Dialog
        open={editDatesVisible}
        title="Edit dates"
        onClose={() => setEditDatesVisible(false)}
        footer={<Button onPress={saveDates}>Save</Button>}
      >
        <View style={{ gap: spacing.space3 }}>
          <Text style={styles.modalLabel}>Start date</Text>
          <Pressable style={styles.dateButton} onPress={() => { setPickingEnd(false); setPickingStart(true); }}>
            <Text style={styles.dateButtonText}>{formatDisplayDate(toDateString(draftStartDate))}</Text>
            <Text style={styles.tapHint}>Tap to pick</Text>
          </Pressable>
          {pickingStart && (
            <View>
              <DateTimePicker
                value={draftStartDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => {
                  if (d) setDraftStartDate(d);
                  if (Platform.OS === 'android') setPickingStart(false);
                }}
              />
              {Platform.OS === 'ios' && (
                <Pressable onPress={() => setPickingStart(false)}>
                  <Text style={styles.doneLink}>Done</Text>
                </Pressable>
              )}
            </View>
          )}
          <Text style={styles.modalLabel}>End date</Text>
          <Pressable style={styles.dateButton} onPress={() => { setPickingStart(false); setPickingEnd(true); }}>
            <Text style={styles.dateButtonText}>{formatDisplayDate(toDateString(draftEndDate))}</Text>
            <Text style={styles.tapHint}>Tap to pick</Text>
          </Pressable>
          {pickingEnd && (
            <View>
              <DateTimePicker
                value={draftEndDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={draftStartDate}
                onChange={(_, d) => {
                  if (d) setDraftEndDate(d);
                  if (Platform.OS === 'android') setPickingEnd(false);
                }}
              />
              {Platform.OS === 'ios' && (
                <Pressable onPress={() => setPickingEnd(false)}>
                  <Text style={styles.doneLink}>Done</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </Dialog>

      {/* Edit type modal */}
      <Dialog open={editTypeVisible} title="Trip type" onClose={() => setEditTypeVisible(false)}>
        <View style={{ gap: spacing.space2 }}>
          {TRIP_TYPES.map((t) => (
            <Pressable
              key={t}
              style={[styles.typeOption, trip.type === t && styles.typeOptionActive]}
              onPress={() => setTripType(t)}
            >
              <Text style={[styles.typeOptionText, trip.type === t && styles.typeOptionTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </Dialog>

      {/* Edit location modal */}
      <Dialog
        open={editLocationVisible}
        title="Location"
        onClose={() => setEditLocationVisible(false)}
        footer={<Button onPress={saveLocation}>Save</Button>}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <LocationAutocompleteInput value={draftLocation} onChangeText={setDraftLocation} />
        </KeyboardAvoidingView>
      </Dialog>

      {/* Edit notes modal */}
      <Dialog
        open={editNotesVisible}
        title="Edit notes"
        onClose={() => setEditNotesVisible(false)}
        footer={<Button onPress={saveNotes}>Save</Button>}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TextInput
            style={styles.notesInput}
            value={draftNotes}
            onChangeText={setDraftNotes}
            placeholder="Route ideas, permit info, contacts..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
          />
        </KeyboardAvoidingView>
      </Dialog>

      {/* Invite dialog */}
      <Dialog
        open={inviteVisible}
        title="Invite people"
        onClose={() => setInviteVisible(false)}
        footer={<Button icon="share-2" onPress={handleShareInvite}>Share code</Button>}
      >
        <View style={{ gap: spacing.space2 }}>
          <Text style={styles.inviteHint}>Share this code — anyone with it can join the trip.</Text>
          <View style={styles.inviteCodeBox}>
            <Text style={styles.inviteCodeText}>{trip.inviteCode}</Text>
          </View>
        </View>
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.space6,
    backgroundColor: colors.surfacePage,
  },
  errorText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },

  // Persistent header
  header: {
    paddingHorizontal: spacing.space5,
    paddingTop: spacing.space3,
    backgroundColor: colors.surfacePage,
  },
  name: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 24,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    marginBottom: spacing.space2,
  },
  headerMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  headerMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textTertiary,
  },
  headerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.space2,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    gap: spacing.space2,
  },
  headerActionsRow: {
    flexDirection: 'row',
    gap: spacing.space1,
  },
  tabsWrap: {
    marginHorizontal: -spacing.space5,
    paddingHorizontal: spacing.space5,
  },

  // Tab content
  tabScroll: {
    flex: 1,
  },
  tabContent: {
    padding: spacing.space5,
    paddingBottom: spacing.space9,
    gap: spacing.space2,
  },
  // Shared by every tab that embeds a full screen (Itinerary/Packing/Trails/Chat)
  tabEmbedWrap: {
    flex: 1,
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  tapHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 4,
  },
  modalLabel: {
    ...typography.label,
    color: colors.textPrimary,
  },
  dateButton: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    padding: spacing.space3,
    backgroundColor: colors.surfaceApp,
  },
  dateButtonText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  doneLink: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.primary,
    marginTop: spacing.space2,
  },
  notesInput: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    padding: spacing.space3,
    fontFamily: fontFamily.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceApp,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  typeOption: {
    padding: spacing.space3,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceApp,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  typeOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeOptionText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  typeOptionTextActive: {
    color: colors.textInverse,
    fontFamily: fontFamily.bodySemiBold,
  },
  // People tab
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space3,
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: 10,
    paddingHorizontal: spacing.space3,
  },
  personAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  personAvatarText: {
    color: colors.textInverse,
    fontSize: 13,
    fontFamily: fontFamily.bodyBold,
  },
  personName: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  peopleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    marginTop: spacing.space2,
  },
  inviteHint: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  inviteCodeBox: {
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceApp,
    paddingVertical: spacing.space4,
    alignItems: 'center',
  },
  inviteCodeText: {
    fontFamily: fontFamily.mono,
    fontSize: 24,
    letterSpacing: 4,
    color: colors.textPrimary,
  },

  // Trails tab
  trailStatsBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: spacing.space4,
    marginBottom: spacing.space4,
  },
  trailStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  trailStatValue: {
    ...typography.titleLg,
    fontFamily: fontFamily.display,
    color: colors.textPrimary,
  },
  trailStatLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  trailStatDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: 4,
  },
  trailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.space3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    gap: spacing.space3,
  },
  trailOrder: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  trailOrderText: {
    color: colors.textInverse,
    fontSize: 13,
    fontFamily: fontFamily.bodyBold,
  },
  trailInfo: {
    flex: 1,
    gap: 4,
  },
  trailName: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  trailMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.space2,
  },
  trailMetaText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  trailNotes: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // Places tab
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  placePhoto: {
    width: 72,
    height: 72,
  },
  placePhotoPlaceholder: {
    backgroundColor: colors.forest100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeInfo: {
    flex: 1,
    paddingHorizontal: spacing.space3,
    paddingVertical: spacing.space2,
    gap: 2,
  },
  placeName: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  placeCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  placeCategory: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  placeRating: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.brown800,
  },
  placeAddress: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  placeActions: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: spacing.space2,
    gap: spacing.space1,
  },
  placeScheduledBadge: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.primary,
  },

});
