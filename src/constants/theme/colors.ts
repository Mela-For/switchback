/**
 * Switchback Design System — color tokens.
 * Translated 1:1 from tokens/colors.css in the "Switchback Design System" folder.
 */
const palette = {
  cream50: '#FBF7EF',
  cream100: '#F4EEE2',
  cream200: '#E9DFC9',
  tan300: '#D8C6A0',
  tan400: '#BFA274',
  brown600: '#6B5638',
  brown800: '#453824',
  ink900: '#2B2620',
  forest900: '#1E3020',
  forest700: '#2E4C2C',
  forest600: '#3B5D3A',
  forest500: '#4C7048',
  forest400: '#6A8A62',
  forest200: '#C7D6BC',
  forest100: '#E6EDDF',
  rust700: '#8F3E14',
  rust600: '#C1531B',
  rust500: '#D2652C',
  rust400: '#E08A52',
  rust200: '#F3D2B4',
  rust100: '#FAE6D2',
  slate700: '#233240',
  slate600: '#2E4057',
  slate500: '#3E5A73',
  slate400: '#6C8598',
  slate200: '#CBD8E1',
  gold500: '#D9A441',
  gold200: '#F3DFAF',
  clay700: '#8B2E24',
  clay600: '#B23A2E',
  clay200: '#EFC9C2',
} as const;

export const colors = {
  ...palette,

  // Surfaces
  surfaceApp: palette.cream100,
  surfacePage: palette.cream50,
  surfaceCard: '#FFFDF8',
  surfaceSunken: palette.cream200,
  surfaceInverse: palette.ink900,
  surfaceOverlay: 'rgba(30,25,18,.55)',
  surfaceOverlaySoft: 'rgba(30,25,18,.28)',

  // Text
  textPrimary: palette.ink900,
  textSecondary: palette.brown600,
  textTertiary: '#8A7A5E',
  textInverse: palette.cream50,
  textLink: palette.forest700,
  textLinkHover: palette.rust600,

  // Borders
  borderSubtle: '#E3D6B8',
  borderDefault: palette.tan300,
  borderStrong: palette.tan400,

  // Brand
  primary: palette.forest600,
  primaryHover: palette.forest700,
  primaryPress: palette.forest900,
  accent: palette.rust600,
  accentHover: palette.rust700,
  secondary: palette.slate600,

  // Semantic
  success: palette.forest600,
  warning: palette.gold500,
  danger: palette.clay600,
  dangerPress: palette.clay700,
  info: palette.slate600,

  focusRing: palette.rust500,

  // Flat aliases matching the pre-redesign theme.ts shape, so every screen's
  // existing `colors.background/surface/text/border/primary` usage picks up
  // the new palette with zero call-site changes.
  background: palette.cream50,
  surface: '#FFFDF8',
  text: palette.ink900,
  border: palette.tan300,
} as const;

export type ColorToken = keyof typeof colors;
