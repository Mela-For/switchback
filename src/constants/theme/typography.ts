import type { TextStyle } from 'react-native';

/**
 * Switchback Design System — type tokens.
 * Translated from tokens/typography.css. Font families are the ones actually
 * loaded via useFonts in App.tsx (@expo-google-fonts/*).
 */
export const fontFamily = {
  display: 'Bitter_600SemiBold',
  body: 'Karla_400Regular',
  bodyMedium: 'Karla_500Medium',
  bodySemiBold: 'Karla_600SemiBold',
  bodyBold: 'Karla_700Bold',
  mono: 'IBMPlexMono_400Regular',
} as const;

export const tracking = {
  label: 0.52, // .04em @ 13px
  caption: 0.24, // .02em @ 12px
} as const;

export const typography = {
  displayXl: { fontFamily: fontFamily.display, fontSize: 44, lineHeight: 48 } satisfies TextStyle,
  displayLg: { fontFamily: fontFamily.display, fontSize: 34, lineHeight: 38 } satisfies TextStyle,
  displayMd: { fontFamily: fontFamily.display, fontSize: 27, lineHeight: 32 } satisfies TextStyle,
  titleLg: { fontFamily: fontFamily.bodySemiBold, fontSize: 22, lineHeight: 28 } satisfies TextStyle,
  titleMd: { fontFamily: fontFamily.bodySemiBold, fontSize: 18, lineHeight: 24 } satisfies TextStyle,
  bodyLg: { fontFamily: fontFamily.body, fontSize: 17, lineHeight: 26 } satisfies TextStyle,
  bodyMd: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 23 } satisfies TextStyle,
  bodySm: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 20 } satisfies TextStyle,
  label: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: tracking.label,
  } satisfies TextStyle,
  caption: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: tracking.caption,
  } satisfies TextStyle,
  monoSm: { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 20 } satisfies TextStyle,
} as const;

export type TypographyToken = keyof typeof typography;
