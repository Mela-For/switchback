import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { placeCategoryIcon } from '../types';
import { colors, fontFamily, radii, spacing, typography } from '../constants/theme';
import { useTripsContext } from '../context/TripsContext';
import { formatDayHeading } from '../utils/dateUtils';
import { getNightlyStays, summarizeNightlyStays } from '../utils/overnightStays';
import { Badge, Icon, type IconName } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'TripSleeping'>;

export default function TripSleepingScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { trips } = useTripsContext();

  const trip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [trips, tripId]);

  const nightlyStays = useMemo(() => {
    if (!trip) return [];
    return getNightlyStays(trip.startDate, trip.endDate, trip.itinerary ?? [], trip.places ?? []);
  }, [trip]);

  const summary = useMemo(() => summarizeNightlyStays(nightlyStays), [nightlyStays]);

  if (!trip) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Trip not found.</Text>
      </View>
    );
  }

  if (nightlyStays.length === 0) {
    return (
      <View style={styles.centered}>
        <Icon name="tent" size={52} color={colors.borderStrong} />
        <Text style={styles.emptyTitle}>No nights on this trip</Text>
        <Text style={styles.emptySubtitle}>A single-day trip has no overnight stays to track.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{summary.assignedNights}/{summary.totalNights}</Text>
          <Text style={styles.statLabel}>nights set</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Badge tone={summary.gapNights.length > 0 ? 'warning' : 'success'}>
            {summary.gapNights.length > 0
              ? `${summary.gapNights.length} gap${summary.gapNights.length !== 1 ? 's' : ''}`
              : 'All set'}
          </Badge>
        </View>
      </View>

      {nightlyStays.map((stay) => (
        <Pressable
          key={stay.date}
          style={styles.row}
          onPress={() =>
            navigation.navigate('TripItinerary', {
              tripId,
              initialDate: stay.date,
              ...(stay.place ? {} : { openAddEvent: true }),
            })
          }
        >
          <View style={styles.rowIcon}>
            <Icon
              name={(stay.place ? placeCategoryIcon(stay.place.category) : 'circle-alert') as IconName}
              size={20}
              color={stay.place ? colors.primary : colors.warning}
            />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowDate}>{formatDayHeading(stay.date)}</Text>
            {stay.place ? (
              <Text style={styles.rowPlace} numberOfLines={1}>{stay.place.name}</Text>
            ) : (
              <Text style={styles.rowGap}>Unassigned — tap to add</Text>
            )}
          </View>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.space4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.space6,
    gap: spacing.space2,
    backgroundColor: colors.surfacePage,
  },
  emptyTitle: {
    ...typography.titleMd,
    fontFamily: fontFamily.display,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: spacing.space4,
    marginBottom: spacing.space4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  statValue: {
    ...typography.titleLg,
    fontFamily: fontFamily.display,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space3,
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.space4,
    marginBottom: spacing.space2,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowDate: {
    ...typography.label,
    color: colors.textSecondary,
  },
  rowPlace: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  rowGap: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.warning,
  },
});
