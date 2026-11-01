import { useMemo, useState, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import type { PackingItem, PackingCategory } from '../types';
import { colors, fontFamily, radii, spacing, typography } from '../constants/theme';
import { useTripsContext } from '../context/TripsContext';
import { useTripHistoryContext } from '../context/TripHistoryContext';
import { suggestPackingItemNames } from '../utils/tripHistoryStats';
import SuggestionInput from '../components/SuggestionInput';
import { Button, Dialog, Icon, Tag } from '../components/ui';

const PACKING_CATEGORIES: PackingCategory[] = ['Shelter', 'Clothing', 'Food', 'Other'];
const FILTER_ALL = 'All' as const;
type CategoryFilter = PackingCategory | typeof FILTER_ALL;

type Props = NativeStackScreenProps<RootStackParamList, 'EditPackingList'>;

/** Renders the first letter of a name as an avatar chip. */
function AvatarChip({ name, small }: { name: string; small?: boolean }) {
  return (
    <View style={[styles.avatarChip, small && styles.avatarChipSmall]}>
      <Text style={[styles.avatarText, small && styles.avatarTextSmall]}>
        {name.trim()[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

function ItemRow({
  item,
  collaboratorMap,
  itineraryTag,
  onToggle,
  onDelete,
  onAssign,
  onQtyChange,
  onEdit,
}: {
  item: PackingItem;
  collaboratorMap: Record<string, string>;
  /** e.g. "Arrive at campsite · Jun 10" if this item is linked to an event */
  itineraryTag?: string;
  onToggle: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onQtyChange: (delta: number) => void;
  onEdit: () => void;
}) {
  const assigned = item.assignedTo ?? [];
  const hasCollaborators = Object.keys(collaboratorMap).length > 0;
  const qty = item.quantity ?? 1;
  return (
    <View style={styles.itemRow}>
      <Pressable style={styles.checkbox} onPress={onToggle}>
        <Icon name={item.checked ? 'square-check' : 'square'} size={22} color={item.checked ? colors.primary : colors.textTertiary} />
      </Pressable>
      <Pressable style={styles.itemInfo} onPress={onEdit}>
        <Text style={[styles.itemName, item.checked && styles.itemChecked]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.itemMeta}>
          <Text style={styles.itemCategory}>{item.category}</Text>
          <View style={styles.qtyStepper}>
            <Pressable onPress={() => onQtyChange(-1)} disabled={qty <= 1} hitSlop={8} style={styles.qtyBtn}>
              <Text style={[styles.qtyBtnText, qty <= 1 && styles.qtyBtnDisabled]}>−</Text>
            </Pressable>
            <Text style={styles.qtyValue}>{qty}</Text>
            <Pressable onPress={() => onQtyChange(1)} hitSlop={8} style={styles.qtyBtn}>
              <Text style={styles.qtyBtnText}>+</Text>
            </Pressable>
          </View>
          {assigned.length > 0 && (
            <View style={styles.assignedRow}>
              {assigned.map((uid) => {
                const name = collaboratorMap[uid] ?? uid;
                return <AvatarChip key={uid} name={name} small />;
              })}
              <Text style={styles.assignedNames} numberOfLines={1}>
                {assigned.map((uid) => collaboratorMap[uid] ?? uid).join(', ')}
              </Text>
            </View>
          )}
          {!!itineraryTag && (
            <View style={styles.itineraryTagRow}>
              <Icon name="calendar" size={12} color={colors.info} />
              <Text style={styles.itineraryTag} numberOfLines={1}>{itineraryTag}</Text>
            </View>
          )}
          {!!item.notes && (
            <View style={styles.itineraryTagRow}>
              <Icon name="pen" size={12} color={colors.textTertiary} />
              <Text style={styles.itemNotes} numberOfLines={1}>{item.notes}</Text>
            </View>
          )}
        </View>
      </Pressable>
      {hasCollaborators && (
        <Pressable onPress={onAssign} style={styles.assignButton} hitSlop={8}>
          <Icon name="user" size={20} color={assigned.length > 0 ? colors.primary : colors.textTertiary} />
        </Pressable>
      )}
      <Pressable onPress={onDelete} style={styles.itemDelete} hitSlop={12}>
        <Icon name="trash-2" size={20} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}

export default function EditPackingListScreen({ route }: Props) {
  const { tripId } = route.params;
  const { trips, updateTrip } = useTripsContext();
  const { entries: historyEntries } = useTripHistoryContext();
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<PackingCategory>('Other');
  const [newItemQty, setNewItemQty] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(FILTER_ALL);

  // Suggestions from past trips' packing lists — only while actively typing, not shown at rest.
  const packingSuggestions = useMemo(() => {
    if (!newItemName.trim()) return [];
    return suggestPackingItemNames(historyEntries, newItemName);
  }, [historyEntries, newItemName]);
  const packingSuggestionByKey = useMemo(
    () => new Map(packingSuggestions.map((s) => [s.name.toLowerCase(), s])),
    [packingSuggestions]
  );

  const handleSelectPackingSuggestion = useCallback(
    (key: string) => {
      const suggestion = packingSuggestionByKey.get(key);
      if (!suggestion) return;
      setNewItemName(suggestion.name);
      setNewItemCategory(suggestion.category);
    },
    [packingSuggestionByKey]
  );

  // People info modal
  const [peopleModalVisible, setPeopleModalVisible] = useState(false);

  // Assign modal
  const [assignModalItem, setAssignModalItem] = useState<PackingItem | null>(null);

  // Edit item modal
  const [editModalItem, setEditModalItem] = useState<PackingItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<PackingCategory>('Other');
  const [editNotes, setEditNotes] = useState('');

  const trip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [trips, tripId]);

  // collaborators is Record<string, string> (uid → displayName) from Firebase
  const collaboratorMap: Record<string, string> = useMemo(
    () => (trip?.collaborators as Record<string, string>) ?? {},
    [trip]
  );
  const collaboratorEntries = useMemo(
    () => Object.entries(collaboratorMap), // [uid, displayName][]
    [collaboratorMap]
  );

  const filteredPackingList = useMemo(() => {
    if (!trip) return [];
    if (categoryFilter === FILTER_ALL) return trip.packingList;
    return trip.packingList.filter((item) => item.category === categoryFilter);
  }, [trip, categoryFilter]);

  // Map packing item id → first itinerary event label that references it
  const packingItineraryTags = useMemo(() => {
    const map: Record<string, string> = {};
    for (const event of (trip?.itinerary ?? [])) {
      for (const itemId of (event.packingItemIds ?? [])) {
        if (!map[itemId]) {
          const dateLabel = new Date(event.date.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          map[itemId] = `${event.title} · ${dateLabel}`;
        }
      }
    }
    return map;
  }, [trip?.itinerary]);

  // ── Item handlers ──────────────────────────────────────────────────────────

  const handleAddItem = useCallback(() => {
    if (!trip) return;
    const name = newItemName.trim();
    if (!name) return;
    const newItem: PackingItem = {
      id: `item_${Date.now()}`,
      name,
      category: newItemCategory,
      checked: false,
      quantity: newItemQty,
    };
    updateTrip(tripId, { packingList: [...trip.packingList, newItem] });
    setNewItemName('');
    setNewItemQty(1);
  }, [trip, tripId, newItemName, newItemCategory, newItemQty, updateTrip]);

  const handleToggle = useCallback(
    (itemId: string) => {
      if (!trip) return;
      const nextList = trip.packingList.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      );
      updateTrip(tripId, { packingList: nextList });
    },
    [trip, tripId, updateTrip]
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      if (!trip) return;
      Alert.alert('Remove item', 'Remove this item from the packing list?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const nextList = trip.packingList.filter((item) => item.id !== itemId);
            updateTrip(tripId, { packingList: nextList });
          },
        },
      ]);
    },
    [trip, tripId, updateTrip]
  );

  const handleQtyChange = useCallback(
    (itemId: string, delta: number) => {
      if (!trip) return;
      const nextList = trip.packingList.map((item) => {
        if (item.id !== itemId) return item;
        const next = Math.max(1, (item.quantity ?? 1) + delta);
        return { ...item, quantity: next };
      });
      updateTrip(tripId, { packingList: nextList });
    },
    [trip, tripId, updateTrip]
  );

  // ── Edit handlers ──────────────────────────────────────────────────────────

  const openEditModal = useCallback((item: PackingItem) => {
    setEditModalItem(item);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditNotes(item.notes ?? '');
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!trip || !editModalItem) return;
    const name = editName.trim();
    if (!name) return;
    const notes = editNotes.trim();
    const nextList = trip.packingList.map((item) =>
      item.id === editModalItem.id
        ? { ...item, name, category: editCategory, notes: notes ? notes : undefined }
        : item
    );
    updateTrip(tripId, { packingList: nextList });
    setEditModalItem(null);
  }, [trip, tripId, editModalItem, editName, editCategory, editNotes, updateTrip]);

  // ── Assign handlers ────────────────────────────────────────────────────────

  const handleToggleAssignee = useCallback(
    (uid: string) => {
      if (!trip || !assignModalItem) return;
      const current = assignModalItem.assignedTo ?? [];
      const next = current.includes(uid)
        ? current.filter((u) => u !== uid)
        : [...current, uid];
      const updatedItem = { ...assignModalItem, assignedTo: next };
      const nextList = trip.packingList.map((item) =>
        item.id === assignModalItem.id ? updatedItem : item
      );
      updateTrip(tripId, { packingList: nextList });
      setAssignModalItem(updatedItem);
    },
    [trip, tripId, assignModalItem, updateTrip]
  );

  if (!trip) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Trip not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Add item row */}
      <View style={styles.addRow}>
        <SuggestionInput
          inputStyle={styles.addInput}
          value={newItemName}
          onChangeText={setNewItemName}
          placeholder="New item..."
          onSubmitEditing={handleAddItem}
          suggestions={packingSuggestions.map((s) => ({
            key: s.name.toLowerCase(),
            label: s.name,
            sublabel: `${s.category} · used ${s.count}×`,
          }))}
          onSelect={handleSelectPackingSuggestion}
        />
        <View style={styles.addRowBottom}>
          <View style={styles.categoryRow}>
            {PACKING_CATEGORIES.map((cat) => (
              <Tag key={cat} selected={newItemCategory === cat} onPress={() => setNewItemCategory(cat)}>
                {cat}
              </Tag>
            ))}
          </View>
          <View style={styles.addQtyRow}>
            <Text style={styles.addQtyLabel}>Qty</Text>
            <View style={styles.qtyStepper}>
              <Pressable onPress={() => setNewItemQty((q) => Math.max(1, q - 1))} disabled={newItemQty <= 1} hitSlop={8} style={styles.qtyBtn}>
                <Text style={[styles.qtyBtnText, newItemQty <= 1 && styles.qtyBtnDisabled]}>−</Text>
              </Pressable>
              <Text style={styles.qtyValue}>{newItemQty}</Text>
              <Pressable onPress={() => setNewItemQty((q) => q + 1)} hitSlop={8} style={styles.qtyBtn}>
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <Button style={styles.addButton} onPress={handleAddItem}>Add</Button>
      </View>

      {/* People strip */}
      <Pressable style={styles.peopleStrip} onPress={() => setPeopleModalVisible(true)}>
        <Icon name="users" size={18} color={colors.primary} />
        {collaboratorEntries.length === 0 ? (
          <Text style={styles.peopleStripEmpty}>Share invite code to add collaborators</Text>
        ) : (
          <View style={styles.peopleStripAvatars}>
            {collaboratorEntries.map(([uid, name]) => (
              <AvatarChip key={uid} name={name} />
            ))}
            <Text style={styles.peopleStripNames} numberOfLines={1}>
              {collaboratorEntries.map(([, name]) => name).join(', ')}
            </Text>
          </View>
        )}
        <Icon name="chevron-right" size={16} color={colors.textTertiary} />
      </Pressable>

      {/* Category filter */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Filter by category:</Text>
        <View style={styles.filterChips}>
          <Tag selected={categoryFilter === FILTER_ALL} onPress={() => setCategoryFilter(FILTER_ALL)}>All</Tag>
          {PACKING_CATEGORIES.map((cat) => (
            <Tag key={cat} selected={categoryFilter === cat} onPress={() => setCategoryFilter(cat)}>{cat}</Tag>
          ))}
        </View>
      </View>

      {/* Item list */}
      {trip.packingList.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No packing items yet. Add one above.</Text>
        </View>
      ) : filteredPackingList.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No items in this category.</Text>
        </View>
      ) : (
        <View style={styles.listContent}>
          {filteredPackingList.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              collaboratorMap={collaboratorMap}
              itineraryTag={packingItineraryTags[item.id]}
              onToggle={() => handleToggle(item.id)}
              onDelete={() => handleDeleteItem(item.id)}
              onAssign={() => setAssignModalItem(item)}
              onQtyChange={(delta) => handleQtyChange(item.id, delta)}
              onEdit={() => openEditModal(item)}
            />
          ))}
        </View>
      )}

      {/* People info modal */}
      <Dialog
        open={peopleModalVisible}
        title="People on this trip"
        onClose={() => setPeopleModalVisible(false)}
        footer={<Button onPress={() => setPeopleModalVisible(false)}>Done</Button>}
      >
        {collaboratorEntries.length === 0 ? (
          <View style={styles.inviteHint}>
            <Icon name="link" size={28} color={colors.primary} />
            <Text style={styles.inviteHintText}>
              Share the invite code from the trip page so others can join. They&apos;ll appear here once they join.
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.personList} showsVerticalScrollIndicator={false}>
            {collaboratorEntries.map(([uid, name]) => (
              <View key={uid} style={styles.personRow}>
                <AvatarChip name={name} />
                <Text style={styles.personName}>{name}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </Dialog>

      {/* Edit item modal */}
      <Dialog
        open={editModalItem !== null}
        title="Edit item"
        onClose={() => setEditModalItem(null)}
        footer={
          <>
            <Button variant="secondary" onPress={() => setEditModalItem(null)}>Cancel</Button>
            <Button onPress={handleSaveEdit}>Save</Button>
          </>
        }
      >
        <View style={{ gap: spacing.space3 }}>
          <TextInput
            style={styles.addInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Item name"
            placeholderTextColor={colors.textTertiary}
          />
          <View style={styles.editCategoryRow}>
            {PACKING_CATEGORIES.map((cat) => (
              <Tag key={cat} selected={editCategory === cat} onPress={() => setEditCategory(cat)}>
                {cat}
              </Tag>
            ))}
          </View>
          <TextInput
            style={[styles.addInput, styles.notesInput]}
            value={editNotes}
            onChangeText={setEditNotes}
            placeholder="Notes (optional)"
            placeholderTextColor={colors.textTertiary}
            multiline
          />
        </View>
      </Dialog>

      {/* Assign item modal */}
      <Dialog
        open={assignModalItem !== null}
        title={`Assign "${assignModalItem?.name}"`}
        onClose={() => setAssignModalItem(null)}
        footer={<Button onPress={() => setAssignModalItem(null)}>Done</Button>}
      >
        <View style={{ gap: spacing.space2 }}>
          <Text style={styles.modalSubtitle}>Who is bringing this item?</Text>
          {collaboratorEntries.map(([uid, name]) => {
            const isSelected = (assignModalItem?.assignedTo ?? []).includes(uid);
            return (
              <Pressable
                key={uid}
                style={[styles.assignOption, isSelected && styles.assignOptionSelected]}
                onPress={() => handleToggleAssignee(uid)}
              >
                <AvatarChip name={name} />
                <Text style={[styles.assignOptionText, isSelected && styles.assignOptionTextSelected]}>{name}</Text>
                {isSelected && <Icon name="check" size={20} color={colors.primary} />}
              </Pressable>
            );
          })}
        </View>
      </Dialog>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  scrollContent: {
    paddingBottom: spacing.space7,
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
  addRow: {
    padding: spacing.space3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  addInput: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.space3,
    paddingVertical: spacing.space2,
    fontFamily: fontFamily.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceApp,
    marginBottom: spacing.space2,
  },
  addRowBottom: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.space3,
    marginBottom: spacing.space2,
  },
  addQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  addQtyLabel: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textSecondary,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space2,
    flex: 1,
  },
  addButton: {
    alignSelf: 'flex-start',
  },
  // People strip
  peopleStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.space4,
    paddingVertical: spacing.space3,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.space3,
  },
  peopleStripEmpty: {
    flex: 1,
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.primary,
  },
  peopleStripAvatars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  peopleStripNames: {
    ...typography.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
  // Filter
  filterRow: {
    paddingHorizontal: spacing.space4,
    paddingVertical: spacing.space3,
    backgroundColor: colors.surfacePage,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  filterLabel: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: spacing.space2,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space2,
  },
  // Empty
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.space7,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  // List
  listContent: {
    padding: spacing.space4,
    paddingBottom: spacing.space7,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    marginBottom: spacing.space2,
    padding: spacing.space3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  checkbox: {
    marginRight: spacing.space3,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  itemChecked: {
    textDecorationLine: 'line-through',
    color: colors.textTertiary,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  itemCategory: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceApp,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.xs,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  qtyBtn: {
    paddingHorizontal: 4,
  },
  qtyBtnText: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.primary,
  },
  qtyBtnDisabled: {
    color: colors.textTertiary,
  },
  qtyValue: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
    minWidth: 18,
    textAlign: 'center',
  },
  assignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  assignedNames: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.primary,
    flexShrink: 1,
  },
  itineraryTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  itineraryTag: {
    ...typography.caption,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.info,
  },
  itemNotes: {
    ...typography.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  assignButton: {
    padding: 4,
    marginRight: 4,
  },
  itemDelete: {
    padding: 4,
  },
  // Avatar chips
  avatarChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarChipSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  avatarText: {
    color: colors.textInverse,
    fontSize: 13,
    fontFamily: fontFamily.bodyBold,
  },
  avatarTextSmall: {
    fontSize: 10,
  },
  // Modal shared
  modalSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginBottom: spacing.space2,
  },
  // People modal
  inviteHint: {
    alignItems: 'center',
    gap: spacing.space3,
    paddingVertical: spacing.space5,
  },
  inviteHintText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  personList: {
    maxHeight: 200,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space3,
    paddingVertical: spacing.space3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  personName: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  // Edit modal
  editCategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space2,
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 0,
  },
  // Assign modal
  assignOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space3,
    paddingVertical: spacing.space3,
    paddingHorizontal: spacing.space3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  assignOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.forest100,
  },
  assignOptionText: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  assignOptionTextSelected: {
    color: colors.primary,
    fontFamily: fontFamily.bodySemiBold,
  },
});
