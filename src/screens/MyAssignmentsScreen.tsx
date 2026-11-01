import { useMemo, useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Modal, Platform } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import type { DayMeal, MealIngredient } from '../types';
import { colors, fontFamily, radii, spacing, typography } from '../constants/theme';
import { useTripsContext } from '../context/TripsContext';
import { useAuthContext } from '../context/AuthContext';
import { Card, Icon, Tag } from '../components/ui';
import { openExternalUrl } from '../utils/safeUrl';

type Props = NativeStackScreenProps<RootStackParamList, 'MyAssignments'>;

const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  dessert: 'Dessert',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function MyAssignmentsScreen({ route, navigation }: Props) {
  const { tripId, uid } = route.params;
  const { trips, updateTrip } = useTripsContext();
  const { currentUser } = useAuthContext();

  const [selectedMeal, setSelectedMeal] = useState<DayMeal | null>(null);

  const trip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [trips, tripId]);

  // Defaults to the current user when no uid is passed (the "My assignments" button), so
  // viewing your own assignments and viewing someone else's share the same screen — only the
  // target differs. Viewing anyone but yourself is read-only (see isSelf usage below).
  const targetUid = uid ?? currentUser?.uid;
  const isSelf = !!currentUser && targetUid === currentUser.uid;
  const targetName = isSelf ? 'You' : (targetUid ? trip?.collaborators?.[targetUid] ?? 'This person' : '');

  useEffect(() => {
    navigation.setOptions({ title: isSelf ? 'My Assignments' : `${targetName}'s Assignments` });
  }, [navigation, isSelf, targetName]);

  const myPackingItems = useMemo(() => {
    if (!trip || !targetUid) return [];
    return trip.packingList.filter(
      (item) => (item.assignedTo ?? []).includes(targetUid)
    );
  }, [trip, targetUid]);

  // DayMeals where the target person is assigned as cook
  const myMeals = useMemo(() => {
    if (!trip || !targetUid) return [];
    return (trip.meals ?? []).filter(
      (m) => (m.assigneeUids ?? []).includes(targetUid)
    );
  }, [trip, targetUid]);

  // Ingredients the target person is assigned to bring, with their parent meal for context
  const myIngredients = useMemo(() => {
    if (!trip || !targetUid) return [];
    const result: { ingredient: MealIngredient; meal: DayMeal }[] = [];
    for (const meal of trip.meals ?? []) {
      for (const ing of meal.ingredients ?? []) {
        if ((ing.assigneeUids ?? []).includes(targetUid)) {
          result.push({ ingredient: ing, meal });
        }
      }
    }
    return result;
  }, [trip, targetUid]);

  // Checking items off is only allowed on your own assignments — someone else's list is
  // read-only. The check state itself is shared (one `checked` boolean per item, same as the
  // packing list already works), so checking your own copy of a shared item marks it done for
  // everyone assigned to it too — that's intentional, not a bug.
  const togglePackingItem = (itemId: string) => {
    if (!trip || !isSelf) return;
    const nextList = trip.packingList.map((i) =>
      i.id === itemId ? { ...i, checked: !i.checked } : i
    );
    updateTrip(tripId, { packingList: nextList });
  };

  const toggleIngredient = (mealId: string, ingredientId: string) => {
    if (!trip || !isSelf) return;
    const nextMeals = (trip.meals ?? []).map((m) => {
      if (m.id !== mealId) return m;
      return {
        ...m,
        ingredients: (m.ingredients ?? []).map((ing) =>
          ing.id === ingredientId ? { ...ing, checked: !ing.checked } : ing
        ),
      };
    });
    updateTrip(tripId, { meals: nextMeals });
  };

  if (!trip) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Trip not found.</Text>
      </View>
    );
  }

  // Keep selectedMeal in sync with live trip data (so checkboxes reflect updates)
  const liveMeal = selectedMeal
    ? (trip.meals ?? []).find((m) => m.id === selectedMeal.id) ?? null
    : null;

  const packingDone = myPackingItems.filter((i) => i.checked).length;
  const ingredientsDone = myIngredients.filter(({ ingredient, meal }) => {
    const liveIng = (trip.meals ?? [])
      .find((m) => m.id === meal.id)
      ?.ingredients?.find((i) => i.id === ingredient.id);
    return liveIng?.checked ?? false;
  }).length;
  const checkableTotal = myPackingItems.length + myIngredients.length;
  const checkableDone = packingDone + ingredientsDone;
  const totalAssignments = myPackingItems.length + myMeals.length + myIngredients.length;
  const hasAny = totalAssignments > 0;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary banner */}
        <View style={styles.banner}>
          <View style={styles.bannerLeft}>
            <Text style={styles.bannerTrip} numberOfLines={1}>{trip.name}</Text>
            <Text style={styles.bannerSub}>
              {!hasAny
                ? 'Nothing assigned to you yet'
                : `${totalAssignments} assignment${totalAssignments !== 1 ? 's' : ''} total`}
            </Text>
          </View>
          {checkableTotal > 0 && (
            <View style={styles.progressRing}>
              <Text style={styles.progressText}>
                {Math.round((checkableDone / checkableTotal) * 100)}%
              </Text>
            </View>
          )}
        </View>

        {!hasAny ? (
          <View style={styles.emptyState}>
            <Icon name="circle-check" size={52} color={colors.borderStrong} />
            <Text style={styles.emptyTitle}>No assignments yet</Text>
            <Text style={styles.emptySubtitle}>
              {isSelf
                ? 'When someone assigns a task to you, it will appear here.'
                : `Nothing has been assigned to ${targetName} yet.`}
            </Text>
          </View>
        ) : (
          <>
            {/* Packing items */}
            {myPackingItems.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Packing items</Text>
                {myPackingItems.map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.itemRow}
                    disabled={!isSelf}
                    onPress={() => togglePackingItem(item.id)}
                  >
                    <View style={styles.checkbox}>
                      <Icon name={item.checked ? 'square-check' : 'square'} size={24} color={item.checked ? colors.primary : colors.textTertiary} />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, item.checked && styles.itemChecked]}>{item.name}</Text>
                      <Text style={styles.itemCategory}>{item.category}</Text>
                    </View>
                    {item.checked && <Icon name="check" size={18} color={colors.primary} />}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Meals to cook */}
            {myMeals.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Meals to cook</Text>
                {myMeals.map((meal) => (
                  <Pressable key={meal.id} style={styles.itemRow} onPress={() => setSelectedMeal(meal)}>
                    <View style={styles.infoIcon}>
                      <Icon name="utensils" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>
                        {SLOT_LABEL[meal.slot] ?? meal.slot}
                        {meal.recipeName ? ` · ${meal.recipeName}` : ''}
                      </Text>
                      <Text style={styles.itemCategory}>{formatDate(meal.date)}</Text>
                    </View>
                    <Icon name="chevron-right" size={16} color={colors.textTertiary} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Ingredients to bring */}
            {myIngredients.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Ingredients to bring</Text>
                {myIngredients.map(({ ingredient, meal }) => {
                  // Use live ingredient data so checkbox reflects updates
                  const liveIng = (trip.meals ?? [])
                    .find((m) => m.id === meal.id)
                    ?.ingredients?.find((i) => i.id === ingredient.id) ?? ingredient;
                  return (
                    <Pressable
                      key={ingredient.id}
                      style={styles.itemRow}
                      disabled={!isSelf}
                      onPress={() => toggleIngredient(meal.id, ingredient.id)}
                    >
                      <View style={styles.checkbox}>
                        <Icon name={liveIng.checked ? 'square-check' : 'square'} size={24} color={liveIng.checked ? colors.primary : colors.textTertiary} />
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={[styles.itemName, liveIng.checked && styles.itemChecked]}>
                          {ingredient.name}
                          {ingredient.amount ? ` — ${ingredient.amount}` : ''}
                        </Text>
                        <Text style={styles.itemCategory}>
                          {SLOT_LABEL[meal.slot] ?? meal.slot}
                          {meal.recipeName ? ` · ${meal.recipeName}` : ''}
                          {' · '}
                          {formatDate(meal.date)}
                        </Text>
                      </View>
                      {liveIng.checked && <Icon name="check" size={18} color={colors.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Meal detail modal ─────────────────────────────────────────── */}
      <Modal visible={!!liveMeal} animationType="slide" onRequestClose={() => setSelectedMeal(null)}>
        {liveMeal && (
          <View style={{ flex: 1, backgroundColor: colors.surfacePage }}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setSelectedMeal(null)} hitSlop={12}>
                <Icon name="x" size={26} color={colors.textPrimary} />
              </Pressable>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>{SLOT_LABEL[liveMeal.slot] ?? liveMeal.slot}</Text>
                <Text style={styles.modalSubtitle}>{formatDate(liveMeal.date)}</Text>
              </View>
              <View style={{ width: 26 }} />
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Recipe */}
              {(liveMeal.recipeName || liveMeal.recipeUrl) && (
                <Card style={styles.recipeCard}>
                  <Icon name="book-open" size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    {liveMeal.recipeName ? <Text style={styles.recipeName}>{liveMeal.recipeName}</Text> : null}
                    {liveMeal.recipeUrl ? (
                      <Pressable onPress={() => openExternalUrl(liveMeal.recipeUrl)}>
                        <Text style={styles.recipeUrl} numberOfLines={1}>{liveMeal.recipeUrl}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {liveMeal.recipeUrl ? (
                    <Pressable onPress={() => openExternalUrl(liveMeal.recipeUrl)} hitSlop={8}>
                      <Icon name="external-link" size={20} color={colors.primary} />
                    </Pressable>
                  ) : null}
                </Card>
              )}

              {/* Who's cooking */}
              {(liveMeal.assigneeUids ?? []).length > 0 && (
                <>
                  <Text style={styles.detailLabel}>Who&apos;s cooking</Text>
                  <View style={styles.chipRow}>
                    {(liveMeal.assigneeUids ?? []).map((uid) => (
                      <Tag key={uid}>{trip.collaborators?.[uid] ?? uid}</Tag>
                    ))}
                  </View>
                </>
              )}

              {/* Ingredients */}
              {(liveMeal.ingredients ?? []).length > 0 && (
                <>
                  <Text style={styles.detailLabel}>Ingredients</Text>
                  {(liveMeal.ingredients ?? []).map((ing) => (
                    <Pressable
                      key={ing.id}
                      style={styles.ingredientRow}
                      disabled={!isSelf}
                      onPress={() => toggleIngredient(liveMeal.id, ing.id)}
                    >
                      <View style={styles.checkbox}>
                        <Icon name={ing.checked ? 'square-check' : 'square'} size={22} color={ing.checked ? colors.primary : colors.textTertiary} />
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={[styles.itemName, ing.checked && styles.itemChecked]}>
                          {ing.name}
                          {ing.amount ? ` — ${ing.amount}` : ''}
                        </Text>
                        {(ing.assigneeUids ?? []).length > 0 && (
                          <Text style={styles.itemCategory}>
                            Brought by: {(ing.assigneeUids ?? []).map((uid) => trip.collaborators?.[uid] ?? uid).join(', ')}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  ))}
                </>
              )}

              {/* Notes */}
              {!!liveMeal.notes && (
                <>
                  <Text style={styles.detailLabel}>Notes</Text>
                  <Text style={styles.notesText}>{liveMeal.notes}</Text>
                </>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.space5,
    paddingBottom: spacing.space9,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.space6,
    backgroundColor: colors.surfacePage,
  },

  // Summary banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    padding: spacing.space5,
    marginBottom: spacing.space6,
  },
  bannerLeft: {
    flex: 1,
    gap: 4,
  },
  bannerTrip: {
    ...typography.titleMd,
    color: colors.textInverse,
  },
  bannerSub: {
    ...typography.bodySm,
    color: colors.forest200,
  },
  progressRing: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceOverlaySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.space3,
  },
  progressText: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodyBold,
    color: colors.textInverse,
  },

  // Section
  section: {
    marginBottom: spacing.space7,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.space2,
    textTransform: 'uppercase',
  },

  // Item rows (checkable + tappable)
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: spacing.space3,
    paddingHorizontal: spacing.space3,
    marginBottom: spacing.space2,
    gap: spacing.space2,
  },
  checkbox: {
    width: 26,
    alignItems: 'center',
  },
  infoIcon: {
    width: 26,
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  itemChecked: {
    textDecorationLine: 'line-through',
    color: colors.textTertiary,
  },
  itemCategory: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
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
    paddingHorizontal: spacing.space4,
  },

  // Meal detail modal
  modalHeader: {
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
  modalHeaderText: {
    alignItems: 'center',
    gap: 2,
  },
  modalTitle: {
    ...typography.titleMd,
    color: colors.textPrimary,
  },
  modalSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: spacing.space5,
    paddingBottom: spacing.space9,
  },

  // Recipe card
  recipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space3,
    marginBottom: spacing.space5,
  },
  recipeName: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  recipeUrl: {
    ...typography.bodySm,
    color: colors.textLink,
    textDecorationLine: 'underline',
  },

  // Detail section labels
  detailLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.space2,
    marginTop: 4,
  },

  // Ingredient rows in modal
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: spacing.space2,
    paddingHorizontal: spacing.space3,
    marginBottom: spacing.space1,
    gap: spacing.space2,
  },

  // Who's cooking chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space2,
    marginBottom: spacing.space5,
  },

  // Notes
  notesText: {
    ...typography.bodySm,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.space4,
  },
});
