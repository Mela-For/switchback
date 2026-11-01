import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, fontFamily, typography } from '../../constants/theme';
import { Icon } from './Icon';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.box,
          {
            backgroundColor: checked ? colors.primary : colors.surfaceCard,
            borderColor: checked ? colors.primary : colors.borderDefault,
          },
        ]}
      >
        {checked ? <Icon name="check" size={13} color={colors.textInverse} /> : null}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: fontFamily.body, fontSize: typography.bodyMd.fontSize, color: colors.textPrimary },
});
