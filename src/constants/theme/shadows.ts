import type { ViewStyle } from 'react-native';
import { colors } from './colors';

/**
 * Switchback Design System — elevation tokens.
 * Approximated from tokens/shadows.css (multi-layer CSS box-shadows collapse
 * to RN's single shadow; warm-ink tinted, never cool gray).
 */
export const shadows = {
  none: {} satisfies ViewStyle,
  sm: {
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  } satisfies ViewStyle,
  md: {
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  } satisfies ViewStyle,
  lg: {
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  } satisfies ViewStyle,
} as const;

export type ShadowToken = keyof typeof shadows;
