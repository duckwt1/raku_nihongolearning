import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ChevronRight, RefreshCw, Search } from 'lucide-react-native';
import { SEED_KANJI, type Grammar, type JlptLevel } from '@raku/core';
import { JLPT_LEVELS } from '@raku/sync';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { useStudy } from '@/providers/StudyProvider';
import { isFirebaseConfigured } from '@/services/firebase';
import {
  fetchAndCacheGrammarPoints,
  loadCachedGrammarPoints
} from '@/services/grammarCache';
import { KanjiBottomSheet } from '@/components/KanjiBottomSheet';
import { hapticSelect, hapticTap } from '@/services/haptics';

type LibrarySection = 'kanji' | 'grammar';

export default function LibraryScreen() {
  const router = useRouter();
  const { colors, typography } = useRakuTheme();
  const { customKanji } = useStudy();

  const [section, setSection] = useState<LibrarySection>('kanji');
  const [query, setQuery] = useState('');
  const [selectedKanji, setSelectedKanji] = useState<string | null>(null);

  const [level, setLevel] = useState<JlptLevel>('N3');
  const [grammarPoints, setGrammarPoints] = useState<Grammar[]>([]);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarError, setGrammarError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadGrammar = useCallback(async (targetLevel: JlptLevel, isCancelled: () => boolean) => {
    setGrammarError(null);

    const cached = await loadCachedGrammarPoints(targetLevel);
    if (isCancelled()) return;

    if (cached.length > 0) {
      setGrammarPoints(cached);
      setGrammarLoading(false);
    } else {
      setGrammarPoints([]);
      setGrammarLoading(true);
    }

    if (!isFirebaseConfigured) {
      if (cached.length === 0) {
        setGrammarError('Cần cấu hình EXPO_PUBLIC_FIREBASE_API_KEY để tải kho ngữ pháp từ Cloud.');
      }
      setGrammarLoading(false);
      return;
    }

    try {
      const fresh = await fetchAndCacheGrammarPoints(targetLevel);
      if (!isCancelled()) {
        setGrammarPoints(fresh);
        setGrammarError(null);
      }
    } catch (err) {
      if (!isCancelled() && cached.length === 0) {
        setGrammarError(err instanceof Error ? err.message : 'Không thể tải ngữ pháp.');
      }
    } finally {
      if (!isCancelled()) {
        setGrammarLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (section !== 'grammar') return;
    let cancelled = false;
    void loadGrammar(level, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [section, level, reloadNonce, loadGrammar]);

  const allKanji = useMemo(() => [...customKanji, ...SEED_KANJI], [customKanji]);

  const filteredKanji = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allKanji;
    return allKanji.filter(
      (k) =>
        k.char.includes(q) ||
        k.meaningVi.toLowerCase().includes(q) ||
        k.hanViet.some((hv) => hv.toLowerCase().includes(q)) ||
        k.onyomi.some((o) => o.toLowerCase().includes(q)) ||
        k.kunyomi.some((ku) => ku.toLowerCase().includes(q))
    );
  }, [query, allKanji]);

  const filteredGrammar = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grammarPoints;
    return grammarPoints.filter((g) => {
      const pattern = (g.pattern || '').toLowerCase();
      const title = (g.title || '').toLowerCase();
      const meanings = Array.isArray(g.meaningVi) ? g.meaningVi : [];
      return (
        pattern.includes(q) ||
        title.includes(q) ||
        meanings.some((m) => String(m).toLowerCase().includes(q))
      );
    });
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
              { id: 'kanji', label: `Kanji (${allKanji.length})` },
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
                style={[styles.segmentBtn, active && { backgroundColor: colors.surface }]}
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

        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.surface, borderColor: colors.lineStrong }
          ]}
        >
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
          key="kanji-grid"
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
          <Pressable
            onPress={() => {
              hapticTap();
              setReloadNonce((n) => n + 1);
            }}
            style={({ pressed }) => [
              styles.retryBtn,
              {
                borderColor: colors.lineStrong,
                backgroundColor: pressed ? colors.subtle : colors.surface
              }
            ]}
          >
            <RefreshCw size={14} color={colors.ink} />
            <Text
              style={[
                styles.retryBtnText,
                { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
              ]}
            >
              Thử lại
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          key="grammar-list"
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
                  params: { id: item.id, level }
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
                <View style={styles.grammarTitleLine}>
                  <Text
                    style={[
                      styles.grammarPattern,
                      { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                    ]}
                    numberOfLines={1}
                  >
                    {item.pattern}
                  </Text>
                  {item.lesson ? (
                    <View style={[styles.lessonPill, { backgroundColor: colors.subtle }]}>
                      <Text style={[styles.lessonPillText, { color: colors.muted }]}>
                        Bài {item.lesson}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[styles.grammarMeaning, { color: colors.muted }]}
                  numberOfLines={2}
                >
                  {Array.isArray(item.meaningVi) ? item.meaningVi.join(' · ') : ''}
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
  grammarTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  grammarPattern: {
    fontSize: 16,
    flexShrink: 1
  },
  lessonPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  lessonPillText: {
    fontSize: 10,
    fontWeight: '600'
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
    gap: 12
  },
  statusText: {
    fontSize: 13
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 10,
    borderWidth: 1
  },
  retryBtnText: {
    fontSize: 13
  }
});
