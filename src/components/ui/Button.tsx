import React, { useState } from 'react';
import { Pressable, Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fontFamily, radii } from '../../constants/theme';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
export type ButtonSize = 'md' | 'lg';

interface Look {
  bg: string;
  bgPress: string;
  fg: string;
  borderColor?: string;
}

function look(variant: ButtonVariant, disabled: boolean): Look {
  if (disabled) {
    return { bg: colors.surfaceSunken, bgPress: colors.surfaceSunken, fg: colors.textTertiary };
  }
  switch (variant) {
    case 'secondary':
      return { bg: colors.surfaceCard, bgPress: colors.surfaceSunken, fg: colors.textPrimary, borderColor: colors.borderDefault };
    case 'ghost':
      return { bg: 'transparent', bgPress: colors.surfaceSunken, fg: colors.textPrimary };
    case 'accent':
      return { bg: colors.accent, bgPress: colors.rust700, fg: colors.textInverse };
    case 'danger':
      return { bg: colors.danger, bgPress: colors.dangerPress, fg: colors.textInverse };
    default:
      return { bg: colors.primary, bgPress: colors.primaryPress, fg: colors.textInverse };
  }
}

const SIZES: Record<ButtonSize, { height: number; padX: number; fontSize: number; gap: number; iconSize: number }> = {
  md: { height: 40, padX: 20, fontSize: 15, gap: 8, iconSize: 18 },
  lg: { height: 48, padX: 26, fontSize: 18, gap: 10, iconSize: 20 },
};

export interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const s = SIZES[size];
  const l = look(variant, disabled);

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      accessibilityState={{ disabled }}
      style={[
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.padX,
          gap: s.gap,
          backgroundColor: pressed ? l.bgPress : l.bg,
          borderColor: l.borderColor,
          borderWidth: l.borderColor ? 1 : 0,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={s.iconSize} color={l.fg} /> : null}
      {typeof children === 'string' ? (
        <Text style={{ fontFamily: fontFamily.bodySemiBold, fontSize: s.fontSize, color: l.fg }} numberOfLines={1}>
          {children}
        </Text>
      ) : (
        <View>{children}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
});
