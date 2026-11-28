import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {
  ArrowRight,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Mic,
  RefreshCw,
  Send,
  Sparkles,
  Volume2
} from 'lucide-react-native';
import {
  POLITENESS_LABELS,
  QUICK_REPLY_CATEGORY_LABELS,
  QUICK_REPLY_PASS_SCORE,
  buildGrammarSentencePrompt,
  buildQuickReplyPrompt,
  buildTransformPrompt,
  buildWordSentencePrompt,
  computeQuickReplyProgress,
  isDuplicatePhraseInDeck,
  matchTargetWordsLive,
  pickTargetWordsForPractice,
  type Grammar,
  type JlptLevel,
  type PolitenessLevel,
  type QuickReplyCategory,
  type SavedPhraseCandidate,
  type SentenceAttemptRecord,
  type SentenceFeedback,
  type SentencePracticeMode,
  type SentencePracticePrompt
} from '@raku/core';
import { JLPT_LEVELS, mergeSentenceHistory } from '@raku/sync';
import { useStudy } from '@/providers/StudyProvider';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { checkSentenceWithAi } from '@/services/apiClient';
import { isFirebaseConfigured, mobileSyncClient } from '@/services/firebase';
import { getGrammarPointById, loadCachedGrammarPoints } from '@/services/grammarCache';
import { hapticSelect, hapticSuccess, hapticTap, hapticWarning } from '@/services/haptics';
import { speakJapanese } from '@/services/speech';
import { getMobileSpeechRecognitionInfo } from '@/services/speechRecognition';
import { mobileRepository } from '@/services/storage';
import { InteractiveJpTextNative } from './InteractiveJpTextNative';

interface SentenceStudioNativeProps {
  initialLevel?: JlptLevel;
  initialGrammarId?: string | null;
  onSelectKanji: (char: string) => void;
}

const MODE_OPTIONS: Array<{ id: SentencePracticeMode; label: string }> = [
  { id: 'quick_reply', label: 'Phản xạ (310)' },
  { id: 'word_builder', label: 'Từ Deck' },
  { id: 'grammar_target', label: 'Ngữ pháp' },
  { id: 'transform', label: 'Biến hóa' }
];

const QUICK_REPLY_CATEGORIES = Object.keys(QUICK_REPLY_CATEGORY_LABELS) as QuickReplyCategory[];

export function SentenceStudioNative({
  initialLevel = 'N3',
  initialGrammarId = null,
  onSelectKanji
}: SentenceStudioNativeProps) {
  const { colors, typography } = useRakuTheme();
  const { user, cards, decks, addPhraseToDeck, markCardGood, recordStudySeconds } = useStudy();

  const [mode, setMode] = useState<SentencePracticeMode>(
    initialGrammarId ? 'grammar_target' : 'quick_reply'
  );
  const [jlpt, setJlpt] = useState<JlptLevel>(initialLevel);
  const [quickReplyJlpt, setQuickReplyJlpt] = useState<JlptLevel | 'all'>('all');
  const [quickReplyCategory, setQuickReplyCategory] = useState<QuickReplyCategory | 'all'>('all');
  const [transformPoliteness, setTransformPoliteness] = useState<PolitenessLevel>('polite');
  const [selectedDeckId, setSelectedDeckId] = useState<string>('all');
  const [speechRate, setSpeechRate] = useState<number>(0.92);

  const [history, setHistory] = useState<SentenceAttemptRecord[]>([]);
  const [prompt, setPrompt] = useState<SentencePracticePrompt>(() =>
    buildQuickReplyPrompt('all', 'any', [])
  );

  // Hide Vietnamese meaning & Furigana reading by default
  const [showSourceVi, setShowSourceVi] = useState(false);
  const [showSourceReading, setShowSourceReading] = useState(false);

  const [inputText, setInputText] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SentenceFeedback | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [markedCardIds, setMarkedCardIds] = useState<Set<string>>(new Set());

  const inputRef = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const promptStartedAtRef = useRef<number>(Date.now());
  const historyRef = useRef<SentenceAttemptRecord[]>(history);
  historyRef.current = history;
  const sttInfo = useMemo(() => getMobileSpeechRecognitionInfo(), []);

  // Load local sentence history and avoid already-passed (>= 50) quick reply prompt
  useEffect(() => {
    let active = true;
    void mobileRepository.loadSentenceHistory(user?.uid ?? null).then((list) => {
      if (!active) return;
      setHistory(list);
      if (!initialGrammarId) {
        setPrompt((curr) => {
          if (curr.mode !== 'quick_reply') return curr;
          const progress = computeQuickReplyProgress(list, { jlpt: 'all', category: 'all' });
          if (curr.promptId && progress.passedIds.has(curr.promptId)) {
            return buildQuickReplyPrompt('all', 'any', [], {
              category: 'all',
              history: list,
              currentPromptId: curr.promptId
            });
          }
          return curr;
        });
      }
    });
    return () => {
      active = false;
    };
  }, [user?.uid]);

  // Deep-link from grammar detail screen
  useEffect(() => {
    if (!initialGrammarId) return;
    let cancelled = false;
    setMode('grammar_target');
    setJlpt(initialLevel);
    void getGrammarPointById(initialGrammarId, initialLevel).then((found) => {
      if (cancelled || !found) return;
      setPrompt(buildGrammarSentencePrompt(found, 'any'));
      setFeedback(null);
      setInputText('');
      setError(null);
      setShowSourceVi(false);
      setShowSourceReading(false);
      promptStartedAtRef.current = Date.now();
    });
    return () => {
      cancelled = true;
    };
  }, [initialGrammarId, initialLevel]);

  const quickReplyProgress = useMemo(
    () =>
      computeQuickReplyProgress(history, {
        jlpt: quickReplyJlpt,
        category: quickReplyCategory
      }),
    [history, quickReplyJlpt, quickReplyCategory]
  );

  const regeneratePrompt = async (opts: {
    nextMode?: SentencePracticeMode;
    nextJlpt?: JlptLevel;
    nextQuickJlpt?: JlptLevel | 'all';
    nextCategory?: QuickReplyCategory | 'all';
    nextTransformPoliteness?: PolitenessLevel;
    nextDeckId?: string;
    latestHistory?: SentenceAttemptRecord[];
  } = {}) => {
    hapticTap();
    const targetMode = opts.nextMode ?? mode;
    const targetJlpt = opts.nextJlpt ?? jlpt;
    const targetQuickJlpt = opts.nextQuickJlpt ?? quickReplyJlpt;
    const targetCategory = opts.nextCategory ?? quickReplyCategory;
    const targetTransformPol = opts.nextTransformPoliteness ?? transformPoliteness;
    const targetDeckId = opts.nextDeckId ?? selectedDeckId;
    const activeHistory = opts.latestHistory ?? historyRef.current;

    setFeedback(null);
    setError(null);
    setInputText('');
    setShowSourceVi(false);
    setShowSourceReading(false);
    setSavedKeys(new Set());
    setMarkedCardIds(new Set());
    promptStartedAtRef.current = Date.now();

    if (targetMode === 'quick_reply') {
      setPrompt(
        buildQuickReplyPrompt(targetQuickJlpt, 'any', [], {
          category: targetCategory,
          history: activeHistory,
          currentPromptId: prompt.promptId
        })
      );
      return;
    }

    if (targetMode === 'word_builder') {
      const picked = pickTargetWordsForPractice(cards, {
        deckId: targetDeckId,
        jlpt: targetDeckId === 'all' ? targetJlpt : undefined,
        count: 2,
        excludeSurfaces: prompt.targetWords.map((w) => w.surface)
      });
      setPrompt(buildWordSentencePrompt(picked, 'any', targetJlpt));
      return;
    }

    if (targetMode === 'grammar_target') {
      let cachedGrammar: Grammar[] = await loadCachedGrammarPoints(targetJlpt);
      if (cachedGrammar.length === 0 && isFirebaseConfigured) {
        try {
          cachedGrammar = await mobileSyncClient.fetchGrammarPoints(targetJlpt);
        } catch {
          // fallback below
        }
      }
      const pickedGrammar =
        cachedGrammar.length > 0
          ? cachedGrammar[Math.floor(Math.random() * cachedGrammar.length)]
          : undefined;
      if (pickedGrammar) {
        setPrompt(buildGrammarSentencePrompt(pickedGrammar, 'any'));
      } else {
        setPrompt(
          buildGrammarSentencePrompt(
            {
              id: 'fallback_uchini',
              jlpt: targetJlpt,
              pattern: '〜うちに',
              title: '〜うちに (Trong lúc)',
              meaningVi: ['Trong lúc', 'Trước khi thay đổi'],
              formation: [{ rule: 'Vる / Vている / Aい / Aな + うちに' }],
              usage: []
            },
            'any'
          )
        );
      }
      return;
    }

    setPrompt(buildTransformPrompt(targetTransformPol, targetJlpt));
  };

  const liveMatched = useMemo(
    () => new Set(matchTargetWordsLive(inputText, prompt.targetWords)),
    [inputText, prompt.targetWords]
  );

  const dueTargetCards = useMemo(() => {
    return prompt.targetWords
      .map((tw) => (tw.cardId ? cards.find((c) => c.id === tw.cardId && c.isDue) : undefined))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [prompt.targetWords, cards]);

  const handleSubmit = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || checking) return;
    hapticTap();
    setChecking(true);
    setError(null);

    try {
      const result = await checkSentenceWithAi({
        mode: prompt.mode,
        jlpt: prompt.jlpt,
        politeness: prompt.mode === 'transform' ? prompt.politeness : 'any',
        promptText: prompt.instructionVi,
        targetWords: prompt.targetWords,
        targetGrammar: prompt.targetGrammar
          ? { pattern: prompt.targetGrammar.pattern, meaningVi: prompt.targetGrammar.meaningVi }
          : undefined,
        sourceSentence: prompt.sourceSentence?.jp,
        userSentence: trimmed
      });
      setFeedback(result);
      if (result.overallScore >= QUICK_REPLY_PASS_SCORE) hapticSuccess();
      else hapticWarning();

      const elapsed = Math.min(300, Math.max(10, Math.round((Date.now() - promptStartedAtRef.current) / 1000)));
      recordStudySeconds(elapsed);
      promptStartedAtRef.current = Date.now();

      const attempt: SentenceAttemptRecord = {
        id: `sa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        promptId: prompt.promptId,
        mode: prompt.mode,
        jlpt: prompt.jlpt,
        politeness: prompt.mode === 'transform' ? prompt.politeness : 'any',
        promptText: prompt.sourceSentence?.jp || prompt.instructionVi,
        targetWords: prompt.targetWords,
        targetGrammar: prompt.targetGrammar
          ? {
              id: prompt.targetGrammar.id,
              pattern: prompt.targetGrammar.pattern,
              meaningVi: prompt.targetGrammar.meaningVi
            }
          : undefined,
        sourceSentence: prompt.sourceSentence?.jp,
        userSentence: trimmed,
        feedback: result,
        createdAt: new Date().toISOString()
      };

      const merged = mergeSentenceHistory([attempt], history);
      setHistory(merged);
      await mobileRepository.saveSentenceHistory(user?.uid ?? null, merged);
      if (user?.uid && isFirebaseConfigured) {
        void mobileSyncClient.upsertSentenceAttemptToCloud(user.uid, attempt).catch(() => {});
      }
    } catch (err: unknown) {
      hapticWarning();
      setError(err instanceof Error ? err.message : 'Không thể chấm câu lúc này.');
    } finally {
      setChecking(false);
    }
  };

  const isPhraseSaved = (surface: string): boolean => {
    if (savedKeys.has(surface)) return true;
    const deckId = selectedDeckId !== 'all' ? selectedDeckId : 'deck_conversation_phrases';
    return isDuplicatePhraseInDeck(surface, deckId, cards);
  };

  const handleSavePhrase = (phrase: SavedPhraseCandidate) => {
    const id = addPhraseToDeck(phrase, selectedDeckId !== 'all' ? selectedDeckId : undefined);
    if (id) {
      hapticSuccess();
      setSavedKeys((prev) => new Set(prev).add(phrase.surface));
    }
  };

  return (
    <View style={styles.root}>
      {/* Mode pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {MODE_OPTIONS.map((opt) => {
          const active = mode === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => {
                hapticSelect();
                setMode(opt.id);
                void regeneratePrompt({ nextMode: opt.id });
              }}
              style={[
                styles.pill,
                {
                  backgroundColor: active ? colors.accentSoft : colors.surface,
                  borderColor: active ? colors.accent : colors.line
                }
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  {
                    color: active ? colors.accent : colors.muted,
                    fontFamily: typography.fontFamily.viNative.semibold
                  }
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Filters */}
      <View style={styles.filterGroup}>
        {mode === 'quick_reply' ? (
          <>
            <View style={styles.levelRow}>
              {(['all', ...JLPT_LEVELS] as const).map((lv) => {
                const active = lv === quickReplyJlpt;
                return (
                  <Pressable
                    key={lv}
                    onPress={() => {
                      hapticSelect();
                      setQuickReplyJlpt(lv);
                      void regeneratePrompt({ nextMode: 'quick_reply', nextQuickJlpt: lv });
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
                      {lv === 'all' ? 'All' : lv}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              <Pressable
                onPress={() => {
                  hapticSelect();
                  setQuickReplyCategory('all');
                  void regeneratePrompt({ nextMode: 'quick_reply', nextCategory: 'all' });
                }}
                style={[
                  styles.deckChip,
                  {
                    backgroundColor: quickReplyCategory === 'all' ? colors.accent : colors.subtle,
                    borderColor: quickReplyCategory === 'all' ? colors.accent : colors.line
                  }
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: quickReplyCategory === 'all' ? colors.onAccent : colors.body,
                    fontFamily: typography.fontFamily.viNative.semibold
                  }}
                >
                  Tất cả chủ đề
                </Text>
              </Pressable>
              {QUICK_REPLY_CATEGORIES.map((cat) => {
                const active = quickReplyCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      hapticSelect();
                      setQuickReplyCategory(cat);
                      void regeneratePrompt({ nextMode: 'quick_reply', nextCategory: cat });
                    }}
                    style={[
                      styles.deckChip,
                      {
                        backgroundColor: active ? colors.accent : colors.subtle,
                        borderColor: active ? colors.accent : colors.line
                      }
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: active ? colors.onAccent : colors.body,
                        fontFamily: typography.fontFamily.viNative.semibold
                      }}
                    >
                      {QUICK_REPLY_CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={{ fontSize: 11, color: colors.muted }}>
              Đã qua (≥{QUICK_REPLY_PASS_SCORE}đ): {quickReplyProgress.passedCount}/{quickReplyProgress.total} câu
              {quickReplyProgress.retryCount > 0
                ? ` · Cần làm lại (<${QUICK_REPLY_PASS_SCORE}đ): ${quickReplyProgress.retryCount}`
                : ''}
            </Text>
          </>
        ) : (
          <View style={styles.levelRow}>
            {JLPT_LEVELS.map((lv) => {
              const active = lv === jlpt;
              return (
                <Pressable
                  key={lv}
                  onPress={() => {
                    hapticSelect();
                    setJlpt(lv);
                    void regeneratePrompt({ nextJlpt: lv });
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

        {/* Only show target politeness selector in transform mode */}
        {mode === 'transform' && (
          <View style={styles.polRow}>
            {(['casual', 'polite', 'keigo'] as PolitenessLevel[]).map((pol) => {
              const active = transformPoliteness === pol;
              return (
                <Pressable
                  key={pol}
                  onPress={() => {
                    hapticSelect();
                    setTransformPoliteness(pol);
                    void regeneratePrompt({ nextTransformPoliteness: pol });
                  }}
                  style={[
                    styles.polChip,
                    {
                      backgroundColor: active ? colors.accentSoft : colors.surface,
                      borderColor: active ? colors.accent : colors.line
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.polText,
                      {
                        color: active ? colors.accent : colors.muted,
                        fontFamily: typography.fontFamily.viNative.semibold
                      }
                    ]}
                  >
                    {POLITENESS_LABELS[pol].label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {mode === 'word_builder' && decks.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
            {[{ id: 'all', name: 'Ưu tiên từ yếu' }, ...decks].map((d) => {
              const active = selectedDeckId === d.id;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => {
                    hapticSelect();
                    setSelectedDeckId(d.id);
                    void regeneratePrompt({ nextDeckId: d.id });
                  }}
                  style={[
                    styles.deckChip,
                    {
                      backgroundColor: active ? colors.accentSoft : colors.subtle,
                      borderColor: active ? colors.accent : colors.line
                    }
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: active ? colors.accent : colors.body,
                      fontFamily: typography.fontFamily.viNative.medium
                    }}
                    numberOfLines={1}
                  >
                    {d.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Prompt Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardHead}>
          <View style={styles.flex}>
            <View style={styles.rowCenter}>
              <Text
                style={[
                  styles.promptTitle,
                  { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                ]}
              >
                {prompt.jlpt} · {prompt.titleVi}
              </Text>
              {prompt.isRetry && (
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.hard }}>
                  (Ôn lại)
                </Text>
              )}
            </View>
            <Text style={[styles.promptSub, { color: colors.body }]}>{prompt.instructionVi}</Text>
            {prompt.mode !== 'quick_reply' && (
              <Text style={[styles.promptHint, { color: colors.muted }]}>{prompt.contextVi}</Text>
            )}
          </View>
          <Pressable
            onPress={() => void regeneratePrompt()}
            style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.subtle }]}
          >
            <RefreshCw size={16} color={colors.ink} />
          </Pressable>
        </View>

        {prompt.targetGrammar && (
          <View
            style={[
              styles.subBox,
              { backgroundColor: colors.accentSoft, borderColor: colors.accent }
            ]}
          >
            <Text
              style={[
                styles.grammarPattern,
                { color: colors.accent, fontFamily: typography.fontFamily.jpNative.bold }
              ]}
            >
              {prompt.targetGrammar.pattern}
            </Text>
            <Text style={{ fontSize: 13, color: colors.ink }}>{prompt.targetGrammar.meaningVi}</Text>
            {prompt.targetGrammar.formationHint ? (
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Cấu trúc: {prompt.targetGrammar.formationHint}
              </Text>
            ) : null}
          </View>
        )}

        {/* Source sentence / Quick reply question — hidden meaning & reading by default */}
        {prompt.sourceSentence && (
          <View style={[styles.subBox, { backgroundColor: colors.subtle, borderColor: colors.line, gap: 8 }]}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <InteractiveJpTextNative
                  text={prompt.sourceSentence.jp}
                  onSelectKanji={onSelectKanji}
                  style={[
                    styles.sourceJp,
                    { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                  ]}
                />
              </View>
              <Pressable
                onPress={() => {
                  hapticTap();
                  speakJapanese(prompt.sourceSentence!.jp, { rate: speechRate });
                }}
                hitSlop={8}
              >
                <Volume2 size={20} color={colors.accent} />
              </Pressable>
            </View>

            {showSourceReading && prompt.sourceSentence.readingJp ? (
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {prompt.sourceSentence.readingJp}
              </Text>
            ) : null}

            {showSourceVi && (
              <View
                style={[
                  styles.meaningRevealBox,
                  { backgroundColor: colors.surface, borderColor: colors.line }
                ]}
              >
                <Text style={{ fontSize: 13, color: colors.ink, fontWeight: '600' }}>
                  {prompt.sourceSentence.vi}
                </Text>
                {prompt.mode === 'quick_reply' && prompt.contextVi ? (
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                    Bối cảnh: {prompt.contextVi}
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.wordsWrap}>
              <Pressable
                onPress={() => {
                  hapticSelect();
                  setShowSourceVi((v) => !v);
                }}
                style={[styles.miniBtn, { borderColor: colors.line, backgroundColor: colors.surface }]}
              >
                {showSourceVi ? <EyeOff size={13} color={colors.body} /> : <Eye size={13} color={colors.accent} />}
                <Text style={{ fontSize: 11, fontWeight: '600', color: showSourceVi ? colors.body : colors.accent }}>
                  {showSourceVi ? 'Ẩn nghĩa' : 'Hiện nghĩa'}
                </Text>
              </Pressable>

              {prompt.sourceSentence.readingJp ? (
                <Pressable
                  onPress={() => {
                    hapticSelect();
                    setShowSourceReading((v) => !v);
                  }}
                  style={[styles.miniBtn, { borderColor: colors.line, backgroundColor: colors.surface }]}
                >
                  {showSourceReading ? (
                    <EyeOff size={13} color={colors.body} />
                  ) : (
                    <Eye size={13} color={colors.body} />
                  )}
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.body }}>
                    {showSourceReading ? 'Ẩn cách đọc' : 'Cách đọc'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}

        {prompt.targetWords.length > 0 && (
          <View style={styles.wordsWrap}>
            {prompt.targetWords.map((w) => {
              const matched = liveMatched.has(w.surface);
              return (
                <Pressable
                  key={w.surface}
                  onPress={() => {
                    hapticTap();
                    speakJapanese(w.reading || w.surface, { rate: speechRate });
                  }}
                  style={[
                    styles.wordChip,
                    {
                      backgroundColor: matched ? colors.goodSoft : colors.subtle,
                      borderColor: matched ? colors.good : colors.line
                    }
                  ]}
                >
                  <View style={styles.rowCenter}>
                    <InteractiveJpTextNative
                      text={w.surface}
                      onSelectKanji={onSelectKanji}
                      style={{
                        fontSize: 14,
                        color: colors.ink,
                        fontFamily: typography.fontFamily.jpNative.bold
                      }}
                    />
                    <Text style={{ fontSize: 11, color: colors.muted }}> ({w.reading})</Text>
                    {matched && <Check size={13} color={colors.good} />}
                  </View>
                  <Text style={{ fontSize: 11, color: colors.body }}>{w.meaningVi}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Input */}
        <TextInput
          ref={inputRef}
          multiline
          value={inputText}
          onChangeText={setInputText}
          placeholder={prompt.placeholderJp}
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            {
              backgroundColor: colors.canvas,
              borderColor: colors.lineStrong,
              color: colors.ink,
              fontFamily: typography.fontFamily.jpNative.regular
            }
          ]}
        />

        <View style={styles.actionRow}>
          <View style={styles.rowCenter}>
            <Pressable
              onPress={() => {
                hapticSelect();
                setSpeechRate((r) => (r < 0.85 ? 0.92 : 0.75));
              }}
              style={[styles.miniBtn, { borderColor: colors.line, backgroundColor: colors.subtle }]}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.body }}>
                TTS {speechRate < 0.85 ? '0.75x' : '1.0x'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                hapticTap();
                inputRef.current?.focus();
                Alert.alert('Nhập giọng nói tiếng Nhật', sttInfo.hintVi);
              }}
              style={[styles.miniBtn, { borderColor: colors.line, backgroundColor: colors.subtle }]}
            >
              <Mic size={14} color={colors.body} />
            </Pressable>
            <Pressable
              onPress={() => {
                hapticSelect();
                setShowHistory((v) => !v);
              }}
              style={[styles.miniBtn, { borderColor: colors.line, backgroundColor: colors.subtle }]}
            >
              <Clock size={14} color={colors.body} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.body }}>
                {history.length}
              </Text>
            </Pressable>
          </View>

          <Pressable
            disabled={!inputText.trim() || checking}
            onPress={() => void handleSubmit()}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor:
                  !inputText.trim() || checking
                    ? colors.lineStrong
                    : pressed
                      ? colors.accentHover
                      : colors.accent
              }
            ]}
          >
            {checking ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <>
                <Sparkles size={15} color={colors.onAccent} />
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.onAccent,
                    fontFamily: typography.fontFamily.viNative.semibold
                  }}
                >
                  Chấm AI
                </Text>
                <Send size={13} color={colors.onAccent} />
              </>
            )}
          </Pressable>
        </View>

        {error && (
          <Text style={{ fontSize: 12, color: colors.again, marginTop: 4 }}>{error}</Text>
        )}
      </View>

      {/* AI Feedback */}
      {feedback && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
          <View style={styles.rowBetween}>
            <View style={[styles.rowCenter, styles.flex]}>
              <View
                style={[
                  styles.scoreBadge,
                  {
                    backgroundColor:
                      feedback.overallScore >= 80
                        ? colors.goodSoft
                        : feedback.overallScore >= QUICK_REPLY_PASS_SCORE
                          ? colors.hardSoft
                          : colors.againSoft
                  }
                ]}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '800',
                    color:
                      feedback.overallScore >= 80
                        ? colors.good
                        : feedback.overallScore >= QUICK_REPLY_PASS_SCORE
                          ? colors.hard
                          : colors.again
                  }}
                >
                  {feedback.overallScore}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.ink,
                    fontFamily: typography.fontFamily.viNative.bold
                  }}
                >
                  {feedback.isAcceptable ? 'Câu ổn & rõ ý!' : 'Cần chỉnh một chút'}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  {prompt.mode === 'quick_reply'
                    ? feedback.overallScore >= QUICK_REPLY_PASS_SCORE
                      ? `✓ Đạt ≥${QUICK_REPLY_PASS_SCORE}đ — không lặp lại câu này`
                      : `Dưới ${QUICK_REPLY_PASS_SCORE}đ — sẽ lặp lại để luyện tiếp`
                    : `Ngữ pháp ${feedback.scores.grammar}/5 · Tự nhiên ${feedback.scores.naturalness}/5`}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => void regeneratePrompt()}
              style={[styles.nextPromptBtn, { backgroundColor: colors.accent }]}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.onAccent }}>Tiếp</Text>
              <ArrowRight size={13} color={colors.onAccent} />
            </Pressable>
          </View>

          {feedback.overallScore >= 80 && dueTargetCards.length > 0 && (
            <View style={styles.wordsWrap}>
              {dueTargetCards.map((card) => {
                const done = markedCardIds.has(card.id);
                return (
                  <Pressable
                    key={card.id}
                    disabled={done}
                    onPress={() => {
                      markCardGood(card.id);
                      hapticSuccess();
                      setMarkedCardIds((prev) => new Set(prev).add(card.id));
                    }}
                    style={[
                      styles.miniBtn,
                      {
                        borderColor: done ? colors.good : colors.accent,
                        backgroundColor: done ? colors.goodSoft : colors.accentSoft
                      }
                    ]}
                  >
                    <CheckCircle2 size={14} color={done ? colors.good : colors.accent} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: done ? colors.good : colors.accent
                      }}
                    >
                      {done
                        ? `Đã ôn ${card.word?.surface}`
                        : `Đánh dấu đã ôn "${card.word?.surface}" (Tốt)`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={[styles.subBox, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <View style={styles.rowBetween}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>
                CÁCH NÓI TỰ NHIÊN NHẤT
              </Text>
              <Pressable
                onPress={() => {
                  hapticTap();
                  speakJapanese(feedback.naturalJp, { rate: speechRate });
                }}
              >
                <Volume2 size={16} color={colors.accent} />
              </Pressable>
            </View>
            <InteractiveJpTextNative
              text={feedback.naturalJp}
              onSelectKanji={onSelectKanji}
              style={{
                fontSize: 16,
                color: colors.ink,
                fontFamily: typography.fontFamily.jpNative.bold
              }}
            />
            {feedback.readingJp ? (
              <Text style={{ fontSize: 12, color: colors.muted }}>{feedback.readingJp}</Text>
            ) : null}
          </View>

          {feedback.correctedJp !== feedback.naturalJp && (
            <View style={[styles.subBox, { backgroundColor: colors.subtle, borderColor: colors.line }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted }}>
                BẢN SỬA GIỮ NGUYÊN Ý
              </Text>
              <InteractiveJpTextNative
                text={feedback.correctedJp}
                onSelectKanji={onSelectKanji}
                style={{
                  fontSize: 15,
                  color: colors.ink,
                  fontFamily: typography.fontFamily.jpNative.medium
                }}
              />
            </View>
          )}

          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.body }}>
            {feedback.explanationVi}
          </Text>

          {feedback.issues.length > 0 && (
            <View style={{ gap: 8 }}>
              {feedback.issues.map((issue, idx) => (
                <View
                  key={idx}
                  style={[styles.subBox, { backgroundColor: colors.subtle, borderColor: colors.line }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.again }}>
                    {issue.originalSegment} → {issue.suggestion}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.body }}>{issue.explanationVi}</Text>
                </View>
              ))}
            </View>
          )}

          {feedback.suggestedPhrases.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted }}>
                LƯU CỤM TỪ HAY VÀO DECK FSRS
              </Text>
              {feedback.suggestedPhrases.map((phrase, idx) => {
                const saved = isPhraseSaved(phrase.surface);
                return (
                  <View
                    key={`${phrase.surface}_${idx}`}
                    style={[
                      styles.phraseRow,
                      { backgroundColor: colors.subtle, borderColor: colors.line }
                    ]}
                  >
                    <View style={styles.flex}>
                      <InteractiveJpTextNative
                        text={`${phrase.surface} (${phrase.reading})`}
                        onSelectKanji={onSelectKanji}
                        style={{
                          fontSize: 14,
                          color: colors.ink,
                          fontFamily: typography.fontFamily.jpNative.bold
                        }}
                      />
                      <Text style={{ fontSize: 12, color: colors.body }}>{phrase.meaningVi}</Text>
                    </View>
                    <Pressable
                      disabled={saved}
                      onPress={() => handleSavePhrase(phrase)}
                      style={[
                        styles.savePhraseBtn,
                        { backgroundColor: saved ? colors.goodSoft : colors.accentSoft }
                      ]}
                    >
                      {saved ? (
                        <Check size={14} color={colors.good} />
                      ) : (
                        <BookmarkPlus size={14} color={colors.accent} />
                      )}
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: saved ? colors.good : colors.accent
                        }}
                      >
                        {saved ? 'Đã có' : 'Lưu'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* History */}
      {showHistory && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text
            style={{
              fontSize: 14,
              color: colors.ink,
              fontFamily: typography.fontFamily.viNative.bold
            }}
          >
            Lịch sử đặt câu gần đây ({history.length})
          </Text>
          {history.length === 0 ? (
            <Text style={{ fontSize: 12, color: colors.muted }}>Chưa có lịch sử đặt câu.</Text>
          ) : (
            history.slice(0, 15).map((item) => (
              <View
                key={item.id}
                style={[styles.subBox, { backgroundColor: colors.subtle, borderColor: colors.line }]}
              >
                <View style={styles.rowBetween}>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    {item.jlpt} · {item.mode === 'quick_reply' ? 'Phản xạ nhanh' : POLITENESS_LABELS[item.politeness].label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color:
                        item.feedback.overallScore >= QUICK_REPLY_PASS_SCORE
                          ? colors.accent
                          : colors.again
                    }}
                  >
                    {item.feedback.overallScore}/100
                  </Text>
                </View>
                {item.sourceSentence ? (
                  <Text style={{ fontSize: 11, color: colors.muted }}>Hỏi: {item.sourceSentence}</Text>
                ) : null}
                <Text style={{ fontSize: 13, color: colors.ink }}>{item.userSentence}</Text>
                <Text style={{ fontSize: 12, color: colors.accent }}>
                  → {item.feedback.naturalJp}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  flex: { flex: 1 },
  pillRow: { gap: 8, paddingVertical: 2 },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  pillText: { fontSize: 12 },
  filterGroup: { gap: 8 },
  levelRow: { flexDirection: 'row', gap: 6 },
  levelChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 7
  },
  levelText: { fontSize: 12 },
  polRow: { flexDirection: 'row', gap: 6 },
  polChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 7
  },
  polText: { fontSize: 12 },
  deckChip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 180
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12
  },
  cardHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  promptTitle: { fontSize: 15 },
  promptSub: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  promptHint: { fontSize: 12, marginTop: 2 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  subBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4
  },
  meaningRevealBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10
  },
  grammarPattern: { fontSize: 18 },
  sourceJp: { fontSize: 17, lineHeight: 25 },
  wordsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordChip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 2
  },
  input: {
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top'
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  nextPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  phraseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10
  },
  savePhraseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7
  }
});
