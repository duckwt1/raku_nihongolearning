import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Flame } from 'lucide-react-native';
import { buildHeatmapWeeks, getTodayDateString } from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { hapticSelect } from '@/services/haptics';

interface StudyHeatmapNativeProps {
  counts: Map<string, number>;
  goal: number;
  currentStreak: number;
  longestStreak: number;
}

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function StudyHeatmapNative({
  counts,
  goal,
  currentStreak,
  longestStreak
}: StudyHeatmapNativeProps) {
  const { colors, typography } = useRakuTheme();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const today = getTodayDateString();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const weeks = useMemo(() => buildHeatmapWeeks(counts, today, goal, 26), [counts, today, goal]);
  const allCells = useMemo(() => weeks.flat(), [weeks]);
  const completedDays = useMemo(() => allCells.filter((c) => c.completed).length, [allCells]);
  const selectedCell = useMemo(
    () => (selectedDate ? allCells.find((c) => c.date === selectedDate && !c.future) : null),
    [allCells, selectedDate]
  );

  const getCellFill = (count: number, future: boolean) => {
    if (future) return 'transparent';
    if (count === 0) return colors.subtle;
    if (count >= goal) return colors.accent;
    if (count >= Math.ceil((goal * 2) / 3)) return `${colors.accent}BF`;
    if (count >= Math.ceil(goal / 3)) return `${colors.accent}80`;
    return `${colors.accent}45`;
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.header}>
        <View>
          <Text
            style={[
              styles.title,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
          >
            Lịch sử học tập
          </Text>
          <Text style={[styles.sub, { color: colors.muted }]}>
            Mục tiêu {goal} từ mới / ngày
          </Text>
        </View>

        <View style={styles.streakBadge}>
          <Flame size={15} color={currentStreak > 0 ? colors.signal : colors.muted} />
          <Text
            style={[
              styles.streakNum,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
          >
            {currentStreak} ngày
          </Text>
        </View>
      </View>

      <View style={styles.gridWrap}>
        <View style={styles.dayLabels}>
          {DAY_LABELS.map((d) => (
            <Text key={d} style={[styles.dayLabel, { color: colors.muted }]}>
              {d}
            </Text>
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={styles.weeksRow}
        >
          {weeks.map((week, wIdx) => (
            <View key={wIdx} style={styles.weekCol}>
              {week.map((cell) => {
                const isSelected = selectedDate === cell.date;
                return (
                  <Pressable
                    key={cell.date}
                    disabled={cell.future}
                    onPress={() => {
                      hapticSelect();
                      setSelectedDate(cell.date);
                    }}
                    style={[
                      styles.cell,
                      {
                        backgroundColor: getCellFill(cell.count, cell.future),
                        borderColor: isSelected ? colors.signal : 'transparent',
                        borderWidth: isSelected ? 1.5 : 0
                      }
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.line }]}>
        <Text style={[styles.footerText, { color: colors.muted }]}>
          {selectedCell
            ? `${selectedCell.date}: ${selectedCell.count} từ mới${selectedCell.completed ? ' · đạt' : ''}`
            : `Dài nhất ${longestStreak} ngày · ${completedDays} ngày đạt`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    fontSize: 16
  },
  sub: {
    fontSize: 12,
    marginTop: 2
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  streakNum: {
    fontSize: 14,
    fontVariant: ['tabular-nums']
  },
  gridWrap: {
    flexDirection: 'row',
    gap: 8
  },
  dayLabels: {
    justifyContent: 'space-between',
    paddingVertical: 1
  },
  dayLabel: {
    fontSize: 10,
    height: 14,
    lineHeight: 14
  },
  weeksRow: {
    flexDirection: 'row',
    gap: 4
  },
  weekCol: {
    gap: 4
  },
  cell: {
    width: 14,
    height: 14,
    borderRadius: 3
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10
  },
  footerText: {
    fontSize: 12,
    fontVariant: ['tabular-nums']
  }
});
