import {
  StyleSheet,
  Text,
  View,
  SectionList,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
  Image,
  type ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import type { Trip, TripType } from '../types';
import { TRIP_TYPES } from '../types';
import { colors, fontFamily, radii, spacing, typography } from '../constants/theme';
import { GOOGLE_PLACES_API_KEY } from '../config/googlePlaces';
import { staticMapUrl } from '../utils/placesApi';
import { useTripsContext } from '../context/TripsContext';
import { useAuthContext } from '../context/AuthContext';
import { formatDisplayDate, isTripArchived, getTripStatus } from '../utils/dateUtils';
import { INVITE_CODE_LENGTH } from '../utils/inviteCode';
import { AvatarGroup, Badge, Button, Dialog, IconButton, Input, Tag } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'TripsList'>;

type TypeFilter = 'all' | TripType;

/** Cover photo, falling back to a saved place's photo/map, then a flat brand color. */
function tripCoverSource(trip: Trip): ImageSourcePropType | null {
  const place = trip.places?.[0];
  if (place?.photoUrl) return { uri: place.photoUrl };
  if (place && GOOGLE_PLACES_API_KEY) return { uri: staticMapUrl(place.lat, place.lng, GOOGLE_PLACES_API_KEY) };
  return null;
}

function TripCard({ trip, onPress, onDelete }: { trip: Trip; onPress: () => void; onDelete: () => void }) {
  const cover = tripCoverSource(trip);
  const collaborators = Object.values(trip.collaborators).map((name) => ({ name }));
  const isOngoing = getTripStatus(trip.startDate, trip.endDate) === 'ongoing';

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cover}>
        {cover ? (
          <Image source={cover} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.forest200 }]} />
        )}
        <LinearGradient
          colors={['rgba(30,25,18,0)', 'rgba(30,25,18,0.75)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.coverTopRow}>
          <View style={styles.coverBadgeRow}>
            <Badge tone="neutral">{trip.type}</Badge>
            {isOngoing && <Badge tone="success">Ongoing</Badge>}
          </View>
          <IconButton
            icon="trash-2"
            label={`Delete ${trip.name}`}
            variant="ghost"
            size="sm"
            onPress={(e) => { e.stopPropagation(); onDelete(); }}
            style={styles.deleteButton}
          />
        </View>
        <View style={styles.coverBottom}>
          <Text style={styles.cardTitle} numberOfLines={1}>{trip.name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {trip.location ? `${trip.location} · ` : ''}
            {formatDisplayDate(trip.startDate)} – {formatDisplayDate(trip.endDate)}
          </Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <AvatarGroup people={collaborators} size={26} />
      </View>
    </Pressable>
  );
}

export default function TripsListScreen({ navigation }: Props) {
  const { trips, loading, deleteTrip, joinTripByCode } = useTripsContext();
  const { currentUser, signOut } = useAuthContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterType, setFilterType] = useState<TypeFilter>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);

  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    trips.forEach((t) => {
      if (t.location?.trim()) locs.add(t.location.trim());
    });
    return Array.from(locs).sort();
  }, [trips]);

  const filteredTrips = useMemo(() => {
    let result = trips;

    if (filterType !== 'all') {
      result = result.filter((t) => t.type === filterType);
    }
    if (filterLocation !== 'all') {
      result = result.filter((t) => (t.location ?? '').trim() === filterLocation);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q) ||
          (t.location ?? '').toLowerCase().includes(q) ||
          t.startDate.toLowerCase().includes(q) ||
          t.endDate.toLowerCase().includes(q)
      );
    }
    return result;
  }, [trips, searchQuery, filterType, filterLocation]);

  // Upcoming (incl. ongoing) vs. archived — the same boundary trip history uses (see dateUtils.isTripArchived).
  const sections = useMemo(() => {
    const upcoming: Trip[] = [];
    const past: Trip[] = [];
    for (const t of filteredTrips) (isTripArchived(t.endDate) ? past : upcoming).push(t);
    upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
    past.sort((a, b) => b.endDate.localeCompare(a.endDate));
    return [
      ...(upcoming.length ? [{ title: 'Upcoming', data: upcoming }] : []),
      ...(past.length ? [{ title: 'Past', data: past }] : []),
    ];
  }, [filteredTrips]);

  const handleAddTrip = useCallback(() => {
    navigation.navigate('NewTrip');
  }, [navigation]);

  const handleDeleteTrip = useCallback((trip: Trip) => {
    setDeleteTarget(trip);
  }, []);

  const isDeleteTargetOwner = deleteTarget?.ownerUid === currentUser?.uid;

  const confirmDeleteTrip = useCallback(() => {
    if (!deleteTarget) return;
    deleteTrip(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTrip, deleteTarget]);

  const handleJoinTrip = useCallback(async () => {
    const code = joinCode.trim().toUpperCase();
    // Accept legacy 6-char codes too — trips created before codes were lengthened still use them.
    if (code.length !== 6 && code.length !== INVITE_CODE_LENGTH) {
      Alert.alert('Invalid code', 'Please enter the invite code the trip owner shared with you.');
      return;
    }
    setJoining(true);
    const result = await joinTripByCode(code);
    setJoining(false);
    if (result === 'joined') {
      setJoinModalVisible(false);
      setJoinCode('');
      Alert.alert('Joined!', 'The trip has been added to your list.');
    } else if (result === 'already') {
      Alert.alert('Already joined', 'You are already a member of this trip.');
    } else {
      Alert.alert('Not found', 'No trip found with that code. Check the code and try again.');
    }
  }, [joinCode, joinTripByCode]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }, [signOut]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon="compass" label="My history" variant="ghost" size="sm" onPress={() => navigation.navigate('MyHistory')} />
          <IconButton icon="log-in" label="Join a trip" variant="ghost" size="sm" onPress={() => setJoinModalVisible(true)} />
          <IconButton icon="log-out" label="Sign out" variant="ghost" size="sm" onPress={handleSignOut} />
        </View>
      ),
    });
  }, [navigation, handleSignOut]);

  const renderItem = useCallback(
    ({ item }: { item: Trip }) => (
      <TripCard
        trip={item}
        onPress={() => navigation.navigate('TripDetail', { tripId: item.id })}
        onDelete={() => handleDeleteTrip(item)}
      />
    ),
    [navigation, handleDeleteTrip]
  );

  const keyExtractor = useCallback((item: Trip) => item.id, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading trips…</Text>
      </View>
    );
  }

  const hasActiveFilter = filterType !== 'all' || filterLocation !== 'all';

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <Input
            icon="search"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name, type, location, date..."
            clearButtonMode="while-editing"
          />
        </View>
        <IconButton
          icon="sliders-horizontal"
          label="Filter trips"
          variant={hasActiveFilter ? 'filled' : 'default'}
          onPress={() => setFilterVisible(true)}
        />
      </View>

      {trips.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptySubtitle}>Tap the button below to add your first trip.</Text>
        </View>
      ) : filteredTrips.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matching trips</Text>
          <Text style={styles.emptySubtitle}>Try a different search.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<View style={styles.listHeader} />}
          stickySectionHeadersEnabled={false}
        />
      )}

      <IconButton icon="plus" label="New trip" variant="filled" size="lg" style={styles.fab} onPress={handleAddTrip} />

      <Dialog
        open={filterVisible}
        title="Filter trips"
        onClose={() => setFilterVisible(false)}
        footer={<Button onPress={() => setFilterVisible(false)}>Done</Button>}
      >
        <View style={{ gap: spacing.space5 }}>
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionLabel}>Trip type</Text>
            <View style={styles.filterChipRow}>
              <Tag selected={filterType === 'all'} onPress={() => setFilterType('all')}>All</Tag>
              {TRIP_TYPES.map((t) => (
                <Tag key={t} selected={filterType === t} onPress={() => setFilterType(t)}>{t}</Tag>
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterSectionLabel}>Location</Text>
            <View style={styles.filterChipRow}>
              <Tag selected={filterLocation === 'all'} onPress={() => setFilterLocation('all')}>All</Tag>
              {uniqueLocations.map((loc) => (
                <Tag key={loc} selected={filterLocation === loc} onPress={() => setFilterLocation(loc)}>{loc}</Tag>
              ))}
            </View>
          </View>
        </View>
      </Dialog>

      <Dialog
        open={joinModalVisible}
        title="Join a trip"
        onClose={() => setJoinModalVisible(false)}
        footer={
          <Button onPress={handleJoinTrip} disabled={joining}>
            {joining ? 'Joining…' : 'Join trip'}
          </Button>
        }
      >
        <View style={{ gap: spacing.space4 }}>
          <Text style={styles.joinSubtitle}>Ask the trip owner for their invite code.</Text>
          <TextInput
            style={styles.joinInput}
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase())}
            placeholder="A3KX9F7Q"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={INVITE_CODE_LENGTH}
          />
        </View>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        title={isDeleteTargetOwner ? 'Delete trip' : 'Leave trip'}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button variant="secondary" onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onPress={confirmDeleteTrip}>
              {isDeleteTargetOwner ? 'Delete' : 'Leave'}
            </Button>
          </>
        }
      >
        {deleteTarget
          ? isDeleteTargetOwner
            ? `Delete "${deleteTarget.name}"? This cannot be undone.`
            : `Leave "${deleteTarget.name}"? You'll need a new invite code to rejoin.`
          : ''}
      </Dialog>
    </View>
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
    backgroundColor: colors.surfacePage,
    gap: 12,
  },
  loadingText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyTitle: {
    ...typography.titleLg,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.space3,
    marginBottom: spacing.space2,
    paddingHorizontal: spacing.space4,
    gap: spacing.space2,
  },
  listContent: {
    padding: spacing.space4,
    paddingBottom: 96,
    gap: spacing.space3,
  },
  listHeader: {
    height: 4,
  },
  sectionHeader: {
    ...typography.titleMd,
    fontFamily: fontFamily.display,
    color: colors.textPrimary,
    marginTop: spacing.space3,
    marginBottom: spacing.space2,
  },
  card: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cover: {
    height: 140,
    justifyContent: 'space-between',
  },
  coverTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.space3,
  },
  coverBadgeRow: {
    flexDirection: 'row',
    gap: spacing.space1,
  },
  deleteButton: {
    backgroundColor: colors.surfaceOverlaySoft,
  },
  coverBottom: {
    padding: spacing.space4,
    gap: 2,
  },
  cardTitle: {
    ...typography.titleMd,
    fontFamily: fontFamily.display,
    color: colors.cream50,
  },
  cardMeta: {
    ...typography.bodySm,
    color: colors.cream100,
  },
  cardFooter: {
    padding: spacing.space3,
    paddingTop: spacing.space2,
  },
  fab: {
    position: 'absolute',
    right: spacing.space5,
    bottom: spacing.space6,
    ...{
      shadowColor: colors.ink900,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 6,
    },
  },
  filterSection: {
    gap: spacing.space2,
  },
  filterSectionLabel: {
    ...typography.label,
    color: colors.textPrimary,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space2,
  },
  joinSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  joinInput: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    padding: spacing.space4,
    fontFamily: fontFamily.mono,
    fontSize: 22,
    letterSpacing: 4,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceCard,
    textAlign: 'center',
  },
});
