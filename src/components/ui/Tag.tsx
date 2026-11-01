import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, fontFamily, radii } from '../../constants/theme';
import { Icon, type IconName } from './Icon';

export interface TagProps {
  children: React.ReactNode;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}

export function Tag({ children, icon, selected, onPress, onRemove }: TagProps) {
  const fg = selected ? colors.forest700 : colors.textPrimary;
  const content = (
    <View
      style={[
        styles.base,
        {
          backgroundColor: selected ? colors.forest100 : colors.surfaceCard,
          borderColor: selected ? colors.forest400 : colors.borderDefault,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text style={[styles.text, { color: fg }]}>{children}</Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove">
          <Icon name="x" size={13} color={fg} />
        </Pressable>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  text: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 13,
  },
});
