import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, fontFamily, typography } from '../../constants/theme';

export interface RadioProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  disabled?: boolean;
}

export function Radio({ checked, onChange, label, disabled }: RadioProps) {
  return (
    <Pressable
      onPress={() => !disabled && onChange()}
      disabled={disabled}
      style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
    >
      <View style={[styles.outer, { borderColor: checked ? colors.primary : colors.borderDefault }]}>
        {checked ? <View style={styles.inner} /> : null}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  outer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
  },
  inner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  label: { fontFamily: fontFamily.body, fontSize: typography.bodyMd.fontSize, color: colors.textPrimary },
});
