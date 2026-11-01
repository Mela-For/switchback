import { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { colors, fontFamily, radii, shadows, spacing, typography } from '../constants/theme';
import { getAutocompleteSuggestions, type AutocompleteSuggestion } from '../utils/placesApi';
import { GOOGLE_PLACES_API_KEY } from '../config/googlePlaces';
import { Icon } from './ui';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  inputStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function LocationAutocompleteInput({
  value,
  onChangeText,
  placeholder = 'e.g. Yosemite National Park',
  inputStyle,
  containerStyle,
}: Props) {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2 || GOOGLE_PLACES_API_KEY === 'YOUR_PLACES_API_KEY') {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await getAutocompleteSuggestions(q, GOOGLE_PLACES_API_KEY);
      setSuggestions(results.slice(0, 5));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const handleSelect = (suggestion: AutocompleteSuggestion) => {
    onChangeText(suggestion.description);
    setSuggestions([]);
  };

  return (
    <View style={containerStyle}>
      <TextInput
        style={[styles.input, inputStyle]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {suggestions.length > 0 && (
        <ScrollView style={styles.dropdown} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s.place_id} style={styles.row} onPressIn={() => handleSelect(s)}>
              <Icon name="map-pin" size={16} color={colors.textSecondary} />
              <View style={styles.textCol}>
                <Text style={styles.mainText} numberOfLines={1}>
                  {s.structured_formatting.main_text}
                </Text>
                {s.structured_formatting.secondary_text ? (
                  <Text style={styles.subText} numberOfLines={1}>
                    {s.structured_formatting.secondary_text}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    height: 46,
    paddingHorizontal: spacing.space4,
    fontFamily: fontFamily.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceCard,
  },
  dropdown: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.sm,
    marginTop: spacing.space1,
    overflow: 'hidden',
    maxHeight: 220,
    ...shadows.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.space2,
    paddingHorizontal: spacing.space4,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  textCol: {
    flex: 1,
  },
  mainText: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  subText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 1,
  },
});
