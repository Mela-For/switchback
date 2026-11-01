import React from 'react';
import { Pressable, ScrollView, Text, StyleSheet } from 'react-native';
import { colors, fontFamily } from '../../constants/theme';

export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}

export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.rowContent}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            onPress={() => onChange(item.value)}
            style={[styles.tab, { borderBottomColor: active ? colors.primary : 'transparent' }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, { color: active ? colors.textPrimary : colors.textTertiary }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  rowContent: {
    flexDirection: 'row',
  },
  tab: {
    paddingVertical: 10,
    marginRight: 20,
    borderBottomWidth: 2,
  },
  label: { fontFamily: fontFamily.bodySemiBold, fontSize: 15 },
});
