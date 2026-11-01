/**
 * Switchback Design System — corner radius scale.
 * Translated from tokens/radii.css.
 */
export const radii = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radii;
