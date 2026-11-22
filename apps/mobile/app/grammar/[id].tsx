import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Volume2 } from 'lucide-react-native';
import type { Grammar } from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { hapticTap } from '@/services/haptics';
import { speakJapanese } from '@/services/speech';

export default function GrammarDetailScreen() {
  const { colors, typography } = useRakuTheme();
  const params = useLocalSearchParams<{ id?: string; payload?: string }>();

  const grammar = useMemo<Grammar | null>(() => {
    if (typeof params.payload !== 'string') return null;
    try {
      return JSON.parse(params.payload) as Grammar;
    } catch {
      return null;
    }
  }, [params.payload]);

  if (!grammar) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.canvas }]}>
        <Text style={[styles.empty, { color: colors.muted }]}>
          Không tìm thấy chi tiết mẫu ngữ pháp.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ title: `${grammar.jlpt} · Ngữ pháp` }} />

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.badgeText, { color: colors.accent }]}>{grammar.jlpt}</Text>
          </View>
          {grammar.lesson ? (
            <View style={[styles.badge, { backgroundColor: colors.subtle }]}>
              <Text style={[styles.badgeText, { color: colors.muted }]}>Bài {grammar.lesson}</Text>
            </View>
          ) : null}
        </View>

        <Text
          style={[
            styles.pattern,
            { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
          ]}
        >
          {grammar.pattern}
        </Text>

        <Text
          style={[
            styles.meaning,
            { color: colors.accent, fontFamily: typography.fontFamily.viNative.semibold }
          ]}
        >
          {grammar.meaningVi.join(' · ')}
        </Text>

        {grammar.formation.length > 0 ? (
          <View style={[styles.subBox, { backgroundColor: colors.canvas, borderColor: colors.line }]}>
            <Text style={[styles.subLabel, { color: colors.muted }]}>Cấu trúc</Text>
            {grammar.formation.map((item, idx) => (
              <View key={idx} style={{ gap: 2 }}>
                <Text
                  style={[
                    styles.subText,
                    { color: colors.ink, fontFamily: typography.fontFamily.jpNative.medium }
                  ]}
                >
                  {item.rule}
                </Text>
                {item.note ? (
                  <Text style={[styles.exampleVi, { color: colors.muted }]}>{item.note}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {grammar.explanationVi ? (
          <View style={styles.block}>
            <Text style={[styles.subLabel, { color: colors.muted }]}>Giải thích</Text>
            <Text
              style={[
                styles.bodyText,
                { color: colors.body, fontFamily: typography.fontFamily.viNative.regular }
              ]}
            >
              {grammar.explanationVi}
            </Text>
          </View>
        ) : null}

        {grammar.notes && grammar.notes.length > 0 ? (
          <View style={styles.block}>
            <Text style={[styles.subLabel, { color: colors.muted }]}>Lưu ý cách dùng</Text>
            {grammar.notes.map((note, idx) => (
              <Text key={idx} style={[styles.bodyText, { color: colors.body }]}>
                • {note}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {grammar.examples && grammar.examples.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
          >
            Câu ví dụ
          </Text>
          {grammar.examples.map((ex, idx) => (
            <View
              key={idx}
              style={[
                styles.exampleItem,
                idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }
              ]}
            >
              <View style={styles.exampleHead}>
                <Text
                  style={[
                    styles.exampleJp,
                    { color: colors.ink, fontFamily: typography.fontFamily.jpNative.medium }
                  ]}
                >
                  {ex.jp}
                </Text>
                <Pressable
                  onPress={() => {
                    hapticTap();
                    speakJapanese(ex.jp);
                  }}
                  hitSlop={8}
                >
                  <Volume2 size={16} color={colors.muted} />
                </Pressable>
              </View>
              <Text style={[styles.exampleVi, { color: colors.muted }]}>{ex.vi}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 36
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  empty: {
    fontSize: 14
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  pattern: {
    fontSize: 26,
    lineHeight: 34
  },
  meaning: {
    fontSize: 16
  },
  subBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600'
  },
  subText: {
    fontSize: 14,
    lineHeight: 22
  },
  block: {
    gap: 6
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 22
  },
  sectionTitle: {
    fontSize: 15
  },
  exampleItem: {
    paddingTop: 10,
    gap: 4
  },
  exampleHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8
  },
  exampleJp: {
    flex: 1,
    fontSize: 15,
    lineHeight: 23
  },
  exampleVi: {
    fontSize: 13,
    lineHeight: 19
  }
});
