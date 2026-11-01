import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { colors, fontFamily, radii, typography, tracking } from '../../constants/theme';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceSunken, fg: colors.textSecondary },
  success: { bg: colors.forest100, fg: colors.forest700 },
  warning: { bg: colors.gold200, fg: colors.brown800 },
  danger: { bg: colors.clay200, fg: colors.clay600 },
  info: { bg: colors.slate200, fg: colors.slate700 },
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const t = TONES[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 22,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  text: {
    ...typography.caption,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: tracking.caption,
    textTransform: 'uppercase',
  },
});
