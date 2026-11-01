import React, { useState } from 'react';
import { Modal, Pressable, Text, View, StyleSheet, FlatList } from 'react-native';
import { colors, fontFamily, radii, shadows, typography } from '../../constants/theme';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  value?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({ label, value, onChange, options, placeholder = 'Select…' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.field}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
      >
        <Text style={[styles.value, { color: current ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1}>
          {current ? current.label : placeholder}
        </Text>
        <Icon name="chevron-down" size={16} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={[styles.option, item.value === value ? { backgroundColor: colors.surfaceSunken } : null]}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, width: '100%' },
  label: { ...typography.label, color: colors.textPrimary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
  },
  value: { fontFamily: fontFamily.body, fontSize: typography.bodyMd.fontSize },
  overlay: {
    flex: 1,
    backgroundColor: colors.surfaceOverlay,
    justifyContent: 'center',
    padding: 32,
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    maxHeight: 320,
    overflow: 'hidden',
    ...shadows.md,
  },
  option: { paddingHorizontal: 14, paddingVertical: 12 },
  optionText: { fontFamily: fontFamily.body, fontSize: typography.bodyMd.fontSize, color: colors.textPrimary },
});
