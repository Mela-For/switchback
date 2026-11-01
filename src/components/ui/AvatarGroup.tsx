import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { colors, fontFamily } from '../../constants/theme';

const AVATAR_COLORS = [colors.forest500, colors.rust500, colors.slate500, colors.gold500, colors.brown600];

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export interface AvatarGroupProps {
  people: { name: string }[];
  size?: number;
  max?: number;
}

export function AvatarGroup({ people, size = 36, max = 4 }: AvatarGroupProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  return (
    <View style={styles.row}>
      {shown.map((p, i) => (
        <View
          key={p.name + i}
          style={[
            styles.avatar,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: i === 0 ? 0 : -size * 0.28,
              backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
              zIndex: shown.length - i,
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize: Math.round(size * 0.38) }]}>{initials(p.name)}</Text>
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={[
            styles.avatar,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -size * 0.28,
              backgroundColor: colors.surfaceSunken,
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize: Math.round(size * 0.32), color: colors.textSecondary }]}>
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surfacePage,
  },
  initials: { fontFamily: fontFamily.bodySemiBold, color: colors.textInverse },
});
