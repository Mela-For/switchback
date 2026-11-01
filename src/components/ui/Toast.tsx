import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { colors, fontFamily, radii, shadows, typography } from '../../constants/theme';
import { Icon, type IconName } from './Icon';

export type ToastTone = 'success' | 'info' | 'error';

const TONES: Record<ToastTone, { icon: IconName; color: string }> = {
  success: { icon: 'circle-check', color: colors.forest200 },
  info: { icon: 'info', color: colors.slate200 },
  error: { icon: 'circle-alert', color: colors.clay200 },
};

export interface ToastProps {
  tone?: ToastTone;
  children: React.ReactNode;
}

export function Toast({ tone = 'success', children }: ToastProps) {
  const t = TONES[tone];
  return (
    <View style={[styles.base, shadows.lg]}>
      <Icon name={t.icon} size={18} color={t.color} />
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceInverse,
    borderRadius: radii.md,
  },
  text: { ...typography.bodySm, fontFamily: fontFamily.bodySemiBold, color: colors.textInverse },
});
