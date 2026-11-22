import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, Search } from 'lucide-react-native';
import { SEED_KANJI, type Grammar, type JlptLevel } from '@raku/core';
import { JLPT_LEVELS } from '@raku/sync';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { isFirebaseConfigured, mobileSyncClient } from '@/services/firebase';
import { KanjiBottomSheet } from '@/components/KanjiBottomSheet';
import { hapticSelect, hapticTap } from '@/services/haptics';

type LibrarySection = 'kanji' | 'grammar';

export default function LibraryScreen() {
  const router = useRouter();
  const { colors, typography } = useRakuTheme();

  const [section, setSection] = useState<LibrarySection>('kanji');
  const [query, setQuery] = useState('');
  const [selectedKanji, setSelectedKanji] = useState<string | null>(null);

  const [level, setLevel] = useState<JlptLevel>('N3');
  const [grammarPoints, setGrammarPoints] = useState<Grammar[]>([]);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarError, setGrammarError] = useState<string | null>(null);

  useEffect(() => {
    if (section !== 'grammar') return;
    if (!isFirebaseConfigured) {
      setGrammarPoints([]);
      setGrammarError('Cần cấu hình EXPO_PUBLIC_FIREBASE_API_KEY để tải kho ngữ pháp từ Cloud.');
      return;
    }

    let cancelled = false;
    setGrammarLoading(true);
    setGrammarError(null);
    void mobileSyncClient
      .fetchGrammarPoints(level)
      .then((list) => {
        if (!cancelled) setGrammarPoints(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setGrammarError(err instanceof Error ? err.message : 'Không thể tải ngữ pháp.');
        }
      })
      .finally(() => {
        if (!cancelled) setGrammarLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [section, level]);

  const filteredKanji = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SEED_KANJI;
    return SEED_KANJI.filter(
      (k) =>
        k.char.includes(q) ||
        k.meaningVi.toLowerCase().includes(q) ||
        k.hanViet.some((hv) => hv.toLowerCase().includes(q)) ||
        k.onyomi.some((o) => o.toLowerCase().includes(q)) ||
        k.kunyomi.some((ku) => ku.toLowerCase().includes(q))
    );
  }, [query]);

  const filteredGrammar = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grammarPoints;
    return grammarPoints.filter(
      (g) =>
        g.pattern.toLowerCase().includes(q) ||
        g.title.toLowerCase().includes(q) ||
        g.meaningVi.some((m) => m.toLowerCase().includes(q))
    );
  }, [grammarPoints, query]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]} edges={['top']}>
      <View style={styles.headerBlock}>
        <Text
          style={[
            styles.pageTitle,
            { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
          ]}
        >
          Kho học
        </Text>

        {/* Native-feeling segmented control */}
        <View style={[styles.segmented, { backgroundColor: colors.subtle, borderColor: colors.line }]}>
          {(
            [
              { id: 'kanji', label: `Kanji (${SEED_KANJI.length})` },
              { id: 'grammar', label: 'Ngữ pháp JLPT' }
            ] as const
          ).map((item) => {
            const active = section === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  hapticSelect();
                  setSection(item.id);
                  setQuery('');
                }}
                style={[
                  styles.segmentBtn,
                  active && { backgroundColor: colors.surface }
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    {
                      color: active ? colors.ink : colors.muted,
                      fontFamily: active
                        ? typography.fontFamily.viNative.semibold
                        : typography.fontFamily.viNative.medium
                    }
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {section === 'grammar' && (
          <View style={styles.levelRow}>
            {JLPT_LEVELS.map((lv) => {
              const active = lv === level;
              return (
                <Pressable
                  key={lv}
                  onPress={() => {
                    hapticSelect();
                    setLevel(lv);
                  }}
                  style={[
                    styles.levelChip,
                    {
                      backgroundColor: active ? colors.accentSoft : colors.surface,
                      borderColor: active ? colors.accent : colors.line
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.levelText,
                      {
                        color: active ? colors.accent : colors.muted,
                        fontFamily: typography.fontFamily.viNative.semibold
                      }
                    ]}
                  >
                    {lv}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}>
          <Search size={16} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={
              section === 'kanji'
                ? 'Tìm Kanji, Hán Việt, nghĩa...'
                : `Tìm mẫu ngữ pháp ${level}...`
            }
            placeholderTextColor={colors.muted}
            style={[
              styles.searchInput,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.regular }
            ]}
          />
        </View>
      </View>

      {section === 'kanji' ? (
        <FlatList
          data={filteredKanji}
          keyExtractor={(item) => item.char}
          numColumns={3}
          initialNumToRender={24}
          windowSize={7}
          contentContainerStyle={styles.kanjiGrid}
          columnWrapperStyle={styles.kanjiRow}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                hapticTap();
                setSelectedKanji(item.char);
              }}
              style={({ pressed }) => [
                styles.kanjiTile,
                {
                  backgroundColor: pressed ? colors.subtle : colors.surface,
                  borderColor: colors.line
                }
              ]}
            >
              <Text
                style={[
                  styles.kanjiTileChar,
                  { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                ]}
              >
                {item.char}
              </Text>
              <Text
                style={[
                  styles.kanjiTileHv,
                  { color: colors.accent, fontFamily: typography.fontFamily.viNative.semibold }
                ]}
                numberOfLines={1}
              >
                {item.hanViet[0] || ''}
              </Text>
              <Text style={[styles.kanjiTileMeaning, { color: colors.muted }]} numberOfLines={1}>
                {item.meaningVi}
              </Text>
            </Pressable>
          )}
        />
      ) : grammarLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.statusText, { color: colors.muted }]}>
            Đang tải ngữ pháp {level}...
          </Text>
        </View>
      ) : grammarError ? (
        <View style={styles.centered}>
          <Text style={[styles.statusText, { color: colors.muted, textAlign: 'center' }]}>
            {grammarError}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredGrammar}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.grammarList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={[styles.statusText, { color: colors.muted }]}>
                Chưa có mẫu ngữ pháp {level}.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                hapticTap();
                router.push({
                  pathname: '/grammar/[id]',
                  params: { id: item.id, level, payload: JSON.stringify(item) }
                });
              }}
              style={({ pressed }) => [
                styles.grammarRow,
                {
                  backgroundColor: pressed ? colors.subtle : colors.surface,
                  borderColor: colors.line
                }
              ]}
            >
              <View style={styles.grammarRowText}>
                <Text
                  style={[
                    styles.grammarPattern,
                    { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                  ]}
                >
                  {item.pattern}
                </Text>
                <Text
                  style={[styles.grammarMeaning, { color: colors.muted }]}
                  numberOfLines={2}
                >
                  {item.meaningVi.join(' · ')}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.muted} />
            </Pressable>
          )}
        />
      )}

      <KanjiBottomSheet char={selectedKanji} onClose={() => setSelectedKanji(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1
  },
  headerBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 12
  },
  pageTitle: {
    fontSize: 22
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3
  },
  segmentBtn: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center'
  },
  segmentLabel: {
    fontSize: 13
  },
  levelRow: {
    flexDirection: 'row',
    gap: 8
  },
  levelChip: {
    flex: 1,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  levelText: {
    fontSize: 12
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12
  },
  searchInput: {
    flex: 1,
    fontSize: 14
  },
  kanjiGrid: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 8
  },
  kanjiRow: {
    gap: 8
  },
  kanjiTile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 3
  },
  kanjiTileChar: {
    fontSize: 26,
    lineHeight: 32
  },
  kanjiTileHv: {
    fontSize: 11
  },
  kanjiTileMeaning: {
    fontSize: 10
  },
  grammarList: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 8
  },
  grammarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14
  },
  grammarRowText: {
    flex: 1,
    gap: 4
  },
  grammarPattern: {
    fontSize: 16
  },
  grammarMeaning: {
    fontSize: 12,
    lineHeight: 18
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10
  },
  statusText: {
    fontSize: 13
  }
});
