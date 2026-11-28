import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {
  ArrowLeft,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Flag,
  Lightbulb,
  Mic,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  X
} from 'lucide-react-native';
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
  type JlptLevel,
  type PolitenessLevel,
  type SavedPhraseCandidate
} from '@raku/core';
import { JLPT_LEVELS, mergeConversationSessions } from '@raku/sync';
import { useStudy } from '@/providers/StudyProvider';
import { useRakuTheme } from '@/providers/ThemeProvider';
import {
  fetchConversationHint,
  fetchConversationSummary,
  sendConversationReply
} from '@/services/apiClient';
import { isFirebaseConfigured, mobileSyncClient } from '@/services/firebase';
import { hapticSelect, hapticSuccess, hapticTap, hapticWarning } from '@/services/haptics';
import { speakJapanese } from '@/services/speech';
import { getMobileSpeechRecognitionInfo } from '@/services/speechRecognition';
import { mobileRepository } from '@/services/storage';
import { InteractiveJpTextNative } from './InteractiveJpTextNative';

interface ConversationLobbyNativeProps {
  sessions: ConversationSession[];
  onOpenSession: (session: ConversationSession) => void;
  onStartScenario: (scenario: ConversationScenario, attachWords: boolean) => void;
  onDeleteSession: (sessionId: string) => void;
}

export function ConversationLobbyNative({
  sessions,
  onOpenSession,
  onStartScenario,
  onDeleteSession
}: ConversationLobbyNativeProps) {
  const { colors, typography } = useRakuTheme();
  const [jlptFilter, setJlptFilter] = useState<JlptLevel | 'all'>('all');
  const [attachWords, setAttachWords] = useState(true);
  const [customOpen, setCustomOpen] = useState(false);

  const [customTitle, setCustomTitle] = useState('');
  const [customAiRole, setCustomAiRole] = useState('');
  const [customSetting, setCustomSetting] = useState('');
  const [customJlpt, setCustomJlpt] = useState<JlptLevel>('N3');
  const [customPoliteness, setCustomPoliteness] = useState<PolitenessLevel>('polite');

  const filtered = useMemo(() => {
    if (jlptFilter === 'all') return BUILTIN_CONVERSATION_SCENARIOS;
    return BUILTIN_CONVERSATION_SCENARIOS.filter((s) => s.jlpt === jlptFilter);
  }, [jlptFilter]);

  const handleCreateCustom = () => {
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
      userRoleVi: 'Người học tiếng Nhật',
      settingVi: customSetting.trim(),
      missions: [
        { id: 'm1', titleVi: 'Mở đầu và nêu rõ mục đích cuộc trò chuyện' },
        { id: 'm2', titleVi: 'Trao đổi chi tiết và đặt câu hỏi làm rõ' },
        { id: 'm3', titleVi: 'Kết thúc cuộc trò chuyện tự nhiên' }
      ],
      starterJp: 'こんにちは！今日はどうされましたか？',
      starterReading: 'こんにちは！きょうはどうされましたか？',
      starterVi: 'Xin chào! Hôm nay có việc gì thế ạ?',
      isCustom: true
    };
    setCustomOpen(false);
    setCustomTitle('');
    setCustomAiRole('');
    setCustomSetting('');
    onStartScenario(scenario, attachWords);
  };

  return (
    <View style={styles.lobbyRoot}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {(['all', ...JLPT_LEVELS] as const).map((lv) => {
          const active = jlptFilter === lv;
          return (
            <Pressable
              key={lv}
              onPress={() => {
                hapticSelect();
                setJlptFilter(lv);
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
                style={{
                  fontSize: 12,
                  color: active ? colors.accent : colors.muted,
                  fontFamily: typography.fontFamily.viNative.semibold
                }}
              >
                {lv === 'all' ? 'Tất cả' : lv}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.lobbyActionRow}>
        <Pressable
          onPress={() => {
            hapticSelect();
            setAttachWords((v) => !v);
          }}
          style={[
            styles.toggleChip,
            {
              backgroundColor: attachWords ? colors.accentSoft : colors.surface,
              borderColor: attachWords ? colors.accent : colors.line
            }
          ]}
        >
          {attachWords && <Check size={13} color={colors.accent} />}
          <Text
            style={{
              fontSize: 12,
              color: attachWords ? colors.accent : colors.body,
              fontFamily: typography.fontFamily.viNative.medium
            }}
          >
            Gắn 4 từ mục tiêu từ Deck
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            hapticTap();
            setCustomOpen(true);
          }}
          style={[styles.primaryMiniBtn, { backgroundColor: colors.accent }]}
        >
          <Plus size={14} color={colors.onAccent} />
          <Text
            style={{
              fontSize: 12,
              color: colors.onAccent,
              fontFamily: typography.fontFamily.viNative.semibold
            }}
          >
            Tự tạo
          </Text>
        </Pressable>
      </View>

      {sessions.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.muted,
              letterSpacing: 0.4
            }}
          >
            PHIÊN GẦN ĐÂY ({sessions.length})
          </Text>
          {sessions.slice(0, 4).map((s) => (
            <View
              key={s.id}
              style={[styles.recentRow, { backgroundColor: colors.surface, borderColor: colors.line }]}
            >
              <Pressable style={styles.flex} onPress={() => onOpenSession(s)}>
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.ink,
                    fontFamily: typography.fontFamily.viNative.bold
                  }}
                  numberOfLines={1}
                >
                  {s.scenario.jlpt} · {s.scenario.titleVi}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  {s.status === 'completed'
                    ? `Hoàn thành · ${s.summary?.overallScore ?? '—'}đ`
                    : `Đang dở · ${s.completedMissionIds.length}/${s.scenario.missions.length} nhiệm vụ`}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  hapticTap();
                  onDeleteSession(s.id);
                }}
                hitSlop={10}
              >
                <Trash2 size={16} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={{ gap: 10 }}>
        {filtered.map((scn) => (
          <View
            key={scn.id}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
          >
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>
                  {scn.jlpt}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.subtle }]}>
                <Text style={{ fontSize: 11, color: colors.body }}>
                  {CONVERSATION_CATEGORY_LABELS[scn.category]}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.subtle }]}>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  {POLITENESS_LABELS[scn.politeness].label}
                </Text>
              </View>
            </View>

            <Text
              style={{
                fontSize: 15,
                color: colors.ink,
                fontFamily: typography.fontFamily.viNative.bold
              }}
            >
              {scn.titleVi}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>{scn.settingVi}</Text>

            <Pressable
              onPress={() => {
                hapticTap();
                onStartScenario(scn, attachWords);
              }}
              style={({ pressed }) => [
                styles.startBtn,
                { backgroundColor: pressed ? colors.accentHover : colors.accent }
              ]}
            >
              <Sparkles size={14} color={colors.onAccent} />
              <Text
                style={{
                  fontSize: 13,
                  color: colors.onAccent,
                  fontFamily: typography.fontFamily.viNative.semibold
                }}
              >
                Bắt đầu nhập vai
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      {/* Custom Scenario Modal */}
      <Modal visible={customOpen} animationType="slide" transparent onRequestClose={() => setCustomOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.rowBetween}>
              <Text
                style={{
                  fontSize: 16,
                  color: colors.ink,
                  fontFamily: typography.fontFamily.viNative.bold
                }}
              >
                Tạo kịch bản tùy chỉnh
              </Text>
              <Pressable onPress={() => setCustomOpen(false)}>
                <X size={20} color={colors.muted} />
              </Pressable>
            </View>

            <TextInput
              value={customTitle}
              onChangeText={setCustomTitle}
              placeholder="Tên tình huống (VD: Xin nghỉ phép)"
              placeholderTextColor={colors.muted}
              style={[styles.modalInput, { borderColor: colors.lineStrong, color: colors.ink, backgroundColor: colors.canvas }]}
            />
            <TextInput
              value={customAiRole}
              onChangeText={setCustomAiRole}
              placeholder="Vai của AI (VD: Quản lý trực tiếp)"
              placeholderTextColor={colors.muted}
              style={[styles.modalInput, { borderColor: colors.lineStrong, color: colors.ink, backgroundColor: colors.canvas }]}
            />
            <TextInput
              value={customSetting}
              onChangeText={setCustomSetting}
              multiline
              placeholder="Mô tả bối cảnh & mục tiêu cuộc nói chuyện..."
              placeholderTextColor={colors.muted}
              style={[
                styles.modalInput,
                { minHeight: 72, borderColor: colors.lineStrong, color: colors.ink, backgroundColor: colors.canvas }
              ]}
            />

            <View style={styles.levelRow}>
              {JLPT_LEVELS.map((lv) => (
                <Pressable
                  key={lv}
                  onPress={() => setCustomJlpt(lv)}
                  style={[
                    styles.levelChip,
                    {
                      backgroundColor: customJlpt === lv ? colors.accentSoft : colors.subtle,
                      borderColor: customJlpt === lv ? colors.accent : colors.line
                    }
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: customJlpt === lv ? colors.accent : colors.muted }}>
                    {lv}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.levelRow}>
              {(['casual', 'polite', 'keigo'] as PolitenessLevel[]).map((pol) => (
                <Pressable
                  key={pol}
                  onPress={() => setCustomPoliteness(pol)}
                  style={[
                    styles.levelChip,
                    {
                      backgroundColor: customPoliteness === pol ? colors.accentSoft : colors.subtle,
                      borderColor: customPoliteness === pol ? colors.accent : colors.line
                    }
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: customPoliteness === pol ? colors.accent : colors.muted }}>
                    {POLITENESS_LABELS[pol].label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              disabled={!customTitle.trim() || !customAiRole.trim() || !customSetting.trim()}
              onPress={handleCreateCustom}
              style={[
                styles.startBtn,
                {
                  backgroundColor:
                    !customTitle.trim() || !customAiRole.trim() || !customSetting.trim()
                      ? colors.lineStrong
                      : colors.accent
                }
              ]}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onAccent }}>
                Bắt đầu ngay
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface ConversationChatShellNativeProps {
  session: ConversationSession;
  onUpdateSession: (session: ConversationSession) => void;
  onExit: () => void;
  onSelectKanji: (char: string) => void;
}

/**
 * Full-height chat shell designed to mount directly inside SafeAreaView
 * (outside parent ScrollView) so FlatList + KeyboardAvoidingView behave smoothly.
 */
export function ConversationChatShellNative({
  session,
  onUpdateSession,
  onExit,
  onSelectKanji
}: ConversationChatShellNativeProps) {
  const { colors, typography } = useRakuTheme();
  const { cards, addPhraseToDeck, recordStudySeconds } = useStudy();

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHint, setLoadingHint] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [hints, setHints] = useState<ConversationHintItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReading, setShowReading] = useState(true);
  const [showVi, setShowVi] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.92);
  const [showMissions, setShowMissions] = useState(true);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  const listRef = useRef<FlatList<ConversationMessage> | null>(null);
  const inputRef = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const turnStartedAtRef = useRef<number>(Date.now());
  const sttInfo = useMemo(() => getMobileSpeechRecognitionInfo(), []);

  useEffect(() => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 80);
  }, [session.messages.length]);

  const completedSet = useMemo(() => new Set(session.completedMissionIds), [session.completedMissionIds]);
  const usedWordSet = useMemo(() => new Set(session.usedTargetWords), [session.usedTargetWords]);
  const liveMatched = useMemo(
    () => new Set(matchTargetWordsLive(draft, session.targetWords)),
    [draft, session.targetWords]
  );

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    hapticTap();
    setDraft('');
    setHints(null);
    setError(null);
    setSending(true);

    const now = new Date().toISOString();
    const userMsg: ConversationMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      textJp: text,
      createdAt: now
    };
    onUpdateSession({ ...session, messages: [...session.messages, userMsg], updatedAt: now });

    try {
      const reply = await sendConversationReply({
        scenario: session.scenario,
        targetWords: session.targetWords,
        completedMissionIds: session.completedMissionIds,
        history: session.messages.map((m) => ({ role: m.role, textJp: m.textJp })),
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

      const nextSession: ConversationSession = {
        ...session,
        messages: [...session.messages, coachedUserMsg, aiMsg],
        completedMissionIds: reply.completedMissionIds,
        usedTargetWords: Array.from(new Set([...session.usedTargetWords, ...reply.usedTargetWords])),
        updatedAt: replyTime
      };
      onUpdateSession(nextSession);
      hapticSuccess();

      const elapsed = Math.min(180, Math.max(8, Math.round((Date.now() - turnStartedAtRef.current) / 1000)));
      recordStudySeconds(elapsed);
      turnStartedAtRef.current = Date.now();
    } catch (err: unknown) {
      hapticWarning();
      setError(err instanceof Error ? err.message : 'Không thể gửi tin nhắn.');
      onUpdateSession(session);
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const handleHint = async () => {
    if (loadingHint || sending) return;
    hapticTap();
    setLoadingHint(true);
    setError(null);
    try {
      const res = await fetchConversationHint({
        scenario: session.scenario,
        targetWords: session.targetWords,
        completedMissionIds: session.completedMissionIds,
        history: session.messages.map((m) => ({ role: m.role, textJp: m.textJp }))
      });
      setHints(res.suggestions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể lấy gợi ý.');
    } finally {
      setLoadingHint(false);
    }
  };

  const handleFinish = async () => {
    if (summarizing) return;
    if (session.messages.filter((m) => m.role === 'user').length < 1) {
      setError('Hãy gửi ít nhất 1 câu trả lời trước khi tổng kết.');
      return;
    }
    hapticTap();
    setSummarizing(true);
    setError(null);
    try {
      const summary = await fetchConversationSummary({
        scenario: session.scenario,
        history: session.messages.map((m) => ({ role: m.role, textJp: m.textJp }))
      });
      onUpdateSession({
        ...session,
        status: 'completed',
        summary,
        updatedAt: new Date().toISOString()
      });
      hapticSuccess();
    } catch (err: unknown) {
      hapticWarning();
      setError(err instanceof Error ? err.message : 'Không thể tổng kết hội thoại.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleSavePhrase = (phrase: SavedPhraseCandidate) => {
    const id = addPhraseToDeck(phrase);
    if (id) {
      hapticSuccess();
      setSavedKeys((prev) => new Set(prev).add(phrase.surface));
    }
  };

  const isPhraseSaved = (surface: string): boolean => {
    return savedKeys.has(surface) || isDuplicatePhraseInDeck(surface, 'deck_conversation_phrases', cards);
  };

  return (
    <KeyboardAvoidingView
      style={styles.chatShell}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={[styles.chatHeader, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Pressable onPress={onExit} hitSlop={8}>
          <ArrowLeft size={20} color={colors.ink} />
        </Pressable>
        <View style={styles.flex}>
          <Text
            style={{
              fontSize: 14,
              color: colors.ink,
              fontFamily: typography.fontFamily.viNative.bold
            }}
            numberOfLines={1}
          >
            {session.scenario.titleVi}
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>
            {session.scenario.jlpt} · {POLITENESS_LABELS[session.scenario.politeness].label} ·{' '}
            {completedSet.size}/{session.scenario.missions.length} nhiệm vụ
          </Text>
        </View>

        {session.status === 'active' && (
          <Pressable
            disabled={summarizing}
            onPress={() => void handleFinish()}
            style={[styles.finishBtn, { backgroundColor: colors.accent }]}
          >
            {summarizing ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <>
                <Flag size={13} color={colors.onAccent} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.onAccent }}>
                  Tổng kết
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {/* Toolbar */}
      <View style={[styles.toolbarRow, { borderColor: colors.line }]}>
        <Pressable
          onPress={() => setShowMissions((v) => !v)}
          style={[styles.toolChip, { borderColor: colors.line, backgroundColor: colors.surface }]}
        >
          <Text style={{ fontSize: 11, color: colors.body }}>
            {showMissions ? 'Ẩn nhiệm vụ' : 'Xem nhiệm vụ'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setShowReading((v) => !v)}
          style={[
            styles.toolChip,
            {
              borderColor: showReading ? colors.accent : colors.line,
              backgroundColor: showReading ? colors.accentSoft : colors.surface
            }
          ]}
        >
          {showReading ? <Eye size={12} color={colors.accent} /> : <EyeOff size={12} color={colors.muted} />}
          <Text style={{ fontSize: 11, color: showReading ? colors.accent : colors.muted }}>
            Furigana
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setShowVi((v) => !v)}
          style={[
            styles.toolChip,
            {
              borderColor: showVi ? colors.accent : colors.line,
              backgroundColor: showVi ? colors.accentSoft : colors.surface
            }
          ]}
        >
          <Text style={{ fontSize: 11, color: showVi ? colors.accent : colors.muted }}>Dịch Việt</Text>
        </Pressable>
        <Pressable
          onPress={() => setSpeechRate((r) => (r < 0.85 ? 0.92 : 0.75))}
          style={[styles.toolChip, { borderColor: colors.line, backgroundColor: colors.surface }]}
        >
          <Text style={{ fontSize: 11, color: colors.body }}>{speechRate < 0.85 ? '0.75x' : '1.0x'}</Text>
        </Pressable>
      </View>

      {/* Collapsible Missions & Target Words */}
      {showMissions && (
        <View style={[styles.missionBox, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {session.scenario.missions.map((m) => {
            const done = completedSet.has(m.id);
            return (
              <View key={m.id} style={styles.missionRow}>
                {done ? (
                  <CheckCircle2 size={14} color={colors.good} />
                ) : (
                  <Circle size={14} color={colors.muted} />
                )}
                <Text
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: done ? colors.good : colors.body
                  }}
                >
                  {m.titleVi}
                </Text>
              </View>
            );
          })}
          {session.targetWords.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {session.targetWords.map((w) => {
                const used = usedWordSet.has(w.surface);
                const live = liveMatched.has(w.surface);
                return (
                  <View
                    key={w.surface}
                    style={[
                      styles.targetWordChip,
                      {
                        borderColor: used ? colors.good : live ? colors.accent : colors.line,
                        backgroundColor: used ? colors.goodSoft : live ? colors.accentSoft : colors.subtle
                      }
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: used ? colors.good : live ? colors.accent : colors.ink
                      }}
                    >
                      {w.surface} ({w.meaningVi})
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* Messages FlatList */}
      <FlatList
        ref={listRef}
        data={session.messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          session.summary ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.accent, marginTop: 12 }]}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
                    Tổng kết buổi hội thoại
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{session.summary.nextStepVi}</Text>
                </View>
                <View style={[styles.scoreBadge, { backgroundColor: colors.accentSoft }]}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: colors.accent }}>
                    {session.summary.overallScore}
                  </Text>
                </View>
              </View>

              {session.summary.strengthsVi.map((s, idx) => (
                <Text key={`s_${idx}`} style={{ fontSize: 12, color: colors.good }}>
                  ✓ {s}
                </Text>
              ))}
              {session.summary.mistakesToWatchVi.map((m, idx) => (
                <Text key={`m_${idx}`} style={{ fontSize: 12, color: colors.hard }}>
                  • {m}
                </Text>
              ))}

              {session.summary.usefulPhrases.map((phrase, idx) => {
                const saved = isPhraseSaved(phrase.surface);
                return (
                  <View
                    key={`${phrase.surface}_${idx}`}
                    style={[styles.phraseRow, { backgroundColor: colors.subtle, borderColor: colors.line }]}
                  >
                    <View style={styles.flex}>
                      <InteractiveJpTextNative
                        text={`${phrase.surface} (${phrase.reading})`}
                        onSelectKanji={onSelectKanji}
                        style={{
                          fontSize: 13,
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
                        <Check size={13} color={colors.good} />
                      ) : (
                        <BookmarkPlus size={13} color={colors.accent} />
                      )}
                      <Text style={{ fontSize: 11, fontWeight: '700', color: saved ? colors.good : colors.accent }}>
                        {saved ? 'Đã có' : 'Lưu'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : sending ? (
            <View style={styles.typingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {session.scenario.aiRoleVi} đang trả lời...
              </Text>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => {
          const isUser = item.role === 'user';
          return (
            <View style={[styles.msgWrap, isUser ? styles.msgRight : styles.msgLeft]}>
              <View
                style={[
                  styles.bubble,
                  isUser
                    ? { backgroundColor: colors.accent }
                    : { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 }
                ]}
              >
                <View style={styles.rowBetween}>
                  <InteractiveJpTextNative
                    text={item.textJp}
                    onSelectKanji={isUser ? undefined : onSelectKanji}
                    style={{
                      flex: 1,
                      fontSize: 15,
                      lineHeight: 22,
                      color: isUser ? colors.onAccent : colors.ink,
                      fontFamily: typography.fontFamily.jpNative.regular
                    }}
                  />
                  {!isUser && (
                    <Pressable
                      onPress={() => {
                        hapticTap();
                        speakJapanese(item.textJp, { rate: speechRate });
                      }}
                      hitSlop={8}
                    >
                      <Volume2 size={16} color={colors.muted} />
                    </Pressable>
                  )}
                </View>

                {!isUser && showReading && item.readingJp ? (
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                    {item.readingJp}
                  </Text>
                ) : null}
                {!isUser && showVi && item.meaningVi ? (
                  <Text style={{ fontSize: 12, color: colors.body, marginTop: 4 }}>
                    {item.meaningVi}
                  </Text>
                ) : null}
              </View>

              {isUser && item.coach && (
                <View
                  style={[
                    styles.coachBox,
                    {
                      backgroundColor:
                        item.coach.status === 'great'
                          ? colors.goodSoft
                          : item.coach.status === 'minor'
                            ? colors.hardSoft
                            : colors.againSoft,
                      borderColor:
                        item.coach.status === 'great'
                          ? colors.good
                          : item.coach.status === 'minor'
                            ? colors.hard
                            : colors.again
                    }
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color:
                        item.coach.status === 'great'
                          ? colors.good
                          : item.coach.status === 'minor'
                            ? colors.hard
                            : colors.again
                    }}
                  >
                    {item.coach.noteVi}
                  </Text>
                  {item.coach.naturalJp ? (
                    <Pressable
                      onPress={() => speakJapanese(item.coach!.naturalJp!, { rate: speechRate })}
                      style={{ marginTop: 3 }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: colors.ink
                        }}
                      >
                        Tự nhiên hơn: {item.coach.naturalJp} 🔊
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Hint Drawer */}
      {hints && hints.length > 0 && (
        <View style={[styles.hintBox, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <View style={styles.rowBetween}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent }}>
              Gợi ý câu trả lời (chạm để điền)
            </Text>
            <Pressable onPress={() => setHints(null)}>
              <X size={16} color={colors.accent} />
            </Pressable>
          </View>
          {hints.map((h, idx) => (
            <Pressable
              key={idx}
              onPress={() => {
                setDraft(h.jp);
                setHints(null);
              }}
              style={[styles.hintItem, { backgroundColor: colors.surface, borderColor: colors.line }]}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>{h.jp}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{h.meaningVi}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {error && (
        <Text style={{ fontSize: 12, color: colors.again, paddingHorizontal: 12, paddingVertical: 4 }}>
          {error}
        </Text>
      )}

      {/* Composer */}
      {session.status === 'active' && (
        <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Pressable
            disabled={loadingHint || sending}
            onPress={() => void handleHint()}
            style={[styles.composerIconBtn, { backgroundColor: colors.subtle, borderColor: colors.line }]}
          >
            {loadingHint ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Lightbulb size={18} color={colors.accent} />
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              inputRef.current?.focus();
              Alert.alert('Nhập giọng nói tiếng Nhật', sttInfo.hintVi);
            }}
            style={[styles.composerIconBtn, { backgroundColor: colors.subtle, borderColor: colors.line }]}
          >
            <Mic size={17} color={colors.body} />
          </Pressable>

          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="Nhập tiếng Nhật..."
            placeholderTextColor={colors.muted}
            style={[
              styles.composerInput,
              {
                backgroundColor: colors.canvas,
                borderColor: colors.lineStrong,
                color: colors.ink
              }
            ]}
          />

          <Pressable
            disabled={!draft.trim() || sending}
            onPress={() => void handleSend()}
            style={[
              styles.sendBtn,
              { backgroundColor: !draft.trim() || sending ? colors.lineStrong : colors.accent }
            ]}
          >
            <Send size={16} color={colors.onAccent} />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * Helper hook managing mobile conversation sessions (AsyncStorage + Firestore upsert/delete).
 */
export function useMobileConversationSessions(userId: string | null) {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);

  useEffect(() => {
    let active = true;
    void mobileRepository.loadConversationSessions(userId).then((loaded) => {
      if (active) setSessions(loaded);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const upsertSession = (session: ConversationSession) => {
    setSessions((prev) => {
      const next = mergeConversationSessions([session], prev);
      void mobileRepository.saveConversationSessions(userId, next);
      return next;
    });
    if (userId && isFirebaseConfigured) {
      void mobileSyncClient.upsertConversationSessionToCloud(userId, session).catch(() => {});
    }
  };

  const deleteSession = (sessionId: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId);
      void mobileRepository.saveConversationSessions(userId, next);
      return next;
    });
    if (userId && isFirebaseConfigured) {
      void mobileSyncClient.deleteConversationSessionFromCloud(userId, sessionId).catch(() => {});
    }
  };

  return { sessions, upsertSession, deleteSession };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lobbyRoot: { gap: 12 },
  pillRow: { gap: 8, paddingVertical: 2 },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  lobbyActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  primaryMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 4
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end'
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 12
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 11,
    fontSize: 14
  },
  levelRow: { flexDirection: 'row', gap: 6 },
  levelChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8
  },
  chatShell: { flex: 1 },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  missionBox: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 5
  },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  targetWordChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  messagesList: { padding: 14, gap: 12, paddingBottom: 20 },
  msgWrap: { gap: 5 },
  msgLeft: { alignItems: 'flex-start' },
  msgRight: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '86%',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10
  },
  coachBox: {
    maxWidth: '86%',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6
  },
  hintBox: {
    borderTopWidth: 1,
    padding: 10,
    gap: 6
  },
  hintItem: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 9,
    gap: 2
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  composerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  composerInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14
  },
  sendBtn: {
    width: 40,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
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
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 9
  },
  savePhraseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6
  }
});
