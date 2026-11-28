import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Sparkles,
  Volume2
} from 'lucide-react';
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
  type Deck,
  type Grammar,
  type JlptLevel,
  type PolitenessLevel,
  type QuickReplyCategory,
  type SavedPhraseCandidate,
  type SentenceAttemptRecord,
  type SentenceFeedback,
  type SentencePracticeMode,
  type SentencePracticePrompt,
  type StudyCard
} from '@raku/core';
import type { User } from '../services/firebase';
import { JLPT_LEVELS, fetchGrammarPoints } from '../services/grammarStore';
import { checkSentenceWithAi } from '../services/conversationApi';
import { loadSentenceHistory, persistSentenceAttempt } from '../services/practiceHistorySync';
import { speakJapanese, useJapaneseSpeechRecognition } from '../services/speech';
import { InteractiveJpText } from './InteractiveJpText';

export interface SentenceStudioViewProps {
  user: User | null;
  cards: StudyCard[];
  decks: Deck[];
  initialGrammar?: Grammar | null;
  onSelectKanji?: (char: string) => void;
  onSavePhraseToDeck: (phrase: SavedPhraseCandidate, preferredDeckId?: string) => string | null;
  onRecordPracticeTime?: (seconds: number) => void;
  onMarkCardGood?: (cardId: string) => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

const MODE_OPTIONS: Array<{ id: SentencePracticeMode; label: string; desc: string }> = [
  { id: 'quick_reply', label: 'Phản xạ nhanh', desc: '310+ tình huống đời sống hằng ngày' },
  { id: 'word_builder', label: 'Đặt câu từ Deck', desc: 'Ưu tiên từ hay quên & vừa học' },
  { id: 'grammar_target', label: 'Đặt câu Ngữ pháp', desc: 'Áp dụng mẫu ngữ pháp JLPT' },
  { id: 'transform', label: 'Biến hóa câu', desc: 'Đổi thể thân mật / lịch sự / kính ngữ' }
];

const QUICK_REPLY_CATEGORIES = Object.keys(QUICK_REPLY_CATEGORY_LABELS) as QuickReplyCategory[];
const TRANSFORM_POLITENESS_OPTIONS: PolitenessLevel[] = ['casual', 'polite', 'keigo'];

const ISSUE_CATEGORY_LABELS: Record<string, string> = {
  grammar: 'Ngữ pháp',
  particle: 'Trợ từ',
  word_choice: 'Chọn từ',
  politeness: 'Mức lịch sự',
  naturalness: 'Độ tự nhiên',
  spelling: 'Chính tả / Kana'
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, Math.round((value / 5) * 100)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-raku-muted">{label}</span>
        <span className="font-bold text-raku-ink tabular-nums">{value}/5</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raku-subtle">
        <div
          className="h-full rounded-full bg-raku-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SentenceStudioView({
  user,
  cards,
  decks,
  initialGrammar,
  onSelectKanji,
  onSavePhraseToDeck,
  onRecordPracticeTime,
  onMarkCardGood,
  onNotify
}: SentenceStudioViewProps) {
  const [mode, setMode] = useState<SentencePracticeMode>(
    initialGrammar ? 'grammar_target' : 'quick_reply'
  );
  const [jlpt, setJlpt] = useState<JlptLevel>(initialGrammar?.jlpt || 'N3');
  const [quickReplyJlpt, setQuickReplyJlpt] = useState<JlptLevel | 'all'>('all');
  const [quickReplyCategory, setQuickReplyCategory] = useState<QuickReplyCategory | 'all'>('all');
  const [transformPoliteness, setTransformPoliteness] = useState<PolitenessLevel>('polite');
  const [selectedDeckId, setSelectedDeckId] = useState<string>('all');
  const [wordCount, setWordCount] = useState<number>(2);

  // Grammar options for grammar_target mode
  const [grammarList, setGrammarList] = useState<Grammar[]>([]);
  const [selectedGrammarId, setSelectedGrammarId] = useState<string>(initialGrammar?.id || '');
  const [loadingGrammar, setLoadingGrammar] = useState(false);

  const [history, setHistory] = useState<SentenceAttemptRecord[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [prompt, setPrompt] = useState<SentencePracticePrompt>(() => {
    if (initialGrammar) {
      return buildGrammarSentencePrompt(initialGrammar, 'any');
    }
    return buildQuickReplyPrompt('all', 'any', []);
  });

  // Hide Vietnamese meaning & Furigana reading by default until user clicks to reveal
  const [showSourceVi, setShowSourceVi] = useState(false);
  const [showSourceReading, setShowSourceReading] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SentenceFeedback | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(0.95);
  const [markedCardIds, setMarkedCardIds] = useState<Set<string>>(new Set());
  const [savedPhraseKeys, setSavedPhraseKeys] = useState<Set<string>>(new Set());

  const promptStartedAtRef = useRef<number>(Date.now());
  const historyRef = useRef<SentenceAttemptRecord[]>(history);
  historyRef.current = history;

  const speech = useJapaneseSpeechRecognition((transcript) => {
    setInputText((prev) => (prev ? `${prev}${transcript}` : transcript));
  });

  // Load saved sentence history for user, then avoid already-passed (>=50) quick reply prompt
  useEffect(() => {
    let active = true;
    void loadSentenceHistory(user?.uid).then((items) => {
      if (!active) return;
      setHistory(items);
      setHistoryLoaded(true);
      if (!initialGrammar) {
        setPrompt((curr) => {
          if (curr.mode !== 'quick_reply') return curr;
          const progress = computeQuickReplyProgress(items, { jlpt: 'all', category: 'all' });
          if (curr.promptId && progress.passedIds.has(curr.promptId)) {
            return buildQuickReplyPrompt('all', 'any', [], {
              category: 'all',
              history: items,
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

  // Sync deep-linked initialGrammar
  useEffect(() => {
    if (!initialGrammar) return;
    setMode('grammar_target');
    setJlpt(initialGrammar.jlpt);
    setSelectedGrammarId(initialGrammar.id);
    setPrompt(buildGrammarSentencePrompt(initialGrammar, 'any'));
    setFeedback(null);
    setInputText('');
    setError(null);
    setShowSourceVi(false);
    setShowSourceReading(false);
    promptStartedAtRef.current = Date.now();
  }, [initialGrammar]);

  // Load grammar list when needed
  useEffect(() => {
    if (mode !== 'grammar_target') return;
    let cancelled = false;
    setLoadingGrammar(true);
    void fetchGrammarPoints(jlpt)
      .then((list) => {
        if (cancelled) return;
        setGrammarList(list);
        if (list.length > 0 && !list.some((g) => g.id === selectedGrammarId)) {
          const picked = list[0]!;
          setSelectedGrammarId(picked.id);
          setPrompt(buildGrammarSentencePrompt(picked, 'any'));
        }
      })
      .catch(() => {
        if (!cancelled) setGrammarList([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingGrammar(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, jlpt]);

  const quickReplyProgress = useMemo(
    () =>
      computeQuickReplyProgress(history, {
        jlpt: quickReplyJlpt,
        category: quickReplyCategory
      }),
    [history, quickReplyJlpt, quickReplyCategory]
  );

  const regeneratePrompt = (opts: {
    nextMode?: SentencePracticeMode;
    nextJlpt?: JlptLevel;
    nextQuickJlpt?: JlptLevel | 'all';
    nextCategory?: QuickReplyCategory | 'all';
    nextTransformPoliteness?: PolitenessLevel;
    nextDeckId?: string;
    nextWordCount?: number;
    nextGrammar?: Grammar;
    latestHistory?: SentenceAttemptRecord[];
  } = {}) => {
    const targetMode = opts.nextMode ?? mode;
    const targetJlpt = opts.nextJlpt ?? jlpt;
    const targetQuickJlpt = opts.nextQuickJlpt ?? quickReplyJlpt;
    const targetCategory = opts.nextCategory ?? quickReplyCategory;
    const targetTransformPol = opts.nextTransformPoliteness ?? transformPoliteness;
    const targetDeckId = opts.nextDeckId ?? selectedDeckId;
    const targetWordCount = opts.nextWordCount ?? wordCount;
    const activeHistory = opts.latestHistory ?? historyRef.current;

    setFeedback(null);
    setError(null);
    setInputText('');
    setShowSourceVi(false);
    setShowSourceReading(false);
    setMarkedCardIds(new Set());
    setSavedPhraseKeys(new Set());
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
        count: targetWordCount,
        excludeSurfaces: prompt.targetWords.map((w) => w.surface)
      });
      setPrompt(buildWordSentencePrompt(picked, 'any', targetJlpt));
      return;
    }

    if (targetMode === 'grammar_target') {
      const target =
        opts.nextGrammar ||
        grammarList.find((g) => g.id === selectedGrammarId) ||
        initialGrammar ||
        grammarList[Math.floor(Math.random() * Math.max(1, grammarList.length))];
      if (target) {
        setSelectedGrammarId(target.id);
        const optWords = pickTargetWordsForPractice(cards, { deckId: targetDeckId, count: 1 });
        setPrompt(buildGrammarSentencePrompt(target, 'any', optWords));
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

  const liveMatchedWords = useMemo(
    () => new Set(matchTargetWordsLive(inputText, prompt.targetWords)),
    [inputText, prompt.targetWords]
  );

  // Check if any target word corresponds to a currently due FSRS card
  const dueTargetCards = useMemo(() => {
    const result: StudyCard[] = [];
    for (const tw of prompt.targetWords) {
      if (!tw.cardId) continue;
      const found = cards.find((c) => c.id === tw.cardId && c.isDue);
      if (found) result.push(found);
    }
    return result;
  }, [prompt.targetWords, cards]);

  const handleSubmit = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isChecking) return;
    setIsChecking(true);
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

      const elapsedSeconds = Math.min(
        300,
        Math.max(10, Math.round((Date.now() - promptStartedAtRef.current) / 1000))
      );
      onRecordPracticeTime?.(elapsedSeconds);
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
      const updatedHistory = await persistSentenceAttempt(user?.uid, attempt, history);
      setHistory(updatedHistory);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể chấm câu lúc này.');
    } finally {
      setIsChecking(false);
    }
  };

  const targetSaveDeckId = selectedDeckId !== 'all' ? selectedDeckId : undefined;

  const isPhraseAlreadySaved = (surface: string): boolean => {
    if (savedPhraseKeys.has(surface)) return true;
    if (targetSaveDeckId && isDuplicatePhraseInDeck(surface, targetSaveDeckId, cards)) return true;
    const convDeck = decks.find((d) => d.id === 'deck_conversation_phrases');
    if (convDeck && isDuplicatePhraseInDeck(surface, convDeck.id, cards)) return true;
    return false;
  };

  const handleSavePhrase = (phrase: SavedPhraseCandidate) => {
    const savedId = onSavePhraseToDeck(phrase, targetSaveDeckId);
    if (savedId) {
      setSavedPhraseKeys((prev) => new Set(prev).add(phrase.surface));
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MODE_OPTIONS.map((opt) => {
          const active = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setMode(opt.id);
                regeneratePrompt({ nextMode: opt.id });
              }}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active
                  ? 'border-raku-accent bg-raku-accent-soft/60 text-raku-ink'
                  : 'border-raku-line bg-raku-surface text-raku-body hover:border-raku-line-strong'
              }`}
            >
              <div className="text-xs font-bold">{opt.label}</div>
              <div className="mt-0.5 text-[11px] text-raku-muted">{opt.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="raku-card space-y-2.5 p-3.5 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {mode === 'quick_reply' ? (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-raku-muted">Cấp độ:</span>
              <div className="inline-flex rounded-lg border border-raku-line bg-raku-subtle p-0.5">
                {(['all', ...JLPT_LEVELS] as const).map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => {
                      setQuickReplyJlpt(lv);
                      regeneratePrompt({ nextMode: 'quick_reply', nextQuickJlpt: lv });
                    }}
                    className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                      quickReplyJlpt === lv
                        ? 'bg-raku-surface text-raku-accent shadow-xs'
                        : 'text-raku-muted hover:text-raku-ink'
                    }`}
                  >
                    {lv === 'all' ? 'Tất cả' : lv}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-raku-muted">JLPT:</span>
              <div className="inline-flex rounded-lg border border-raku-line bg-raku-subtle p-0.5">
                {JLPT_LEVELS.map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => {
                      setJlpt(lv);
                      regeneratePrompt({ nextJlpt: lv });
                    }}
                    className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                      jlpt === lv
                        ? 'bg-raku-surface text-raku-accent shadow-xs'
                        : 'text-raku-muted hover:text-raku-ink'
                    }`}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Only show target politeness selector in transform mode */}
          {mode === 'transform' && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-raku-muted">Đổi sang:</span>
              <select
                value={transformPoliteness}
                onChange={(e) => {
                  const next = e.target.value as PolitenessLevel;
                  setTransformPoliteness(next);
                  regeneratePrompt({ nextTransformPoliteness: next });
                }}
                className="rounded-lg border border-raku-line-strong bg-raku-surface px-2.5 py-1.5 font-medium text-raku-ink focus:outline-none focus:ring-2 focus:ring-raku-accent"
              >
                {TRANSFORM_POLITENESS_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {POLITENESS_LABELS[k].label} ({POLITENESS_LABELS[k].jp})
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'word_builder' && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-raku-muted">Bộ thẻ:</span>
                <select
                  value={selectedDeckId}
                  onChange={(e) => {
                    setSelectedDeckId(e.target.value);
                    regeneratePrompt({ nextDeckId: e.target.value });
                  }}
                  className="max-w-[180px] rounded-lg border border-raku-line-strong bg-raku-surface px-2.5 py-1.5 font-medium text-raku-ink focus:outline-none focus:ring-2 focus:ring-raku-accent"
                >
                  <option value="all">Ưu tiên từ yếu / đã học</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-raku-muted">Số từ:</span>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setWordCount(n);
                      regeneratePrompt({ nextWordCount: n });
                    }}
                    className={`h-7 w-7 rounded-lg border font-bold ${
                      wordCount === n
                        ? 'border-raku-accent bg-raku-accent-soft text-raku-accent'
                        : 'border-raku-line bg-raku-surface text-raku-muted'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === 'grammar_target' && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-raku-muted">Mẫu ngữ pháp:</span>
              {loadingGrammar ? (
                <span className="text-raku-muted">Đang tải...</span>
              ) : grammarList.length > 0 ? (
                <select
                  value={selectedGrammarId}
                  onChange={(e) => {
                    const found = grammarList.find((g) => g.id === e.target.value);
                    setSelectedGrammarId(e.target.value);
                    if (found) {
                      regeneratePrompt({ nextMode: 'grammar_target', nextGrammar: found });
                    }
                  }}
                  className="max-w-[230px] rounded-lg border border-raku-line-strong bg-raku-surface px-2.5 py-1.5 font-jp font-medium text-raku-ink focus:outline-none focus:ring-2 focus:ring-raku-accent"
                >
                  {grammarList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.pattern} — {g.meaningVi[0]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-raku-muted">Dùng mẫu gợi ý</span>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSpeechRate((r) => (r < 0.85 ? 0.95 : 0.75))}
              className="rounded-lg border border-raku-line bg-raku-subtle px-2.5 py-1 font-semibold text-raku-body hover:text-raku-ink"
              title="Chuyển tốc độ đọc TTS"
            >
              TTS {speechRate < 0.85 ? '0.75x' : '1.0x'}
            </button>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-raku-line bg-raku-surface px-2.5 py-1 font-semibold text-raku-body hover:text-raku-ink"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Lịch sử ({history.length})</span>
            </button>
          </div>
        </div>

        {/* Category pills & mastery progress for Quick Reply */}
        {mode === 'quick_reply' && (
          <div className="space-y-2 border-t border-raku-line pt-2.5">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setQuickReplyCategory('all');
                  regeneratePrompt({ nextMode: 'quick_reply', nextCategory: 'all' });
                }}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  quickReplyCategory === 'all'
                    ? 'border-raku-accent bg-raku-accent text-raku-on-accent'
                    : 'border-raku-line bg-raku-surface text-raku-body hover:border-raku-line-strong'
                }`}
              >
                Tất cả chủ đề
              </button>
              {QUICK_REPLY_CATEGORIES.map((cat) => {
                const active = quickReplyCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setQuickReplyCategory(cat);
                      regeneratePrompt({ nextMode: 'quick_reply', nextCategory: cat });
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      active
                        ? 'border-raku-accent bg-raku-accent text-raku-on-accent'
                        : 'border-raku-line bg-raku-surface text-raku-body hover:border-raku-line-strong'
                    }`}
                  >
                    {QUICK_REPLY_CATEGORY_LABELS[cat]}
                  </button>
                );
              })}
            </div>

            {historyLoaded && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-raku-muted">
                <span>
                  Đã vượt qua (≥{QUICK_REPLY_PASS_SCORE}đ):{' '}
                  <strong className="text-raku-accent tabular-nums">
                    {quickReplyProgress.passedCount} / {quickReplyProgress.total}
                  </strong>{' '}
                  câu (không lặp lại)
                </span>
                {quickReplyProgress.retryCount > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">
                    Cần ôn lại (&lt;{QUICK_REPLY_PASS_SCORE}đ): {quickReplyProgress.retryCount} câu
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Prompt + Input Card */}
      <div className="raku-card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-raku-accent-soft px-2 py-0.5 text-[11px] font-bold text-raku-accent">
                {prompt.jlpt}
              </span>
              {prompt.mode === 'transform' && (
                <span className="rounded-md bg-raku-subtle px-2 py-0.5 text-[11px] font-semibold text-raku-body">
                  {POLITENESS_LABELS[prompt.politeness].label}
                </span>
              )}
              {prompt.isRetry && (
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  Làm lại (&lt;{QUICK_REPLY_PASS_SCORE}đ)
                </span>
              )}
              {prompt.allPassed && (
                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  Đã qua hết mục này — đang ôn vòng mới
                </span>
              )}
              <h3 className="text-base font-bold text-raku-ink">{prompt.titleVi}</h3>
            </div>
            <p className="mt-1.5 text-sm text-raku-body">{prompt.instructionVi}</p>
            {prompt.mode !== 'quick_reply' && (
              <p className="mt-1 text-xs text-raku-muted">{prompt.contextVi}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => regeneratePrompt()}
            className="raku-btn-secondary min-h-9 px-3 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Câu khác</span>
          </button>
        </div>

        {/* Target Grammar Box */}
        {prompt.targetGrammar && (
          <div className="rounded-xl border border-raku-accent/30 bg-raku-accent-soft/40 p-3.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-jp text-lg font-bold text-raku-accent">
                {prompt.targetGrammar.pattern}
              </span>
              <span className="text-xs font-semibold text-raku-ink">
                {prompt.targetGrammar.meaningVi}
              </span>
            </div>
            {prompt.targetGrammar.formationHint && (
              <p className="mt-1 text-xs text-raku-muted">
                Cấu trúc: <span className="font-medium text-raku-body">{prompt.targetGrammar.formationHint}</span>
              </p>
            )}
          </div>
        )}

        {/* Source Sentence / Quick Reply Question — Vietnamese meaning & reading HIDDEN by default */}
        {prompt.sourceSentence && (
          <div className="rounded-xl border border-raku-line bg-raku-subtle/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-jp text-lg font-bold leading-relaxed text-raku-ink">
                  <InteractiveJpText text={prompt.sourceSentence.jp} onSelectKanji={onSelectKanji} />
                </p>

                {showSourceReading && prompt.sourceSentence.readingJp && (
                  <p className="font-jp text-xs text-raku-muted">
                    {prompt.sourceSentence.readingJp}
                  </p>
                )}

                {showSourceVi && (
                  <div className="rounded-lg border border-raku-line bg-raku-surface/80 px-3 py-2 text-xs text-raku-body">
                    <p className="font-medium text-raku-ink">{prompt.sourceSentence.vi}</p>
                    {prompt.mode === 'quick_reply' && prompt.contextVi && (
                      <p className="mt-0.5 text-[11px] text-raku-muted">Bối cảnh: {prompt.contextVi}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowSourceVi((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg border border-raku-line bg-raku-surface px-2.5 py-1 text-[11px] font-semibold text-raku-body hover:border-raku-accent hover:text-raku-accent"
                  >
                    {showSourceVi ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{showSourceVi ? 'Ẩn nghĩa tiếng Việt' : 'Hiện nghĩa tiếng Việt'}</span>
                  </button>

                  {prompt.sourceSentence.readingJp && (
                    <button
                      type="button"
                      onClick={() => setShowSourceReading((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg border border-raku-line bg-raku-surface px-2.5 py-1 text-[11px] font-semibold text-raku-body hover:border-raku-accent hover:text-raku-accent"
                    >
                      {showSourceReading ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      <span>{showSourceReading ? 'Ẩn cách đọc' : 'Hiện cách đọc'}</span>
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => speakJapanese(prompt.sourceSentence!.jp, { rate: speechRate })}
                className="shrink-0 rounded-xl border border-raku-line bg-raku-surface p-2.5 text-raku-body hover:border-raku-accent hover:text-raku-accent"
                aria-label="Nghe câu hỏi"
                title="Nghe phát âm tiếng Nhật"
              >
                <Volume2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Target Words Chips with Live Stem Highlighting */}
        {prompt.targetWords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {prompt.targetWords.map((w) => {
              const matched = liveMatchedWords.has(w.surface);
              return (
                <div
                  key={w.surface}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                    matched
                      ? 'border-emerald-500/60 bg-emerald-50/70 dark:bg-emerald-950/30'
                      : 'border-raku-line bg-raku-subtle/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-jp text-sm font-bold text-raku-ink">
                        <InteractiveJpText text={w.surface} onSelectKanji={onSelectKanji} />
                      </span>
                      <span className="font-jp text-[11px] text-raku-muted">({w.reading})</span>
                      {matched && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                    <div className="text-[11px] text-raku-body">{w.meaningVi}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakJapanese(w.reading || w.surface, { rate: speechRate })}
                    className="rounded-md p-1 text-raku-muted hover:bg-raku-surface hover:text-raku-accent"
                    aria-label={`Nghe từ ${w.surface}`}
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Input box + STT */}
        <div className="space-y-2">
          <div className="relative">
            <textarea
              rows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={prompt.placeholderJp}
              className="w-full rounded-xl border border-raku-line-strong bg-raku-surface p-3.5 pr-12 font-jp text-base text-raku-ink placeholder:font-sans placeholder:text-sm placeholder:text-raku-muted focus:border-raku-accent focus:outline-none focus:ring-2 focus:ring-raku-accent/30"
            />
            {speech.isSupported && (
              <button
                type="button"
                onClick={speech.toggle}
                aria-label={speech.isListening ? 'Dừng ghi âm' : 'Nói tiếng Nhật'}
                title={speech.isListening ? 'Đang nghe tiếng Nhật...' : 'Nói tiếng Nhật (ja-JP)'}
                className={`absolute right-2.5 top-2.5 rounded-lg p-2 transition-colors ${
                  speech.isListening
                    ? 'bg-raku-signal text-white animate-pulse'
                    : 'bg-raku-subtle text-raku-body hover:text-raku-accent'
                }`}
              >
                {speech.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
          </div>

          {speech.isListening && (
            <p className="text-xs text-raku-signal">
              Đang nghe tiếng Nhật (ja-JP)... {speech.interimText && `「${speech.interimText}」`}
            </p>
          )}
          {speech.error && <p className="text-xs text-raku-signal">{speech.error}</p>}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-raku-signal/40 bg-raku-signal-soft p-3 text-xs text-raku-signal">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-raku-muted">
              Mẹo: Nhấn <kbd className="rounded border border-raku-line px-1">Ctrl</kbd> +{' '}
              <kbd className="rounded border border-raku-line px-1">Enter</kbd> để chấm nhanh · Chạm vào chữ Hán để tra Kanji.
            </span>
            <button
              type="button"
              disabled={!inputText.trim() || isChecking}
              onClick={() => void handleSubmit()}
              className="raku-btn-primary min-h-10 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isChecking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>AI đang chấm câu...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Chấm câu bằng AI</span>
                  <Send className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 4-Dimension AI Feedback Card */}
      {feedback && (
        <div className="raku-card space-y-4 p-5 animate-raku-enter">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-raku-line pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl text-base font-extrabold tabular-nums ${
                  feedback.overallScore >= 80
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : feedback.overallScore >= QUICK_REPLY_PASS_SCORE
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-raku-signal-soft text-raku-signal'
                }`}
              >
                {feedback.overallScore}
              </div>
              <div>
                <h4 className="text-sm font-bold text-raku-ink">
                  {feedback.isAcceptable ? 'Câu ổn & truyền đạt rõ ý!' : 'Cần chỉnh lại một chút'}
                </h4>
                <p className="text-xs text-raku-muted">
                  {prompt.mode === 'quick_reply'
                    ? feedback.overallScore >= QUICK_REPLY_PASS_SCORE
                      ? `✓ Đạt ≥${QUICK_REPLY_PASS_SCORE}đ — câu này đã qua và sẽ không lặp lại.`
                      : `Dưới ${QUICK_REPLY_PASS_SCORE}đ — câu này sẽ được lặp lại để bạn luyện tiếp.`
                    : 'Đánh giá từ gia sư AI'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {feedback.overallScore >= 80 && onMarkCardGood && dueTargetCards.length > 0 && (
                <>
                  {dueTargetCards.map((card) => {
                    const done = markedCardIds.has(card.id);
                    return (
                      <button
                        key={card.id}
                        type="button"
                        disabled={done}
                        onClick={() => {
                          onMarkCardGood(card.id);
                          setMarkedCardIds((prev) => new Set(prev).add(card.id));
                          onNotify?.(
                            `Đã đánh dấu ôn tốt thẻ "${card.word?.surface}" trong FSRS!`,
                            'success'
                          );
                        }}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                          done
                            ? 'border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border-raku-accent bg-raku-accent-soft text-raku-accent hover:bg-raku-accent hover:text-raku-on-accent'
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>
                          {done
                            ? `Đã ôn ${card.word?.surface}`
                            : `Đánh dấu đã ôn "${card.word?.surface}" (Tốt)`}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}

              <button
                type="button"
                onClick={() => regeneratePrompt()}
                className="raku-btn-primary min-h-9 px-3.5 text-xs"
              >
                <span>Câu tiếp theo</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* 3 score bars */}
          <div className="grid gap-3 sm:grid-cols-3">
            <ScoreBar label="Ngữ pháp & trợ từ" value={feedback.scores.grammar} />
            <ScoreBar label="Độ tự nhiên" value={feedback.scores.naturalness} />
            <ScoreBar
              label={prompt.mode === 'transform' ? 'Mức độ lịch sự' : 'Nhất quán văn phong'}
              value={feedback.scores.politenessFit}
            />
          </div>

          {/* Corrected vs Natural */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-raku-line bg-raku-subtle/40 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-raku-muted">
                  Bản sửa giữ nguyên ý
                </span>
                <button
                  type="button"
                  onClick={() => speakJapanese(feedback.correctedJp, { rate: speechRate })}
                  className="rounded-md p-1 text-raku-muted hover:text-raku-accent"
                  aria-label="Nghe bản sửa"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1.5 font-jp text-base font-bold text-raku-ink">
                <InteractiveJpText text={feedback.correctedJp} onSelectKanji={onSelectKanji} />
              </p>
            </div>

            <div className="rounded-xl border border-raku-accent/40 bg-raku-accent-soft/40 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-raku-accent">
                  Cách nói tự nhiên nhất
                </span>
                <button
                  type="button"
                  onClick={() => speakJapanese(feedback.naturalJp, { rate: speechRate })}
                  className="rounded-md p-1 text-raku-accent hover:bg-raku-surface"
                  aria-label="Nghe cách nói tự nhiên"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1.5 font-jp text-base font-bold text-raku-ink">
                <InteractiveJpText text={feedback.naturalJp} onSelectKanji={onSelectKanji} />
              </p>
              {feedback.readingJp && (
                <p className="mt-1 font-jp text-xs text-raku-muted">{feedback.readingJp}</p>
              )}
            </div>
          </div>

          {/* Explanation */}
          <div className="rounded-xl border border-raku-line bg-raku-surface p-3.5 text-sm leading-relaxed text-raku-body">
            <p>{feedback.explanationVi}</p>
            {feedback.alternativeJp && (
              <p className="mt-2 text-xs text-raku-muted">
                Cách diễn đạt khác:{' '}
                <span className="font-jp font-semibold text-raku-ink">
                  <InteractiveJpText text={feedback.alternativeJp} onSelectKanji={onSelectKanji} />
                </span>
              </p>
            )}
          </div>

          {/* Specific Issues */}
          {feedback.issues.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wide text-raku-muted">
                Điểm cần chỉnh ({feedback.issues.length})
              </h5>
              <div className="space-y-2">
                {feedback.issues.map((issue, idx) => (
                  <div
                    key={`${issue.category}_${idx}`}
                    className="rounded-xl border border-raku-line bg-raku-subtle/30 p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-raku-signal-soft px-1.5 py-0.5 text-[10px] font-bold text-raku-signal">
                        {ISSUE_CATEGORY_LABELS[issue.category] || issue.category}
                      </span>
                      {issue.originalSegment && (
                        <span className="font-jp line-through text-raku-muted">
                          {issue.originalSegment}
                        </span>
                      )}
                      {issue.suggestion && (
                        <span className="font-jp font-bold text-raku-accent">
                          → {issue.suggestion}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-raku-body">{issue.explanationVi}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Phrases to Save to FSRS Deck */}
          {feedback.suggestedPhrases.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wide text-raku-muted">
                Cụm từ / Biểu đạt hay nên lưu vào Deck FSRS
              </h5>
              <div className="grid gap-2 sm:grid-cols-2">
                {feedback.suggestedPhrases.map((phrase, idx) => {
                  const alreadySaved = isPhraseAlreadySaved(phrase.surface);
                  return (
                    <div
                      key={`${phrase.surface}_${idx}`}
                      className="flex items-start justify-between gap-2 rounded-xl border border-raku-line bg-raku-subtle/30 p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="font-jp text-sm font-bold text-raku-ink">
                            <InteractiveJpText text={phrase.surface} onSelectKanji={onSelectKanji} />
                          </span>
                          <span className="font-jp text-[11px] text-raku-muted">
                            ({phrase.reading})
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-raku-body">{phrase.meaningVi}</p>
                      </div>
                      <button
                        type="button"
                        disabled={alreadySaved}
                        onClick={() => handleSavePhrase(phrase)}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                          alreadySaved
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'bg-raku-accent-soft text-raku-accent hover:bg-raku-accent hover:text-raku-on-accent'
                        }`}
                      >
                        {alreadySaved ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Đã có</span>
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="h-3.5 w-3.5" />
                            <span>Lưu Deck</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent History Drawer */}
      {showHistory && (
        <div className="raku-card space-y-3 p-4">
          <h4 className="text-sm font-bold text-raku-ink">Lịch sử đặt câu gần đây</h4>
          {history.length === 0 ? (
            <p className="text-xs text-raku-muted">Chưa có câu nào được chấm.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {history.slice(0, 25).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-raku-line bg-raku-subtle/30 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-raku-muted">
                      {item.jlpt} · {item.mode === 'quick_reply' ? 'Phản xạ nhanh' : POLITENESS_LABELS[item.politeness].label}
                    </span>
                    <span
                      className={`font-bold tabular-nums ${
                        item.feedback.overallScore >= QUICK_REPLY_PASS_SCORE
                          ? 'text-raku-accent'
                          : 'text-raku-signal'
                      }`}
                    >
                      {item.feedback.overallScore}/100
                    </span>
                  </div>
                  {item.sourceSentence && (
                    <p className="mt-1 font-jp text-[11px] text-raku-muted">
                      Hỏi: {item.sourceSentence}
                    </p>
                  )}
                  <p className="mt-0.5 font-jp text-sm text-raku-ink">Bạn viết: {item.userSentence}</p>
                  <p className="mt-0.5 font-jp text-xs text-raku-accent">
                    Tự nhiên hơn: {item.feedback.naturalJp}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
