import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Play,
  RefreshCw,
  RotateCcw,
  Volume2,
  X
} from 'lucide-react-native';
import {
  SEED_WORDS,
  type GrammarExercise,
  type GrammarExerciseType,
  type JlptLevel,
  type Word
} from '@raku/core';
import { JLPT_LEVELS } from '@raku/sync';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { isFirebaseConfigured } from '@/services/firebase';
import {
  fetchAndCacheGrammarExercises,
  loadCachedGrammarExercises
} from '@/services/grammarCache';
import {
  GrammarExercisePlayerNative,
  grammarExerciseTypeLabel
} from '@/components/GrammarExercisePlayerNative';
import { hapticSelect, hapticSuccess, hapticTap, hapticWarning } from '@/services/haptics';
import { speakJapanese } from '@/services/speech';

type PracticeTab = 'vocab' | 'grammar';

interface QuickQuizQuestion {
  word: Word;
  options: string[];
  correctOption: string;
}

const GRAMMAR_TYPE_FILTERS: Array<{ value: GrammarExerciseType | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'fill_blank', label: 'Điền trống' },
  { value: 'order', label: 'Sắp xếp' },
  { value: 'K7', label: 'Trắc nghiệm' },
  { value: 'translate_jp_vi', label: 'Nhật → Việt' },
  { value: 'translate_vi_jp', label: 'Việt → Nhật' }
];

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function buildQuickVocabQuiz(count = 10): QuickQuizQuestion[] {
  const pool = shuffle(SEED_WORDS);
  const picked = pool.slice(0, Math.min(count, pool.length));
  return picked.map((word) => {
    const distractors: string[] = [];
    for (const candidate of pool) {
      if (distractors.length >= 3) break;
      if (
        candidate.id !== word.id &&
        candidate.meaningVi !== word.meaningVi &&
        !distractors.includes(candidate.meaningVi)
      ) {
        distractors.push(candidate.meaningVi);
      }
    }
    const options = shuffle([word.meaningVi, ...distractors]);
    return { word, options, correctOption: word.meaningVi };
  });
}

export default function PracticeScreen() {
  const { colors, typography } = useRakuTheme();
  const params = useLocalSearchParams<{
    tab?: string;
    level?: string;
    grammarId?: string;
    grammarPattern?: string;
  }>();

  const [activeTab, setActiveTab] = useState<PracticeTab>(
    params.tab === 'grammar' ? 'grammar' : 'vocab'
  );

  // ---- Vocab Quick Quiz state ----
  const [seed, setSeed] = useState(0);
  const questions = useMemo(() => buildQuickVocabQuiz(10), [seed]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  // ---- Grammar Practice state ----
  const [level, setLevel] = useState<JlptLevel>('N3');
  const [grammarFilterId, setGrammarFilterId] = useState<string | null>(null);
  const [grammarFilterLabel, setGrammarFilterLabel] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<GrammarExerciseType | 'all'>('all');
  const [exercises, setExercises] = useState<GrammarExercise[]>([]);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarError, setGrammarError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [activeGrammarSession, setActiveGrammarSession] = useState<{
    title: string;
    exercises: GrammarExercise[];
  } | null>(null);

  // Sync incoming navigation params (e.g. "Luyện tập mẫu ngữ pháp này" from grammar/[id])
  useEffect(() => {
    if (params.tab === 'grammar') {
      setActiveTab('grammar');
      setActiveGrammarSession(null);
    }
    if (
      params.level === 'N5' ||
      params.level === 'N4' ||
      params.level === 'N3' ||
      params.level === 'N2' ||
      params.level === 'N1'
    ) {
      setLevel(params.level);
    }
    if (typeof params.grammarId === 'string' && params.grammarId.length > 0) {
      setGrammarFilterId(params.grammarId);
      setGrammarFilterLabel(
        typeof params.grammarPattern === 'string' ? params.grammarPattern : params.grammarId
      );
    }
  }, [params.tab, params.level, params.grammarId, params.grammarPattern]);

  const loadGrammarExercises = useCallback(
    async (targetLevel: JlptLevel, isCancelled: () => boolean) => {
      setGrammarError(null);
      const cached = await loadCachedGrammarExercises(targetLevel);
      if (isCancelled()) return;

      if (cached.length > 0) {
        setExercises(cached);
        setGrammarLoading(false);
      } else {
        setExercises([]);
        setGrammarLoading(true);
      }

      if (!isFirebaseConfigured) {
        if (cached.length === 0) {
          setGrammarError('Cần cấu hình Firebase để tải ngân hàng bài tập ngữ pháp.');
        }
        setGrammarLoading(false);
        return;
      }

      try {
        const fresh = await fetchAndCacheGrammarExercises(targetLevel);
        if (!isCancelled()) {
          setExercises(fresh);
          setGrammarError(null);
        }
      } catch (err) {
        if (!isCancelled() && cached.length === 0) {
          setGrammarError(err instanceof Error ? err.message : 'Không thể tải bài tập ngữ pháp.');
        }
      } finally {
        if (!isCancelled()) {
          setGrammarLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (activeTab !== 'grammar') return;
    let cancelled = false;
    void loadGrammarExercises(level, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [activeTab, level, reloadNonce, loadGrammarExercises]);

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      if (grammarFilterId && ex.grammarId !== grammarFilterId) return false;
      if (typeFilter !== 'all' && ex.type !== typeFilter) return false;
      return true;
    });
  }, [exercises, grammarFilterId, typeFilter]);

  const grammarGroups = useMemo(() => {
    const map = new Map<
      string,
      { grammarId: string; pattern: string; title: string; items: GrammarExercise[] }
    >();
    for (const ex of exercises) {
      if (typeFilter !== 'all' && ex.type !== typeFilter) continue;
      const existing = map.get(ex.grammarId);
      if (existing) {
        existing.items.push(ex);
      } else {
        map.set(ex.grammarId, {
          grammarId: ex.grammarId,
          pattern: ex.grammarPattern || ex.grammarTitle,
          title: ex.grammarTitle || ex.grammarPattern,
          items: [ex]
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.pattern.localeCompare(b.pattern));
  }, [exercises, typeFilter]);

  const startGrammarSession = (pool: GrammarExercise[], title: string, maxCount?: number) => {
    if (pool.length === 0) return;
    hapticTap();
    const shuffled = shuffle(pool);
    const picked = maxCount && maxCount < shuffled.length ? shuffled.slice(0, maxCount) : shuffled;
    setActiveGrammarSession({ title, exercises: picked });
  };

  // ---- Vocab Quick Quiz handlers ----
  const current = questions[index];

  const handleChooseVocab = (option: string) => {
    if (!current || selected !== null) return;
    setSelected(option);
    if (option === current.correctOption) {
      setScore((prev) => prev + 1);
      hapticSuccess();
    } else {
      hapticWarning();
    }
  };

  const handleNextVocab = () => {
    hapticSelect();
    if (index + 1 >= questions.length) {
      setFinished(true);
      hapticSuccess();
      return;
    }
    setIndex((prev) => prev + 1);
    setSelected(null);
  };

  const restartVocab = () => {
    hapticTap();
    setSeed((s) => s + 1);
    setIndex(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]} edges={['top']}>
      {activeTab === 'grammar' && activeGrammarSession ? (
        <View style={styles.playerShell}>
          <GrammarExercisePlayerNative
            exercises={activeGrammarSession.exercises}
            title={activeGrammarSession.title}
            onExit={() => setActiveGrammarSession(null)}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text
              style={[
                styles.pageTitle,
                { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
              ]}
            >
              Luyện tập
            </Text>
            <Text style={[styles.pageSub, { color: colors.muted }]}>
              {activeTab === 'vocab'
                ? 'Trắc nghiệm nhanh 10 từ vựng N3 chạy hoàn toàn ngoại tuyến.'
                : 'Luyện bài tập ngữ pháp theo cấp độ JLPT (điền trống, sắp xếp, dịch câu).'}
            </Text>
          </View>

          {/* Segmented switch: Từ vựng | Ngữ pháp */}
          <View
            style={[
              styles.segmented,
              { backgroundColor: colors.subtle, borderColor: colors.line }
            ]}
          >
            {(
              [
                { id: 'vocab', label: 'Từ vựng' },
                { id: 'grammar', label: 'Ngữ pháp' }
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    hapticSelect();
                    setActiveTab(tab.id);
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
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {activeTab === 'vocab' ? (
            finished || !current ? (
              <View
                style={[
                  styles.card,
                  styles.completeCard,
                  { backgroundColor: colors.surface, borderColor: colors.line }
                ]}
              >
                <View style={[styles.hankoSeal, { borderColor: colors.signal }]}>
                  <Text
                    style={[
                      styles.hankoChar,
                      { color: colors.signal, fontFamily: typography.fontFamily.jpNative.bold }
                    ]}
                  >
                    済
                  </Text>
                </View>
                <Text
                  style={[
                    styles.completeTitle,
                    { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                  ]}
                >
                  Đúng {score} / {questions.length} câu
                </Text>
                <Text style={[styles.pageSub, { color: colors.muted, textAlign: 'center' }]}>
                  Độ chính xác {Math.round((score / Math.max(1, questions.length)) * 100)}%
                </Text>
                <Pressable
                  onPress={restartVocab}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: pressed ? colors.accentHover : colors.accent }
                  ]}
                >
                  <RotateCcw size={16} color={colors.onAccent} />
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                    ]}
                  >
                    Luyện bộ 10 câu mới
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.quizBody}>
                <View style={styles.progressMeta}>
                  <Text style={[styles.progressText, { color: colors.muted }]}>
                    Câu {index + 1} / {questions.length}
                  </Text>
                  <Text style={[styles.progressText, { color: colors.accent }]}>
                    Đúng {score}
                  </Text>
                </View>

                <View style={[styles.track, { backgroundColor: colors.subtle }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        backgroundColor: colors.accent,
                        width: `${Math.round(((index + 1) / questions.length) * 100)}%`
                      }
                    ]}
                  />
                </View>

                <View
                  style={[
                    styles.card,
                    { backgroundColor: colors.surface, borderColor: colors.line }
                  ]}
                >
                  <View style={styles.wordTopRow}>
                    <Text style={[styles.hintLabel, { color: colors.muted }]}>Chọn nghĩa đúng</Text>
                    <Pressable
                      onPress={() => {
                        hapticTap();
                        speakJapanese(current.word.readings[0] || current.word.surface);
                      }}
                      hitSlop={10}
                    >
                      <Volume2 size={18} color={colors.muted} />
                    </Pressable>
                  </View>

                  <Text
                    style={[
                      styles.wordSurface,
                      { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                    ]}
                  >
                    {current.word.surface}
                  </Text>

                  {selected !== null && (
                    <Text
                      style={[
                        styles.wordReading,
                        { color: colors.accent, fontFamily: typography.fontFamily.jpNative.medium }
                      ]}
                    >
                      {current.word.readings.join(' ・ ')}
                    </Text>
                  )}
                </View>

                <View style={styles.optionsList}>
                  {current.options.map((option) => {
                    const isPicked = selected === option;
                    const isAnswer = option === current.correctOption;
                    let bg = colors.surface;
                    let border = colors.line;
                    let fg = colors.ink;

                    if (selected !== null) {
                      if (isAnswer) {
                        bg = colors.goodSoft;
                        border = colors.good;
                        fg = colors.good;
                      } else if (isPicked) {
                        bg = colors.againSoft;
                        border = colors.again;
                        fg = colors.again;
                      }
                    }

                    return (
                      <Pressable
                        key={option}
                        disabled={selected !== null}
                        onPress={() => handleChooseVocab(option)}
                        style={({ pressed }) => [
                          styles.optionBtn,
                          {
                            backgroundColor: pressed && selected === null ? colors.subtle : bg,
                            borderColor: border
                          }
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            { color: fg, fontFamily: typography.fontFamily.viNative.medium }
                          ]}
                        >
                          {option}
                        </Text>
                        {selected !== null && isAnswer && <Check size={16} color={colors.good} />}
                        {selected !== null && isPicked && !isAnswer && (
                          <X size={16} color={colors.again} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {selected !== null && (
                  <Pressable
                    onPress={handleNextVocab}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { backgroundColor: pressed ? colors.accentHover : colors.accent }
                    ]}
                  >
                    <Text
                      style={[
                        styles.primaryBtnText,
                        {
                          color: colors.onAccent,
                          fontFamily: typography.fontFamily.viNative.semibold
                        }
                      ]}
                    >
                      {index + 1 >= questions.length ? 'Xem kết quả' : 'Câu tiếp theo'}
                    </Text>
                    <ArrowRight size={16} color={colors.onAccent} />
                  </Pressable>
                )}
              </View>
            )
          ) : (
            /* GRAMMAR PRACTICE TAB */
            <View style={styles.grammarTabBody}>
              {/* JLPT Level chips */}
              <View style={styles.levelRow}>
                {JLPT_LEVELS.map((lv) => {
                  const active = lv === level;
                  return (
                    <Pressable
                      key={lv}
                      onPress={() => {
                        hapticSelect();
                        setLevel(lv);
                        setGrammarFilterId(null);
                        setGrammarFilterLabel(null);
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

              {/* Exercise type filter pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.typeFilterRow}
              >
                {GRAMMAR_TYPE_FILTERS.map((f) => {
                  const active = f.value === typeFilter;
                  return (
                    <Pressable
                      key={f.value}
                      onPress={() => {
                        hapticSelect();
                        setTypeFilter(f.value);
                      }}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: active ? colors.accentSoft : colors.surface,
                          borderColor: active ? colors.accent : colors.line
                        }
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          {
                            color: active ? colors.accent : colors.muted,
                            fontFamily: typography.fontFamily.viNative.semibold
                          }
                        ]}
                      >
                        {f.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Active specific grammar filter banner */}
              {grammarFilterId && (
                <View
                  style={[
                    styles.filterPillRow,
                    { backgroundColor: colors.accentSoft, borderColor: colors.accent }
                  ]}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      { color: colors.accent, fontFamily: typography.fontFamily.jpNative.bold }
                    ]}
                    numberOfLines={1}
                  >
                    Đang lọc mẫu: {grammarFilterLabel || grammarFilterId}
                  </Text>
                  <Pressable
                    onPress={() => {
                      hapticTap();
                      setGrammarFilterId(null);
                      setGrammarFilterLabel(null);
                    }}
                    hitSlop={8}
                  >
                    <X size={16} color={colors.accent} />
                  </Pressable>
                </View>
              )}

              {grammarLoading ? (
                <View
                  style={[
                    styles.card,
                    styles.centeredCard,
                    { backgroundColor: colors.surface, borderColor: colors.line }
                  ]}
                >
                  <ActivityIndicator color={colors.accent} />
                  <Text style={[styles.pageSub, { color: colors.muted }]}>
                    Đang tải bài tập ngữ pháp {level}...
                  </Text>
                </View>
              ) : grammarError ? (
                <View
                  style={[
                    styles.card,
                    styles.centeredCard,
                    { backgroundColor: colors.surface, borderColor: colors.line }
                  ]}
                >
                  <Text style={[styles.pageSub, { color: colors.muted, textAlign: 'center' }]}>
                    {grammarError}
                  </Text>
                  <Pressable
                    onPress={() => {
                      hapticTap();
                      setReloadNonce((n) => n + 1);
                    }}
                    style={[styles.retryBtn, { borderColor: colors.lineStrong }]}
                  >
                    <RefreshCw size={14} color={colors.ink} />
                    <Text style={[styles.retryText, { color: colors.ink }]}>Thử lại</Text>
                  </Pressable>
                </View>
              ) : filteredExercises.length === 0 ? (
                <View
                  style={[
                    styles.card,
                    styles.centeredCard,
                    { backgroundColor: colors.surface, borderColor: colors.line }
                  ]}
                >
                  <Text
                    style={[
                      styles.emptyTitle,
                      { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
                    ]}
                  >
                    {grammarFilterId
                      ? 'Mẫu ngữ pháp này chưa có bài tập'
                      : `Chưa có bài tập ngữ pháp ${level}`}
                  </Text>
                  <Text style={[styles.pageSub, { color: colors.muted, textAlign: 'center' }]}>
                    {grammarFilterId
                      ? 'Bỏ bộ lọc để luyện các mẫu ngữ pháp khác trong cùng cấp độ.'
                      : 'Thử chọn cấp độ JLPT khác hoặc làm mới dữ liệu.'}
                  </Text>
                  <View style={styles.emptyBtnRow}>
                    {grammarFilterId ? (
                      <Pressable
                        onPress={() => {
                          hapticTap();
                          setGrammarFilterId(null);
                          setGrammarFilterLabel(null);
                        }}
                        style={[styles.retryBtn, { borderColor: colors.accent }]}
                      >
                        <Text style={[styles.retryText, { color: colors.accent }]}>
                          Xem toàn bộ {level}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => {
                        hapticTap();
                        setReloadNonce((n) => n + 1);
                      }}
                      style={[styles.retryBtn, { borderColor: colors.lineStrong }]}
                    >
                      <RefreshCw size={14} color={colors.ink} />
                      <Text style={[styles.retryText, { color: colors.ink }]}>Làm mới</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  {/* Quick Launch Card */}
                  <View
                    style={[
                      styles.card,
                      { backgroundColor: colors.surface, borderColor: colors.line }
                    ]}
                  >
                    <View style={styles.launchHead}>
                      <View style={styles.flex}>
                        <Text
                          style={[
                            styles.launchTitle,
                            { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                          ]}
                        >
                          {grammarFilterLabel
                            ? `${level} · ${grammarFilterLabel}`
                            : `Luyện tổng hợp ${level}`}
                        </Text>
                        <Text style={[styles.pageSub, { color: colors.muted }]}>
                          Có {filteredExercises.length} bài tập
                          {typeFilter !== 'all'
                            ? ` (${grammarExerciseTypeLabel(typeFilter)})`
                            : ''}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          hapticTap();
                          setReloadNonce((n) => n + 1);
                        }}
                        hitSlop={10}
                      >
                        <RefreshCw size={16} color={colors.muted} />
                      </Pressable>
                    </View>

                    <View style={styles.launchActions}>
                      <Pressable
                        onPress={() =>
                          startGrammarSession(
                            filteredExercises,
                            grammarFilterLabel
                              ? `${level} · ${grammarFilterLabel}`
                              : `Ngữ pháp ${level} (10 câu)`,
                            10
                          )
                        }
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          styles.flex,
                          { backgroundColor: pressed ? colors.accentHover : colors.accent }
                        ]}
                      >
                        <Play size={15} color={colors.onAccent} />
                        <Text
                          style={[
                            styles.primaryBtnText,
                            {
                              color: colors.onAccent,
                              fontFamily: typography.fontFamily.viNative.semibold
                            }
                          ]}
                        >
                          Luyện {Math.min(10, filteredExercises.length)} câu
                        </Text>
                      </Pressable>

                      {filteredExercises.length > 10 && (
                        <Pressable
                          onPress={() =>
                            startGrammarSession(
                              filteredExercises,
                              grammarFilterLabel
                                ? `${level} · ${grammarFilterLabel}`
                                : `Toàn bộ ${level}`
                            )
                          }
                          style={({ pressed }) => [
                            styles.secondaryBtn,
                            {
                              borderColor: colors.lineStrong,
                              backgroundColor: pressed ? colors.subtle : colors.canvas
                            }
                          ]}
                        >
                          <Text
                            style={[
                              styles.secondaryBtnText,
                              {
                                color: colors.ink,
                                fontFamily: typography.fontFamily.viNative.semibold
                              }
                            ]}
                          >
                            Tất cả ({filteredExercises.length})
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* Practice by individual grammar pattern */}
                  {!grammarFilterId && grammarGroups.length > 0 && (
                    <View style={styles.groupSection}>
                      <Text
                        style={[
                          styles.groupSectionTitle,
                          { color: colors.muted, fontFamily: typography.fontFamily.viNative.semibold }
                        ]}
                      >
                        LUYỆN THEO TỪNG MẪU ({grammarGroups.length})
                      </Text>
                      {grammarGroups.map((group) => (
                        <Pressable
                          key={group.grammarId}
                          onPress={() =>
                            startGrammarSession(
                              group.items,
                              `${level} · ${group.pattern}`
                            )
                          }
                          style={({ pressed }) => [
                            styles.groupRow,
                            {
                              backgroundColor: pressed ? colors.subtle : colors.surface,
                              borderColor: colors.line
                            }
                          ]}
                        >
                          <View style={styles.groupRowText}>
                            <Text
                              style={[
                                styles.groupPattern,
                                {
                                  color: colors.ink,
                                  fontFamily: typography.fontFamily.jpNative.bold
                                }
                              ]}
                              numberOfLines={1}
                            >
                              {group.pattern}
                            </Text>
                            <Text style={[styles.groupMeta, { color: colors.muted }]}>
                              {group.items.length} câu bài tập
                            </Text>
                          </View>
                          <ChevronRight size={16} color={colors.muted} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1
  },
  flex: {
    flex: 1
  },
  playerShell: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 32
  },
  header: {
    gap: 4
  },
  pageTitle: {
    fontSize: 22
  },
  pageSub: {
    fontSize: 13,
    lineHeight: 19
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
  quizBody: {
    gap: 14
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums']
  },
  track: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden'
  },
  fill: {
    height: '100%',
    borderRadius: 999
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12
  },
  centeredCard: {
    alignItems: 'center',
    paddingVertical: 28
  },
  wordTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  hintLabel: {
    fontSize: 12
  },
  wordSurface: {
    fontSize: 38,
    lineHeight: 48,
    textAlign: 'center',
    marginVertical: 14
  },
  wordReading: {
    fontSize: 18,
    textAlign: 'center'
  },
  optionsList: {
    gap: 10
  },
  optionBtn: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16
  },
  primaryBtnText: {
    fontSize: 14
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14
  },
  secondaryBtnText: {
    fontSize: 13
  },
  completeCard: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 12
  },
  hankoSeal: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  hankoChar: {
    fontSize: 24
  },
  completeTitle: {
    fontSize: 20,
    fontVariant: ['tabular-nums']
  },
  grammarTabBody: {
    gap: 12
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
  typeFilterRow: {
    gap: 8,
    paddingRight: 8
  },
  typeChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  typeChipText: {
    fontSize: 12
  },
  filterPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  filterPillText: {
    flex: 1,
    fontSize: 13
  },
  emptyTitle: {
    fontSize: 15,
    textAlign: 'center'
  },
  emptyBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 10,
    borderWidth: 1
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600'
  },
  launchHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  launchTitle: {
    fontSize: 16
  },
  launchActions: {
    flexDirection: 'row',
    gap: 10
  },
  groupSection: {
    gap: 8,
    marginTop: 4
  },
  groupSectionTitle: {
    fontSize: 11,
    letterSpacing: 0.6
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14
  },
  groupRowText: {
    flex: 1,
    gap: 3
  },
  groupPattern: {
    fontSize: 15
  },
  groupMeta: {
    fontSize: 12
  }
});
