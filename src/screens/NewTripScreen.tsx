import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import type { TripType } from '../types';
import { TRIP_TYPES } from '../types';
import { colors, radii, spacing, typography } from '../constants/theme';
import { useTripsContext } from '../context/TripsContext';
import { toDateString, formatDisplayDate } from '../utils/dateUtils';
import LocationAutocompleteInput from '../components/LocationAutocompleteInput';
import { Button, Icon, Input, Tag } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'NewTrip'>;

export default function NewTripScreen({ navigation }: Props) {
  const { addTrip } = useTripsContext();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [type, setType] = useState<TripType>('hiking');
  const [location, setLocation] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Missing name', 'Please enter a trip name.');
      return;
    }
    const startStr = toDateString(startDate);
    const endStr = toDateString(endDate);
    if (endStr < startStr) {
      Alert.alert('Invalid dates', 'End date must be on or after start date.');
      return;
    }
    await addTrip({
      name: trimmedName,
      startDate: startStr,
      endDate: endStr,
      type,
      location: location.trim() || undefined,
    });
    navigation.goBack();
  };

  const onStartChange = (_: unknown, d?: Date) => {
    if (Platform.OS === 'android') setShowStartPicker(false);
    if (d) setStartDate(d);
  };

  const onEndChange = (_: unknown, d?: Date) => {
    if (Platform.OS === 'android') setShowEndPicker(false);
    if (d) setEndDate(d);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Input label="Trip name" icon="mountain" value={name} onChangeText={setName} placeholder="e.g. Yosemite weekend" autoCapitalize="words" />

        <View style={styles.field}>
          <Text style={styles.label}>Start date</Text>
          <Pressable style={styles.dateButton} onPress={() => setShowStartPicker(true)}>
            <Icon name="calendar" size={18} color={colors.textTertiary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dateButtonText}>{formatDisplayDate(toDateString(startDate))}</Text>
            </View>
          </Pressable>
        </View>
        {showStartPicker && (
          <Modal transparent animationType="slide">
            <Pressable style={styles.pickerOverlay} onPress={() => setShowStartPicker(false)}>
              <View style={styles.pickerBox}>
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onStartChange}
                  minimumDate={new Date()}
                />
                {Platform.OS === 'ios' && (
                  <Button variant="ghost" style={styles.pickerDone} onPress={() => setShowStartPicker(false)}>
                    Done
                  </Button>
                )}
              </View>
            </Pressable>
          </Modal>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>End date</Text>
          <Pressable style={styles.dateButton} onPress={() => setShowEndPicker(true)}>
            <Icon name="calendar" size={18} color={colors.textTertiary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dateButtonText}>{formatDisplayDate(toDateString(endDate))}</Text>
            </View>
          </Pressable>
        </View>
        {showEndPicker && (
          <Modal transparent animationType="slide">
            <Pressable style={styles.pickerOverlay} onPress={() => setShowEndPicker(false)}>
              <View style={styles.pickerBox}>
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onEndChange}
                  minimumDate={startDate}
                />
                {Platform.OS === 'ios' && (
                  <Button variant="ghost" style={styles.pickerDone} onPress={() => setShowEndPicker(false)}>
                    Done
                  </Button>
                )}
              </View>
            </Pressable>
          </Modal>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Location (optional)</Text>
          <LocationAutocompleteInput value={location} onChangeText={setLocation} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Trip type</Text>
          <View style={styles.typeRow}>
            {TRIP_TYPES.map((t) => (
              <Tag key={t} selected={type === t} onPress={() => setType(t)}>{t}</Tag>
            ))}
          </View>
        </View>

        <Button size="lg" style={styles.saveButton} onPress={handleSave}>Save trip</Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.space6,
    paddingBottom: spacing.space9,
    gap: spacing.space4,
  },
  field: {
    gap: spacing.space2,
  },
  label: {
    ...typography.label,
    color: colors.textPrimary,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    height: 46,
    paddingHorizontal: spacing.space4,
    backgroundColor: colors.surfaceCard,
  },
  dateButtonText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.surfaceOverlay,
    justifyContent: 'flex-end',
  },
  pickerBox: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.space4,
    alignItems: 'center',
  },
  pickerDone: {
    marginTop: spacing.space2,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space2,
  },
  saveButton: {
    marginTop: spacing.space4,
  },
});
