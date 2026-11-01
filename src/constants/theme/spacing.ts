/**
 * Switchback Design System — spacing scale (4px base unit).
 * Translated from tokens/spacing.css.
 */
export const spacing = {
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space7: 32,
  space8: 40,
  space9: 48,
  space10: 64,
  space11: 80,
  space12: 96,
} as const;

export type SpacingToken = keyof typeof spacing;
