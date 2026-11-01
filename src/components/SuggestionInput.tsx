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
import { Icon } from './ui';

export interface Suggestion {
  key: string;
  label: string;
  sublabel?: string;
}

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  suggestions: Suggestion[];
  onSelect: (key: string) => void;
  placeholder?: string;
  inputStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  onSubmitEditing?: () => void;
}

/**
 * Generic typeahead dropdown, visually modeled on LocationAutocompleteInput.tsx but data-source-
 * agnostic — the caller supplies already-filtered/ranked suggestions (e.g. from history stats)
 * instead of this component owning a fetch.
 */
export default function SuggestionInput({
  value,
  onChangeText,
  suggestions,
  onSelect,
  placeholder,
  inputStyle,
  containerStyle,
  onSubmitEditing,
}: Props) {
  return (
    <View style={containerStyle}>
      <TextInput
        style={[styles.input, inputStyle]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        onSubmitEditing={onSubmitEditing}
      />
      {suggestions.length > 0 && (
        <ScrollView style={styles.dropdown} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s.key} style={styles.row} onPressIn={() => onSelect(s.key)}>
              <Icon name="clock" size={16} color={colors.textSecondary} />
              <View style={styles.textCol}>
                <Text style={styles.mainText} numberOfLines={1}>{s.label}</Text>
                {s.sublabel ? (
                  <Text style={styles.subText} numberOfLines={1}>{s.sublabel}</Text>
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
