import React, { useState } from 'react';
import { Pressable, StyleSheet, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii } from '../../constants/theme';
import { Icon, type IconName } from './Icon';

export type IconButtonVariant = 'default' | 'filled' | 'ghost';
export type IconButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<IconButtonSize, { box: number; iconSize: number }> = {
  sm: { box: 32, iconSize: 16 },
  md: { box: 40, iconSize: 18 },
  lg: { box: 48, iconSize: 20 },
};

function look(variant: IconButtonVariant, pressed: boolean) {
  switch (variant) {
    case 'filled':
      return { bg: pressed ? colors.primaryPress : colors.primary, fg: colors.textInverse };
    case 'ghost':
      return { bg: pressed ? colors.surfaceOverlaySoft : 'transparent', fg: colors.textInverse };
    default:
      return { bg: pressed ? colors.surfaceSunken : colors.surfaceCard, fg: colors.textPrimary };
  }
}

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({ icon, label, onPress, variant = 'default', size = 'md', disabled, style }: IconButtonProps) {
  const [pressed, setPressed] = useState(false);
  const s = SIZES[size];
  const l = look(variant, pressed);

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={8}
      style={[
        styles.base,
        {
          width: s.box,
          height: s.box,
          borderRadius: radii.pill,
          backgroundColor: l.bg,
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      <Icon name={icon} size={s.iconSize} color={l.fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
