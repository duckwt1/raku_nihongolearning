import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { Deck } from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { hapticTap } from '@/services/haptics';

interface DeckRowProps {
  deck: Deck;
  totalCards: number;
  newCount: number;
  learnCount: number;
  dueCount: number;
  isFirst?: boolean;
  onPress: () => void;
}

export function DeckRow({
  deck,
  totalCards,
  newCount,
  learnCount,
  dueCount,
  isFirst = false,
  onPress
}: DeckRowProps) {
  const { colors, typography } = useRakuTheme();

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
        { backgroundColor: pressed ? colors.subtle : 'transparent' }
      ]}
    >
      <View style={styles.left}>
        <Text
          style={[
            styles.title,
            { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
          ]}
          numberOfLines={1}
        >
          {deck.name}
        </Text>
        <Text
          style={[
            styles.meta,
            { color: colors.muted, fontFamily: typography.fontFamily.viNative.regular }
          ]}
        >
          {totalCards} thẻ
        </Text>
      </View>

      <View style={styles.right}>
        <View style={styles.counts}>
          <Text style={[styles.countText, { color: colors.easy }]}>{newCount}</Text>
          <Text style={[styles.countText, { color: colors.signal }]}>{learnCount}</Text>
          <Text style={[styles.countText, { color: colors.accent }]}>{dueCount}</Text>
        </View>
        <ChevronRight size={16} color={colors.muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 58,
    gap: 12
  },
  left: {
    flex: 1,
    gap: 2
  },
  title: {
    fontSize: 15
  },
  meta: {
    fontSize: 12,
    fontVariant: ['tabular-nums']
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  countText: {
    minWidth: 20,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums']
  }
});
