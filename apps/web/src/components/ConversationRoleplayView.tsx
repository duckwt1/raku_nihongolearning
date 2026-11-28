import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Flag,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  X
} from 'lucide-react';
import {
  BUILTIN_CONVERSATION_SCENARIOS,
  CONVERSATION_CATEGORY_LABELS,
  POLITENESS_LABELS,
  isDuplicatePhraseInDeck,
  matchTargetWordsLive,
  pickTargetWordsForPractice,
  type ConversationHintItem,
  type ConversationMessage,
  type ConversationScenario,
  type ConversationSession,
  type Deck,
  type JlptLevel,
  type PolitenessLevel,
  type PracticeTargetWord,
  type SavedPhraseCandidate,
  type StudyCard
} from '@raku/core';
import type { User } from '../services/firebase';
import { JLPT_LEVELS } from '../services/grammarStore';
import {
  fetchConversationHint,
  fetchConversationSummary,
  sendConversationReply
} from '../services/conversationApi';
import {
  loadConversationSessions,
  persistConversationSession,
  removeConversationSession
} from '../services/practiceHistorySync';
import { speakJapanese, useJapaneseSpeechRecognition } from '../services/speech';
import { InteractiveJpText } from './InteractiveJpText';

export interface ConversationRoleplayViewProps {
  user: User | null;
  cards: StudyCard[];
  decks: Deck[];
  onSelectKanji?: (char: string) => void;
  onSavePhraseToDeck: (phrase: SavedPhraseCandidate, preferredDeckId?: string) => string | null;
  onRecordPracticeTime?: (seconds: number) => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

export function ConversationRoleplayView({
  user,
  cards,
  decks,
  onSelectKanji,
  onSavePhraseToDeck,
  onRecordPracticeTime,
  onNotify
}: ConversationRoleplayViewProps) {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [activeSession, setActiveSession] = useState<ConversationSession | null>(null);

  // Lobby filters
  const [jlptFilter, setJlptFilter] = useState<JlptLevel | 'all'>('all');
  const [targetDeckId, setTargetDeckId] = useState<string>('all');
  const [attachTargetWords, setAttachTargetWords] = useState(true);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  // Custom scenario form
  const [customTitle, setCustomTitle] = useState('');
  const [customAiRole, setCustomAiRole] = useState('');
  const [customUserRole, setCustomUserRole] = useState('Người học tiếng Nhật');
  const [customSetting, setCustomSetting] = useState('');
  const [customJlpt, setCustomJlpt] = useState<JlptLevel>('N3');
  const [customPoliteness, setCustomPoliteness] = useState<PolitenessLevel>('polite');
  const [customStarterJp, setCustomStarterJp] = useState('こんにちは！今日はどうされましたか？');

  // Active chat state
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHint, setIsLoadingHint] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [hints, setHints] = useState<ConversationHintItem[] | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [showReading, setShowReading] = useState(true);
  const [showTranslation, setShowTranslation] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.95);
  const [savedPhraseKeys, setSavedPhraseKeys] = useState<Set<string>>(new Set());

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const sessionStartRef = useRef<number>(Date.now());

  const speech = useJapaneseSpeechRecognition((transcript) => {
    setDraft((prev) => (prev ? `${prev}${transcript}` : transcript));
  });

  useEffect(() => {
    let active = true;
    void loadConversationSessions(user?.uid).then((loaded) => {
      if (active) setSessions(loaded);
    });
    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, isSending]);

  const filteredScenarios = useMemo(() => {
    if (jlptFilter === 'all') return BUILTIN_CONVERSATION_SCENARIOS;
    return BUILTIN_CONVERSATION_SCENARIOS.filter((s) => s.jlpt === jlptFilter);
  }, [jlptFilter]);

  const liveMatchedWords = useMemo(() => {
    if (!activeSession) return new Set<string>();
    return new Set(matchTargetWordsLive(draft, activeSession.targetWords));
  }, [draft, activeSession]);

  const startScenario = async (scenario: ConversationScenario) => {
    const now = new Date().toISOString();
    const targetWords: PracticeTargetWord[] = attachTargetWords
      ? pickTargetWordsForPractice(cards, {
          deckId: targetDeckId,
          jlpt: targetDeckId === 'all' ? scenario.jlpt : undefined,
          count: 4
        })
      : [];

    const initialMessage: ConversationMessage = {
      id: `msg_0_${Date.now()}`,
      role: 'assistant',
      textJp: scenario.starterJp,
      readingJp: scenario.starterReading,
      meaningVi: scenario.starterVi,
      createdAt: now
    };

    const newSession: ConversationSession = {
      id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      scenarioId: scenario.id,
      scenario,
      targetWords,
      messages: [initialMessage],
      completedMissionIds: [],
      usedTargetWords: [],
      status: 'active',
      startedAt: now,
      updatedAt: now
    };

    setActiveSession(newSession);
    setDraft('');
    setHints(null);
    setChatError(null);
    setSavedPhraseKeys(new Set());
    sessionStartRef.current = Date.now();

    const updated = await persistConversationSession(user?.uid, newSession, sessions);
    setSessions(updated);
  };

  const handleCreateCustomScenario = () => {
    if (!customTitle.trim() || !customAiRole.trim() || !customSetting.trim()) return;
    const scenario: ConversationScenario = {
      id: `scn_custom_${Date.now()}`,
      titleVi: customTitle.trim(),
      titleJp: customTitle.trim(),
      jlpt: customJlpt,
      category: 'custom',
      politeness: customPoliteness,
      aiRoleVi: customAiRole.trim(),
      aiRoleJp: customAiRole.trim(),
      userRoleVi: customUserRole.trim() || 'Người học tiếng Nhật',
      settingVi: customSetting.trim(),
      missions: [
        { id: 'm1', titleVi: 'Mở đầu và nêu rõ mục đích cuộc trò chuyện' },
        { id: 'm2', titleVi: 'Trao đổi chi tiết và đặt ít nhất 1 câu hỏi làm rõ' },
        { id: 'm3', titleVi: 'Chốt lại và kết thúc cuộc trò chuyện tự nhiên' }
      ],
      starterJp: customStarterJp.trim() || 'こんにちは！よろしくお願いします。',
      starterReading: '',
      starterVi: 'Xin chào! Rất mong được trao đổi với bạn.',
      isCustom: true
    };
    setIsCustomModalOpen(false);
    setCustomTitle('');
    setCustomAiRole('');
    setCustomSetting('');
    void startScenario(scenario);
  };

  const handleSend = async () => {
    if (!activeSession || !draft.trim() || isSending) return;
    const text = draft.trim();
    setDraft('');
    setHints(null);
    setChatError(null);
    setIsSending(true);

    const now = new Date().toISOString();
    const userMsg: ConversationMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      textJp: text,
      createdAt: now
    };

    const optimisticSession: ConversationSession = {
      ...activeSession,
      messages: [...activeSession.messages, userMsg],
      updatedAt: now
    };
    setActiveSession(optimisticSession);

    try {
      const reply = await sendConversationReply({
        scenario: activeSession.scenario,
        targetWords: activeSession.targetWords,
        completedMissionIds: activeSession.completedMissionIds,
        history: activeSession.messages.map((m) => ({ role: m.role, textJp: m.textJp })),
        userMessage: text
      });

      const replyTime = new Date().toISOString();
      const coachedUserMsg: ConversationMessage = {
        ...userMsg,
        coach: reply.coach,
        completedMissionIds: reply.completedMissionIds,
        usedTargetWords: reply.usedTargetWords
      };

      const aiMsg: ConversationMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        textJp: reply.replyJp,
        readingJp: reply.replyReading,
        meaningVi: reply.replyVi,
        createdAt: replyTime
      };

      const mergedUsedWords = Array.from(
        new Set([...activeSession.usedTargetWords, ...reply.usedTargetWords])
      );

      const nextSession: ConversationSession = {
        ...activeSession,
        messages: [...activeSession.messages, coachedUserMsg, aiMsg],
        completedMissionIds: reply.completedMissionIds,
        usedTargetWords: mergedUsedWords,
        updatedAt: replyTime
      };

      setActiveSession(nextSession);
      const updatedList = await persistConversationSession(user?.uid, nextSession, sessions);
      setSessions(updatedList);

      const elapsed = Math.min(180, Math.max(8, Math.round((Date.now() - sessionStartRef.current) / 1000)));
      onRecordPracticeTime?.(elapsed);
      sessionStartRef.current = Date.now();

      if (reply.shouldWrapUp) {
        onNotify?.('Bạn đã hoàn thành toàn bộ nhiệm vụ! Có thể bấm "Tổng kết" để xem điểm.', 'success');
      }
    } catch (err: unknown) {
      setChatError(err instanceof Error ? err.message : 'Không thể gửi tin nhắn.');
      setActiveSession(activeSession);
      setDraft(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleRequestHint = async () => {
    if (!activeSession || isLoadingHint) return;
    setIsLoadingHint(true);
    setChatError(null);
    try {
      const res = await fetchConversationHint({
        scenario: activeSession.scenario,
        targetWords: activeSession.targetWords,
        completedMissionIds: activeSession.completedMissionIds,
        history: activeSession.messages.map((m) => ({ role: m.role, textJp: m.textJp }))
      });
      setHints(res.suggestions);
    } catch (err: unknown) {
      setChatError(err instanceof Error ? err.message : 'Không thể tạo gợi ý.');
    } finally {
      setIsLoadingHint(false);
    }
  };

  const handleFinishAndSummarize = async () => {
    if (!activeSession || isSummarizing) return;
    const userTurnCount = activeSession.messages.filter((m) => m.role === 'user').length;
    if (userTurnCount < 1) {
      setChatError('Hãy gửi ít nhất 1 câu trả lời trước khi tổng kết phiên hội thoại.');
      return;
    }

    setIsSummarizing(true);
    setChatError(null);
    try {
      const summary = await fetchConversationSummary({
        scenario: activeSession.scenario,
        history: activeSession.messages.map((m) => ({ role: m.role, textJp: m.textJp }))
      });

      const finished: ConversationSession = {
        ...activeSession,
        status: 'completed',
        summary,
        updatedAt: new Date().toISOString()
      };
      setActiveSession(finished);
      const updated = await persistConversationSession(user?.uid, finished, sessions);
      setSessions(updated);
    } catch (err: unknown) {
      setChatError(err instanceof Error ? err.message : 'Không thể tổng kết phiên hội thoại.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    const updated = await removeConversationSession(user?.uid, sessionId, sessions);
    setSessions(updated);
    if (activeSession?.id === sessionId) {
      setActiveSession(null);
    }
  };

  const isPhraseSaved = (surface: string): boolean => {
    if (savedPhraseKeys.has(surface)) return true;
    const prefDeck = targetDeckId !== 'all' ? targetDeckId : 'deck_conversation_phrases';
    return isDuplicatePhraseInDeck(surface, prefDeck, cards);
  };

  // =====================================
  // ACTIVE CHAT / SUMMARY VIEW
  // =====================================
  if (activeSession) {
    const completedSet = new Set(activeSession.completedMissionIds);
    const usedWordSet = new Set(activeSession.usedTargetWords);
    const scenario = activeSession.scenario;

    return (
      <div className="space-y-4">
        {/* Top Bar */}
        <div className="raku-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setActiveSession(null);
                setHints(null);
                setChatError(null);
              }}
              className="rounded-lg border border-raku-line bg-raku-subtle p-2 text-raku-body hover:text-raku-ink"
              aria-label="Quay lại danh sách kịch bản"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-raku-ink">{scenario.titleVi}</h3>
                <span className="rounded bg-raku-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-raku-accent">
                  {scenario.jlpt}
                </span>
                <span className="rounded bg-raku-subtle px-1.5 py-0.5 text-[10px] font-semibold text-raku-muted">
                  {POLITENESS_LABELS[scenario.politeness].label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-raku-muted">
                AI: {scenario.aiRoleVi} · Bạn: {scenario.userRoleVi}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setShowReading((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold ${
                showReading
                  ? 'border-raku-accent bg-raku-accent-soft text-raku-accent'
                  : 'border-raku-line bg-raku-surface text-raku-muted'
              }`}
            >
              {showReading ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span>Furigana</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTranslation((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold ${
                showTranslation
                  ? 'border-raku-accent bg-raku-accent-soft text-raku-accent'
                  : 'border-raku-line bg-raku-surface text-raku-muted'
              }`}
            >
              <span>Dịch Việt</span>
            </button>

            <button
              type="button"
              onClick={() => setSpeechRate((r) => (r < 0.85 ? 0.95 : 0.75))}
              className="rounded-lg border border-raku-line bg-raku-subtle px-2.5 py-1.5 font-semibold text-raku-body"
            >
              {speechRate < 0.85 ? '0.75x' : '1.0x'}
            </button>

            {activeSession.status === 'active' && (
              <button
                type="button"
                disabled={isSummarizing}
                onClick={() => void handleFinishAndSummarize()}
                className="raku-btn-primary min-h-8 px-3 text-xs"
              >
                {isSummarizing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Flag className="h-3.5 w-3.5" />
                )}
                <span>Tổng kết</span>
              </button>
            )}
          </div>
        </div>

        {/* Missions + Target Words Strip */}
        <div className="raku-card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-raku-muted">
              Nhiệm vụ ({completedSet.size}/{scenario.missions.length})
            </span>
            <span className="text-[11px] text-raku-muted">{scenario.settingVi}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {scenario.missions.map((m) => {
              const done = completedSet.has(m.id);
              return (
                <div
                  key={m.id}
                  className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs ${
                    done
                      ? 'border-emerald-500/40 bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                      : 'border-raku-line bg-raku-subtle/40 text-raku-body'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-raku-muted" />
                  )}
                  <span>{m.titleVi}</span>
                </div>
              );
            })}
          </div>

          {activeSession.targetWords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-raku-muted">Từ mục tiêu:</span>
              {activeSession.targetWords.map((w) => {
                const used = usedWordSet.has(w.surface);
                const live = liveMatchedWords.has(w.surface);
                return (
                  <span
                    key={w.surface}
                    title={`${w.reading} — ${w.meaningVi}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      used
                        ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : live
                          ? 'border-raku-accent bg-raku-accent-soft font-semibold text-raku-accent'
                          : 'border-raku-line bg-raku-surface text-raku-body'
                    }`}
                  >
                    <span className="font-jp">{w.surface}</span>
                    <span className="text-[10px] opacity-80">({w.meaningVi})</span>
                    {used && <Check className="h-3 w-3" />}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary Report (if completed) */}
        {activeSession.summary && (
          <div className="raku-card space-y-4 border-raku-accent/40 p-5 animate-raku-enter">
            <div className="flex items-center justify-between gap-3 border-b border-raku-line pb-3">
              <div>
                <h4 className="text-base font-bold text-raku-ink">Tổng kết buổi hội thoại</h4>
                <p className="text-xs text-raku-muted">{activeSession.summary.nextStepVi}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-raku-accent-soft text-lg font-extrabold text-raku-accent tabular-nums">
                {activeSession.summary.overallScore}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 p-3.5 dark:bg-emerald-950/20">
                <h5 className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Điểm làm tốt</h5>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-raku-body">
                  {activeSession.summary.strengthsVi.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-50/40 p-3.5 dark:bg-amber-950/20">
                <h5 className="text-xs font-bold text-amber-700 dark:text-amber-300">Lưu ý cải thiện</h5>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-raku-body">
                  {activeSession.summary.mistakesToWatchVi.map((m, idx) => (
                    <li key={idx}>{m}</li>
                  ))}
                </ul>
              </div>
            </div>

            {activeSession.summary.usefulPhrases.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-bold uppercase tracking-wide text-raku-muted">
                  Cụm từ hay từ buổi hội thoại (+ Lưu vào Deck FSRS)
                </h5>
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeSession.summary.usefulPhrases.map((phrase, idx) => {
                    const saved = isPhraseSaved(phrase.surface);
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
                            <span className="font-jp text-[11px] text-raku-muted">({phrase.reading})</span>
                          </div>
                          <p className="mt-0.5 text-xs text-raku-body">{phrase.meaningVi}</p>
                          {phrase.exampleJp && (
                            <p className="mt-1 font-jp text-[11px] text-raku-muted">{phrase.exampleJp}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={saved}
                          onClick={() => {
                            const id = onSavePhraseToDeck(
                              phrase,
                              targetDeckId !== 'all' ? targetDeckId : undefined
                            );
                            if (id) setSavedPhraseKeys((prev) => new Set(prev).add(phrase.surface));
                          }}
                          className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                            saved
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                              : 'bg-raku-accent-soft text-raku-accent hover:bg-raku-accent hover:text-raku-on-accent'
                          }`}
                        >
                          {saved ? (
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

        {/* Chat Messages */}
        <div className="raku-card flex flex-col overflow-hidden">
          <div className="max-h-[460px] space-y-4 overflow-y-auto p-4 sm:p-5">
            {activeSession.messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      isUser
                        ? 'bg-raku-accent text-raku-on-accent'
                        : 'border border-raku-line bg-raku-subtle/60 text-raku-ink'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-jp text-sm leading-relaxed sm:text-base">
                        <InteractiveJpText
                          text={msg.textJp}
                          onSelectKanji={isUser ? undefined : onSelectKanji}
                        />
                      </p>
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => speakJapanese(msg.textJp, { rate: speechRate })}
                          className="shrink-0 rounded-md p-1 text-raku-muted hover:bg-raku-surface hover:text-raku-accent"
                          aria-label="Nghe câu thoại"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {!isUser && showReading && msg.readingJp && (
                      <p className="mt-1 font-jp text-xs text-raku-muted">{msg.readingJp}</p>
                    )}
                    {!isUser && showTranslation && msg.meaningVi && (
                      <p className="mt-1 border-t border-raku-line/60 pt-1 text-xs text-raku-body">
                        {msg.meaningVi}
                      </p>
                    )}
                  </div>

                  {/* Inline Coach Card under User message */}
                  {isUser && msg.coach && (
                    <div
                      className={`mt-1.5 max-w-[85%] rounded-xl border px-3 py-2 text-xs ${
                        msg.coach.status === 'great'
                          ? 'border-emerald-500/30 bg-emerald-50/70 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                          : msg.coach.status === 'minor'
                            ? 'border-amber-500/30 bg-amber-50/70 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                            : 'border-raku-signal/40 bg-raku-signal-soft text-raku-signal'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{msg.coach.noteVi}</p>
                        {msg.coach.naturalJp && (
                          <button
                            type="button"
                            onClick={() => speakJapanese(msg.coach!.naturalJp!, { rate: speechRate })}
                            className="shrink-0 rounded p-0.5 opacity-80 hover:opacity-100"
                            aria-label="Nghe câu tự nhiên hơn"
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {msg.coach.naturalJp && (
                        <p className="mt-1 font-jp font-semibold">
                          Tự nhiên hơn:{' '}
                          <InteractiveJpText
                            text={msg.coach.naturalJp}
                            onSelectKanji={onSelectKanji}
                          />
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {isSending && (
              <div className="flex items-center gap-2 text-xs text-raku-muted">
                <Loader2 className="h-4 w-4 animate-spin text-raku-accent" />
                <span>{scenario.aiRoleVi} đang phản hồi...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Hints Drawer */}
          {hints && hints.length > 0 && (
            <div className="border-t border-raku-line bg-raku-accent-soft/30 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-raku-accent">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Gợi ý câu trả lời (bấm để điền vào ô nhập)
                </span>
                <button
                  type="button"
                  onClick={() => setHints(null)}
                  className="rounded p-1 text-raku-muted hover:text-raku-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {hints.map((h, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setDraft(h.jp);
                      setHints(null);
                    }}
                    className="rounded-xl border border-raku-line bg-raku-surface p-2.5 text-left transition-colors hover:border-raku-accent"
                  >
                    <p className="font-jp text-xs font-bold text-raku-ink">{h.jp}</p>
                    {h.reading && <p className="mt-0.5 font-jp text-[10px] text-raku-muted">{h.reading}</p>}
                    <p className="mt-1 text-[11px] text-raku-body">{h.meaningVi}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error banner */}
          {chatError && (
            <div className="flex items-center gap-2 border-t border-raku-signal/30 bg-raku-signal-soft px-4 py-2 text-xs text-raku-signal">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{chatError}</span>
            </div>
          )}

          {/* Composer */}
          {activeSession.status === 'active' && (
            <div className="border-t border-raku-line bg-raku-surface p-3">
              {speech.isListening && (
                <p className="mb-1.5 text-xs text-raku-signal">
                  Đang nghe tiếng Nhật... {speech.interimText && `「${speech.interimText}」`}
                </p>
              )}
              {speech.error && <p className="mb-1.5 text-xs text-raku-signal">{speech.error}</p>}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  disabled={isLoadingHint || isSending}
                  onClick={() => void handleRequestHint()}
                  title="Gợi ý câu trả lời"
                  className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-raku-line bg-raku-subtle px-3 text-xs font-semibold text-raku-body hover:text-raku-accent disabled:opacity-50"
                >
                  {isLoadingHint ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lightbulb className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Gợi ý</span>
                </button>

                {speech.isSupported && (
                  <button
                    type="button"
                    onClick={speech.toggle}
                    aria-label="Nhập giọng nói"
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                      speech.isListening
                        ? 'border-raku-signal bg-raku-signal text-white animate-pulse'
                        : 'border-raku-line bg-raku-subtle text-raku-body hover:text-raku-accent'
                    }`}
                  >
                    {speech.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}

                <textarea
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Nhập câu trả lời tiếng Nhật..."
                  className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-raku-line-strong bg-raku-surface px-3.5 py-2 font-jp text-sm text-raku-ink placeholder:font-sans placeholder:text-raku-muted focus:border-raku-accent focus:outline-none"
                />

                <button
                  type="button"
                  disabled={!draft.trim() || isSending}
                  onClick={() => void handleSend()}
                  className="raku-btn-primary h-10 min-h-10 px-4 text-xs disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =====================================
  // SCENARIO LOBBY VIEW
  // =====================================
  return (
    <div className="space-y-5">
      {/* Lobby Controls */}
      <div className="raku-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex rounded-lg border border-raku-line bg-raku-subtle p-0.5">
            {(['all', ...JLPT_LEVELS] as const).map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setJlptFilter(lv)}
                className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  jlptFilter === lv
                    ? 'bg-raku-surface text-raku-accent shadow-xs'
                    : 'text-raku-muted hover:text-raku-ink'
                }`}
              >
                {lv === 'all' ? 'Tất cả' : lv}
              </button>
            ))}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-raku-line bg-raku-surface px-2.5 py-1.5 font-medium text-raku-body">
            <input
              type="checkbox"
              checked={attachTargetWords}
              onChange={(e) => setAttachTargetWords(e.target.checked)}
              className="rounded accent-raku-accent"
            />
            <span>Gắn 4 từ mục tiêu từ Deck</span>
          </label>

          {attachTargetWords && (
            <select
              value={targetDeckId}
              onChange={(e) => setTargetDeckId(e.target.value)}
              className="max-w-[180px] rounded-lg border border-raku-line-strong bg-raku-surface px-2.5 py-1.5 font-medium text-raku-ink"
            >
              <option value="all">Ưu tiên từ yếu / đã học</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsCustomModalOpen(true)}
          className="raku-btn-primary min-h-9 px-3.5 text-xs"
        >
          <Plus className="h-4 w-4" />
          <span>Tự tạo kịch bản</span>
        </button>
      </div>

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-raku-muted">
            Phiên hội thoại gần đây
          </h4>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.slice(0, 6).map((s) => (
              <div
                key={s.id}
                className="raku-card flex items-start justify-between gap-2 p-3.5 transition-colors hover:border-raku-accent/50"
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveSession(s);
                    sessionStartRef.current = Date.now();
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-raku-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-raku-accent">
                      {s.scenario.jlpt}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        s.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-raku-subtle text-raku-muted'
                      }`}
                    >
                      {s.status === 'completed'
                        ? `Xong · ${s.summary?.overallScore ?? '—'}đ`
                        : 'Đang dở'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-bold text-raku-ink">{s.scenario.titleVi}</p>
                  <p className="mt-0.5 text-[11px] text-raku-muted">
                    {s.messages.length} tin nhắn · {s.completedMissionIds.length}/{s.scenario.missions.length} nhiệm vụ
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteSession(s.id)}
                  className="rounded-lg p-1.5 text-raku-muted hover:bg-raku-signal-soft hover:text-raku-signal"
                  aria-label="Xoá phiên"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Built-in Scenario Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredScenarios.map((scn) => (
          <div
            key={scn.id}
            className="raku-card flex flex-col justify-between p-4 transition-colors hover:border-raku-accent/60"
          >
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-raku-accent-soft px-2 py-0.5 text-[11px] font-bold text-raku-accent">
                  {scn.jlpt}
                </span>
                <span className="rounded-md bg-raku-subtle px-2 py-0.5 text-[11px] font-medium text-raku-body">
                  {CONVERSATION_CATEGORY_LABELS[scn.category]}
                </span>
                <span className="rounded-md border border-raku-line px-1.5 py-0.5 text-[10px] font-semibold text-raku-muted">
                  {POLITENESS_LABELS[scn.politeness].label}
                </span>
              </div>
              <h4 className="mt-2.5 text-sm font-bold text-raku-ink">{scn.titleVi}</h4>
              <p className="font-jp text-xs text-raku-muted">{scn.titleJp}</p>
              <p className="mt-2 line-clamp-2 text-xs text-raku-body">{scn.settingVi}</p>
              <ul className="mt-2.5 space-y-1 text-[11px] text-raku-muted">
                {scn.missions.map((m) => (
                  <li key={m.id} className="truncate">
                    • {m.titleVi}
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => void startScenario(scn)}
              className="raku-btn-primary mt-4 min-h-9 w-full text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Bắt đầu nhập vai</span>
            </button>
          </div>
        ))}
      </div>

      {/* Custom Scenario Modal */}
      {isCustomModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsCustomModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-raku-ink/45 p-4 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="raku-card w-full max-w-lg space-y-4 p-5 animate-raku-enter"
          >
            <div className="flex items-center justify-between border-b border-raku-line pb-3">
              <div className="flex items-center gap-2 text-raku-accent">
                <MessageSquarePlus className="h-5 w-5" />
                <h3 className="text-base font-bold text-raku-ink">Tạo kịch bản hội thoại tùy chỉnh</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="rounded-lg p-1 text-raku-muted hover:text-raku-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-raku-body">Tên tình huống *</label>
                <input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Ví dụ: Xin nghỉ phép về Việt Nam thăm gia đình"
                  className="mt-1 w-full rounded-xl border border-raku-line-strong bg-raku-surface px-3 py-2 text-sm text-raku-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-raku-body">Vai của AI *</label>
                  <input
                    value={customAiRole}
                    onChange={(e) => setCustomAiRole(e.target.value)}
                    placeholder="VD: Quản lý trực tiếp"
                    className="mt-1 w-full rounded-xl border border-raku-line-strong bg-raku-surface px-3 py-2 text-sm text-raku-ink"
                  />
                </div>
                <div>
                  <label className="font-semibold text-raku-body">Vai của bạn</label>
                  <input
                    value={customUserRole}
                    onChange={(e) => setCustomUserRole(e.target.value)}
                    placeholder="VD: Nhân viên"
                    className="mt-1 w-full rounded-xl border border-raku-line-strong bg-raku-surface px-3 py-2 text-sm text-raku-ink"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-raku-body">Trình độ JLPT</label>
                  <select
                    value={customJlpt}
                    onChange={(e) => setCustomJlpt(e.target.value as JlptLevel)}
                    className="mt-1 w-full rounded-xl border border-raku-line-strong bg-raku-surface px-3 py-2 text-sm text-raku-ink"
                  >
                    {JLPT_LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {lv}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-raku-body">Mức độ lịch sự</label>
                  <select
                    value={customPoliteness}
                    onChange={(e) => setCustomPoliteness(e.target.value as PolitenessLevel)}
                    className="mt-1 w-full rounded-xl border border-raku-line-strong bg-raku-surface px-3 py-2 text-sm text-raku-ink"
                  >
                    {(['casual', 'polite', 'keigo'] as PolitenessLevel[]).map((k) => (
                      <option key={k} value={k}>
                        {POLITENESS_LABELS[k].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-raku-body">Mô tả bối cảnh *</label>
                <textarea
                  rows={2}
                  value={customSetting}
                  onChange={(e) => setCustomSetting(e.target.value)}
                  placeholder="Mô tả ngắn mục tiêu buổi nói chuyện để AI nhập vai chính xác..."
                  className="mt-1 w-full rounded-xl border border-raku-line-strong bg-raku-surface px-3 py-2 text-sm text-raku-ink"
                />
              </div>

              <div>
                <label className="font-semibold text-raku-body">Câu mở đầu của AI (tiếng Nhật)</label>
                <input
                  value={customStarterJp}
                  onChange={(e) => setCustomStarterJp(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-raku-line-strong bg-raku-surface px-3 py-2 font-jp text-sm text-raku-ink"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="raku-btn-secondary min-h-9 px-4 text-xs"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={!customTitle.trim() || !customAiRole.trim() || !customSetting.trim()}
                onClick={handleCreateCustomScenario}
                className="raku-btn-primary min-h-9 px-4 text-xs disabled:opacity-50"
              >
                Bắt đầu ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
