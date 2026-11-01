import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, shadows, spacing } from '../../constants/theme';

export interface CardProps {
  children: React.ReactNode;
  elevated?: boolean;
  padding?: number;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, elevated = true, padding = spacing.space5, style }: CardProps) {
  return (
    <View style={[styles.base, elevated ? shadows.sm : shadows.none, { padding }, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
});
