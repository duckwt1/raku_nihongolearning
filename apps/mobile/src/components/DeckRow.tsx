import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Play } from 'lucide-react-native';
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
  onStudyPress?: () => void;
}

export function DeckRow({
  deck,
  totalCards,
  newCount,
  learnCount,
  dueCount,
  isFirst = false,
  onPress,
  onStudyPress
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

        {onStudyPress ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              hapticTap();
              onStudyPress();
            }}
            hitSlop={6}
            accessibilityLabel={`Học nhanh bộ ${deck.name}`}
            style={({ pressed }) => [
              styles.studyBtn,
              {
                backgroundColor: pressed ? colors.accent : colors.accentSoft,
                borderColor: colors.line
              }
            ]}
          >
            {({ pressed }) => (
              <Play
                size={12}
                color={pressed ? colors.onAccent : colors.accent}
                fill={pressed ? colors.onAccent : colors.accent}
              />
            )}
          </Pressable>
        ) : (
          <ChevronRight size={16} color={colors.muted} />
        )}
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
    gap: 8
  },
  countText: {
    minWidth: 20,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums']
  },
  studyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
