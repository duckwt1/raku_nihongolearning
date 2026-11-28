import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { PenLine, Swords, Volume2 } from 'lucide-react-native';
import type { Grammar, JlptLevel } from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { getGrammarPointById } from '@/services/grammarCache';
import { hapticTap } from '@/services/haptics';
import { speakJapanese } from '@/services/speech';

export default function GrammarDetailScreen() {
  const router = useRouter();
  const { colors, typography } = useRakuTheme();
  const params = useLocalSearchParams<{ id?: string; level?: string; payload?: string }>();

  const [grammar, setGrammar] = useState<Grammar | null>(() => {
    if (typeof params.payload === 'string') {
      try {
        return JSON.parse(params.payload) as Grammar;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(!grammar);

  useEffect(() => {
    if (grammar || typeof params.id !== 'string') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const level =
      params.level === 'N5' ||
      params.level === 'N4' ||
      params.level === 'N3' ||
      params.level === 'N2' ||
      params.level === 'N1'
        ? (params.level as JlptLevel)
        : undefined;

    void getGrammarPointById(params.id, level)
      .then((found) => {
        if (!cancelled) setGrammar(found);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id, params.level, grammar]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.canvas }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!grammar) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.canvas }]}>
        <Text style={[styles.empty, { color: colors.muted }]}>
          Không tìm thấy chi tiết mẫu ngữ pháp.
        </Text>
      </View>
    );
  }

  const meanings = Array.isArray(grammar.meaningVi) ? grammar.meaningVi : [];
  const formation = Array.isArray(grammar.formation) ? grammar.formation : [];
  const notes = Array.isArray(grammar.notes) ? grammar.notes : [];
  const commonMistakes = Array.isArray(grammar.commonMistakes) ? grammar.commonMistakes : [];
  const examples = Array.isArray(grammar.examples) ? grammar.examples : [];

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

        {meanings.length > 0 ? (
          <Text
            style={[
              styles.meaning,
              { color: colors.accent, fontFamily: typography.fontFamily.viNative.semibold }
            ]}
          >
            {meanings.join(' · ')}
          </Text>
        ) : null}

        {formation.length > 0 ? (
          <View style={[styles.subBox, { backgroundColor: colors.canvas, borderColor: colors.line }]}>
            <Text style={[styles.subLabel, { color: colors.muted }]}>Cấu trúc</Text>
            {formation.map((item, idx) => (
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

        {grammar.nuanceVi ? (
          <View style={styles.block}>
            <Text style={[styles.subLabel, { color: colors.muted }]}>Sắc thái</Text>
            <Text
              style={[
                styles.bodyText,
                { color: colors.body, fontFamily: typography.fontFamily.viNative.regular }
              ]}
            >
              {grammar.nuanceVi}
            </Text>
          </View>
        ) : null}

        {notes.length > 0 ? (
          <View style={styles.block}>
            <Text style={[styles.subLabel, { color: colors.muted }]}>Lưu ý cách dùng</Text>
            {notes.map((note, idx) => (
              <Text key={idx} style={[styles.bodyText, { color: colors.body }]}>
                • {note}
              </Text>
            ))}
          </View>
        ) : null}

        {commonMistakes.length > 0 ? (
          <View style={styles.block}>
            <Text style={[styles.subLabel, { color: colors.again }]}>Lỗi hay gặp</Text>
            {commonMistakes.map((mistake, idx) => (
              <View
                key={idx}
                style={[
                  styles.subBox,
                  { backgroundColor: colors.canvas, borderColor: colors.line }
                ]}
              >
                <Text style={[styles.mistakeWrong, { color: colors.again }]}>
                  ✗ {mistake.mistake}
                </Text>
                <Text style={[styles.mistakeCorrect, { color: colors.good }]}>
                  ✓ {mistake.correction}
                </Text>
                {mistake.explanationVi ? (
                  <Text style={[styles.exampleVi, { color: colors.muted }]}>
                    {mistake.explanationVi}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {examples.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
          >
            Câu ví dụ
          </Text>
          {examples.map((ex, idx) => (
            <View
              key={idx}
              style={[
                styles.exampleItem,
                idx > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.line
                }
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

      <Pressable
        onPress={() => {
          hapticTap();
          router.push({
            pathname: '/(tabs)/practice',
            params: {
              tab: 'grammar',
              level: grammar.jlpt,
              grammarId: grammar.id,
              grammarPattern: grammar.pattern
            }
          });
        }}
        style={({ pressed }) => [
          styles.practiceBtn,
          { backgroundColor: pressed ? colors.accentHover : colors.accent }
        ]}
      >
        <Swords size={16} color={colors.onAccent} />
        <Text
          style={[
            styles.practiceBtnText,
            { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
          ]}
        >
          Luyện tập mẫu ngữ pháp này
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          hapticTap();
          router.push({
            pathname: '/(tabs)/practice',
            params: {
              tab: 'sentence',
              level: grammar.jlpt,
              grammarId: grammar.id,
              grammarPattern: grammar.pattern
            }
          });
        }}
        style={({ pressed }) => [
          styles.practiceBtn,
          {
            backgroundColor: pressed ? colors.subtle : colors.accentSoft,
            borderWidth: 1,
            borderColor: colors.accent
          }
        ]}
      >
        <PenLine size={16} color={colors.accent} />
        <Text
          style={[
            styles.practiceBtnText,
            { color: colors.accent, fontFamily: typography.fontFamily.viNative.semibold }
          ]}
        >
          Đặt câu với AI
        </Text>
      </Pressable>
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
  mistakeWrong: {
    fontSize: 13,
    lineHeight: 20
  },
  mistakeCorrect: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600'
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
  },
  practiceBtn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  practiceBtnText: {
    fontSize: 15
  }
});
