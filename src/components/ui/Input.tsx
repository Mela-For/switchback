import React, { useState } from 'react';
import { Text, TextInput, View, StyleSheet, type TextInputProps } from 'react-native';
import { colors, fontFamily, radii, shadows, typography } from '../../constants/theme';
import { Icon, type IconName } from './Icon';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  icon?: IconName;
  error?: string;
  helper?: string;
}

export function Input({ label, icon, error, helper, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.borderDefault;

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, { borderColor }, focused ? shadows.sm : null]}>
        {icon ? <Icon name={icon} size={18} color={colors.textTertiary} /> : null}
        <TextInput
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          accessibilityLabel={rest.accessibilityLabel ?? label}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, width: '100%' },
  label: { ...typography.label, color: colors.textPrimary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.textPrimary,
    padding: 0,
  },
  error: { ...typography.caption, color: colors.danger },
  helper: { ...typography.caption, color: colors.textTertiary },
});
