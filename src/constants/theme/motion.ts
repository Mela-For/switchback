import { Easing } from 'react-native';

/**
 * Switchback Design System — motion tokens.
 * Translated from tokens/motion.css. Ease-out only, no bounce/spring/overshoot.
 */
export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

export const easing = {
  standard: Easing.bezier(0.4, 0, 0.2, 1),
  out: Easing.bezier(0, 0, 0.2, 1),
} as const;

export const pressScale = 0.97;
