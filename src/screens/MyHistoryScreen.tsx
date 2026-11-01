import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Dimensions } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { placeCategoryIcon, PLACE_CATEGORIES } from '../types';
import { colors, fontFamily, radii, spacing, typography } from '../constants/theme';
import { formatMiles, formatFeet } from '../utils/units';
import { formatDisplayDate } from '../utils/dateUtils';
import { useTripHistoryContext } from '../context/TripHistoryContext';
import { computeTripHistoryLedger, computeLifeList } from '../utils/tripHistoryStats';
import { Card, Icon, Tabs, type IconName, type TabItem } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'MyHistory'>;
type ViewKey = 'recap' | 'lifelist';

const VIEWS: TabItem[] = [
  { value: 'recap', label: 'Recap' },
  { value: 'lifelist', label: 'Life List' },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

function placeCategoryLabel(category: string): string {
  return PLACE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export default function MyHistoryScreen(_props: Props) {
  const { entries, loading } = useTripHistoryContext();
  const [view, setView] = useState<ViewKey>('recap');

  const ledger = useMemo(() => computeTripHistoryLedger(entries), [entries]);
  const lifeList = useMemo(() => computeLifeList(entries), [entries]);

  if (loading) {
    return <View style={styles.container} />;
  }

  if (entries.length === 0) {
    return (
      <View style={styles.centered}>
        <Icon name="compass" size={52} color={colors.borderStrong} />
        <Text style={styles.emptyTitle}>No trips archived yet</Text>
        <Text style={styles.emptySubtitle}>History builds up once your trips finish.</Text>
      </View>
    );
  }

  const nightsByCategoryEntries = Object.entries(ledger.nightsByCategory).filter(([, count]) => (count ?? 0) > 0);

  return (
    <View style={styles.container}>
      <View style={styles.tabsWrap}>
        <Tabs items={VIEWS} value={view} onChange={(v) => setView(v as ViewKey)} />
      </View>

      {view === 'recap' && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recapScroll}
        >
          {/* Hero slide */}
          <View style={styles.slide}>
            <Card style={styles.slideCard}>
              <Text style={styles.slideEyebrow}>Your trips</Text>
              <View style={styles.heroRow}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroValue}>{ledger.totalTrips}</Text>
                  <Text style={styles.heroLabel}>trip{ledger.totalTrips !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroValue}>{ledger.totalNights}</Text>
                  <Text style={styles.heroLabel}>night{ledger.totalNights !== 1 ? 's' : ''} outdoors</Text>
                </View>
              </View>
            </Card>
          </View>

          {/* Nights by category */}
          {nightsByCategoryEntries.length > 0 && (
            <View style={styles.slide}>
              <Card style={styles.slideCard}>
                <Text style={styles.slideEyebrow}>Where you slept</Text>
                <View style={styles.categoryList}>
                  {nightsByCategoryEntries.map(([category, count]) => (
                    <View key={category} style={styles.categoryRow}>
                      <Icon name={placeCategoryIcon(category as never) as IconName} size={18} color={colors.primary} />
                      <Text style={styles.categoryLabel}>{placeCategoryLabel(category)}</Text>
                      <Text style={styles.categoryCount}>{count} night{count !== 1 ? 's' : ''}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          )}

          {/* Trail stats */}
          {ledger.totalTrailDistanceKm > 0 && (
            <View style={styles.slide}>
              <Card style={styles.slideCard}>
                <Text style={styles.slideEyebrow}>On the trail</Text>
                <View style={styles.heroRow}>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroValue}>{formatMiles(ledger.totalTrailDistanceKm)}</Text>
                    <Text style={styles.heroLabel}>total distance</Text>
                  </View>
                  {ledger.totalElevationGainM > 0 && (
                    <View style={styles.heroStat}>
                      <Text style={styles.heroValue}>↑{formatFeet(ledger.totalElevationGainM)}</Text>
                      <Text style={styles.heroLabel}>elevation gain</Text>
                    </View>
                  )}
                </View>
                {ledger.longestTrail && (
                  <Text style={styles.slideFootnote}>
                    Longest: {ledger.longestTrail.name} ({formatMiles(ledger.longestTrail.distanceKm)}) on {ledger.longestTrail.tripName}
                  </Text>
                )}
              </Card>
            </View>
          )}

          {/* Most visited location */}
          {ledger.mostVisitedLocation && (
            <View style={styles.slide}>
              <Card style={styles.slideCard}>
                <Text style={styles.slideEyebrow}>You keep coming back to</Text>
                <Text style={styles.heroValue}>{ledger.mostVisitedLocation.location}</Text>
                <Text style={styles.heroLabel}>
                  {ledger.mostVisitedLocation.count} trip{ledger.mostVisitedLocation.count !== 1 ? 's' : ''}
                </Text>
              </Card>
            </View>
          )}
        </ScrollView>
      )}

      {view === 'lifelist' && (
        <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionHeading}>Places</Text>
          {lifeList.places.length === 0 ? (
            <Text style={styles.emptyText}>No places yet.</Text>
          ) : (
            lifeList.places.map((place) => (
              <View key={place.key} style={styles.listRow}>
                <View style={styles.listRowIcon}>
                  <Icon name={placeCategoryIcon(place.category) as IconName} size={18} color={colors.forest500} />
                </View>
                <View style={styles.listRowInfo}>
                  <Text style={styles.listRowName} numberOfLines={1}>{place.name}</Text>
                  <Text style={styles.listRowMeta} numberOfLines={1}>
                    {place.location ? `${place.location} · ` : ''}
                    {place.visitCount} visit{place.visitCount !== 1 ? 's' : ''} · last {formatDisplayDate(place.lastVisitedDate)}
                  </Text>
                </View>
              </View>
            ))
          )}

          <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>Trails</Text>
          {lifeList.trails.length === 0 ? (
            <Text style={styles.emptyText}>No trails yet.</Text>
          ) : (
            lifeList.trails.map((trail) => (
              <View key={trail.key} style={styles.listRow}>
                <View style={styles.listRowIcon}>
                  <Icon name="signpost" size={18} color={colors.forest500} />
                </View>
                <View style={styles.listRowInfo}>
                  <Text style={styles.listRowName} numberOfLines={1}>{trail.name}</Text>
                  <Text style={styles.listRowMeta} numberOfLines={1}>
                    {trail.distanceKm != null ? `${formatMiles(trail.distanceKm)} · ` : ''}
                    {trail.visitCount} visit{trail.visitCount !== 1 ? 's' : ''} · last {formatDisplayDate(trail.lastVisitedDate)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
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
  emptyText: {
    ...typography.bodySm,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  tabsWrap: {
    paddingHorizontal: spacing.space5,
    backgroundColor: colors.surfacePage,
  },

  // Recap
  recapScroll: {
    alignItems: 'center',
  },
  slide: {
    width: SCREEN_WIDTH,
    paddingHorizontal: spacing.space5,
    paddingVertical: spacing.space6,
  },
  slideCard: {
    gap: spacing.space4,
  },
  slideEyebrow: {
    ...typography.label,
    color: colors.textSecondary,
  },
  slideFootnote: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  heroRow: {
    flexDirection: 'row',
    gap: spacing.space6,
  },
  heroStat: {
    gap: 2,
  },
  heroValue: {
    ...typography.displayMd,
    fontFamily: fontFamily.display,
    color: colors.textPrimary,
  },
  heroLabel: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  categoryList: {
    gap: spacing.space3,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
  },
  categoryLabel: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    flex: 1,
  },
  categoryCount: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textSecondary,
  },

  // Life list
  tabScroll: {
    flex: 1,
  },
  tabContent: {
    padding: spacing.space5,
    paddingBottom: spacing.space9,
  },
  sectionHeading: {
    ...typography.titleMd,
    fontFamily: fontFamily.display,
    color: colors.textPrimary,
    marginBottom: spacing.space2,
  },
  sectionHeadingSpaced: {
    marginTop: spacing.space5,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space3,
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: spacing.space3,
    paddingHorizontal: spacing.space3,
    marginBottom: spacing.space2,
  },
  listRowIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.forest100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRowInfo: {
    flex: 1,
    gap: 2,
  },
  listRowName: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  listRowMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
