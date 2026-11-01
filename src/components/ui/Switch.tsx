import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, fontFamily, radii, shadows, typography } from '../../constants/theme';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
    >
      <View style={[styles.track, { backgroundColor: checked ? colors.primary : colors.borderStrong }]}>
        <View style={[styles.thumb, shadows.sm, { left: checked ? 21 : 3 }]} />
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { width: 42, height: 24, borderRadius: radii.pill, justifyContent: 'center' },
  thumb: {
    position: 'absolute',
    top: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.cream50,
  },
  label: { fontFamily: fontFamily.body, fontSize: typography.bodyMd.fontSize, color: colors.textPrimary },
});
