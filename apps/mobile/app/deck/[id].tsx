import React, { useEffect, useMemo, useState } from 'react';
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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronDown,
  ChevronUp,
  CloudDownload,
  Play,
  Plus,
  Search,
  Trash2,
  Volume2,
  X
} from 'lucide-react-native';
import { State, calculateDeckCounts, type StudyCard } from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { useStudy } from '@/providers/StudyProvider';
import { KanjiBottomSheet } from '@/components/KanjiBottomSheet';
import { hapticSelect, hapticSuccess, hapticTap } from '@/services/haptics';
import { speakJapanese, stopJapaneseSpeech } from '@/services/speech';

type CardStatusFilter = 'all' | 'new' | 'learning' | 'due' | 'mastered';

const KANJI_CHAR_REGEX = /[\u4E00-\u9FAF\u3400-\u4DBF]/;

function classifyCardStatus(card: StudyCard, nowMs: number): Exclude<CardStatusFilter, 'all'> {
  const isActuallyNew =
    Boolean(card.isNew) &&
    (!card.fsrsCard.reps || card.fsrsCard.reps === 0) &&
    !card.fsrsCard.last_review;
  if (isActuallyNew) return 'new';
  if (
    card.fsrsCard.state === State.Learning ||
    card.fsrsCard.state === State.Relearning
  ) {
    return 'learning';
  }
  if (card.fsrsCard.due.getTime() <= nowMs) {
    return 'due';
  }
  return 'mastered';
}

function getStatusLabel(card: StudyCard, status: Exclude<CardStatusFilter, 'all'>): string {
  if (status === 'new') return 'Mới';
  if (status === 'learning') return 'Đang học';
  if (status === 'due') return 'Đến hạn';
  const diffDays = Math.max(
    1,
    Math.round((card.fsrsCard.due.getTime() - Date.now()) / 86_400_000)
  );
  return `${diffDays}n`;
}

export default function DeckDetailScreen() {
  const router = useRouter();
  const { colors, typography } = useRakuTheme();
  const {
    user,
    cards,
    decks,
    addCardToDeck,
    deleteCardFromDeck,
    refreshDecksFromCloud
  } = useStudy();
  const params = useLocalSearchParams<{ id?: string }>();
  const deckId = typeof params.id === 'string' ? params.id : '';

  const deck = useMemo(() => decks.find((d) => d.id === deckId), [decks, deckId]);
  const canEditCards = Boolean(deck && deck.origin === 'owned' && !deck.isDefault);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CardStatusFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [selectedKanji, setSelectedKanji] = useState<string | null>(null);
  const [isSyncingEmpty, setIsSyncingEmpty] = useState(false);

  // Add card modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [surface, setSurface] = useState('');
  const [reading, setReading] = useState('');
  const [meaningVi, setMeaningVi] = useState('');
  const [hanViet, setHanViet] = useState('');
  const [exampleJp, setExampleJp] = useState('');
  const [exampleVi, setExampleVi] = useState('');

  useEffect(() => {
    return () => {
      stopJapaneseSpeech();
    };
  }, []);

  // 100% local in-memory list -> 0 Firestore reads!
  const deckCards = useMemo(
    () => cards.filter((c) => c.deckId === deckId && Boolean(c.word)),
    [cards, deckId]
  );

  const deckCounts = useMemo(
    () =>
      calculateDeckCounts(cards, deckId, {
        newCardsPerDay: deck?.newCardsPerDay ?? 20,
        maxReviewsPerDay: deck?.maxReviewsPerDay ?? 100
      }),
    [cards, deckId, deck?.newCardsPerDay, deck?.maxReviewsPerDay]
  );

  const statusTotals = useMemo(() => {
    const nowMs = Date.now();
    const totals = { all: deckCards.length, new: 0, learning: 0, due: 0, mastered: 0 };
    for (const card of deckCards) {
      totals[classifyCardStatus(card, nowMs)]++;
    }
    return totals;
  }, [deckCards]);

  const filteredCards = useMemo(() => {
    const nowMs = Date.now();
    const q = query.trim().toLowerCase();
    return deckCards.filter((card) => {
      if (statusFilter !== 'all' && classifyCardStatus(card, nowMs) !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const w = card.word!;
      return (
        w.surface.toLowerCase().includes(q) ||
        w.meaningVi.toLowerCase().includes(q) ||
        w.readings.some((r) => r.toLowerCase().includes(q)) ||
        w.hanVietBreakdown.some((hv) => hv.toLowerCase().includes(q)) ||
        (w.exampleJp?.toLowerCase().includes(q) ?? false) ||
        (w.exampleVi?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [deckCards, query, statusFilter]);

  const handleSyncEmpty = async () => {
    hapticTap();
    setIsSyncingEmpty(true);
    try {
      await refreshDecksFromCloud();
    } finally {
      setIsSyncingEmpty(false);
    }
  };

  const handleSaveNewCard = () => {
    if (!deck) return;
    if (!surface.trim() || !meaningVi.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập từ vựng và nghĩa tiếng Việt.');
      return;
    }
    if (KANJI_CHAR_REGEX.test(surface) && !reading.trim()) {
      Alert.alert(
        'Cần nhập cách đọc',
        'Từ vựng có chứa chữ Hán cần nhập cách đọc Hiragana để chấm bài chính xác.'
      );
      return;
    }
    addCardToDeck(deck.id, {
      surface: surface.trim(),
      reading: reading.trim() || surface.trim(),
      meaningVi: meaningVi.trim(),
      hanViet: hanViet.trim() || undefined,
      exampleJp: exampleJp.trim() || undefined,
      exampleVi: exampleVi.trim() || undefined
    });
    hapticSuccess();
    setSurface('');
    setReading('');
    setMeaningVi('');
    setHanViet('');
    setExampleJp('');
    setExampleVi('');
    setIsAddOpen(false);
  };

  const handleDeleteCard = (card: StudyCard) => {
    if (!deck) return;
    Alert.alert(
      'Xoá từ vựng',
      `Xoá "${card.word?.surface || ''}" khỏi bộ "${deck.name}"?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: () => {
            hapticTap();
            deleteCardFromDeck(card.id, deck.id);
          }
        }
      ]
    );
  };

  const nowMs = Date.now();

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas }]}>
      <Stack.Screen options={{ title: deck?.name || 'Bộ thẻ' }} />

      {/* Top Summary & Controls (outside FlatList so search input keeps keyboard focus) */}
      <View
        style={[
          styles.topBlock,
          { backgroundColor: colors.surface, borderBottomColor: colors.line }
        ]}
      >
        <View style={styles.statsStrip}>
          <Text
            style={[
              styles.totalLabel,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
          >
            {deckCards.length} từ vựng
          </Text>
          <View style={styles.countPills}>
            <Text style={[styles.countItem, { color: colors.easy }]}>
              Mới {deckCounts.newCount}
            </Text>
            <Text style={[styles.countSep, { color: colors.muted }]}>·</Text>
            <Text style={[styles.countItem, { color: colors.signal }]}>
              Học lại {deckCounts.learnCount}
            </Text>
            <Text style={[styles.countSep, { color: colors.muted }]}>·</Text>
            <Text style={[styles.countItem, { color: colors.accent }]}>
              Đến hạn {deckCounts.dueCount}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            disabled={deckCards.length === 0}
            onPress={() => {
              hapticTap();
              router.push({
                pathname: '/study/[target]',
                params: { target: `deck:${deckId}` }
              });
            }}
            style={({ pressed }) => [
              styles.studyCta,
              {
                backgroundColor: pressed ? colors.accentHover : colors.accent,
                opacity: deckCards.length === 0 ? 0.45 : 1
              }
            ]}
          >
            <Play size={14} color={colors.onAccent} fill={colors.onAccent} />
            <Text
              style={[
                styles.studyCtaText,
                { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
              ]}
            >
              Ôn tập bộ này
            </Text>
          </Pressable>

          {canEditCards && (
            <Pressable
              onPress={() => {
                hapticTap();
                setIsAddOpen(true);
              }}
              style={({ pressed }) => [
                styles.addBtn,
                {
                  borderColor: colors.lineStrong,
                  backgroundColor: pressed ? colors.subtle : colors.canvas
                }
              ]}
            >
              <Plus size={15} color={colors.ink} />
              <Text
                style={[
                  styles.addBtnText,
                  { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
                ]}
              >
                Thêm từ
              </Text>
            </Pressable>
          )}
        </View>

        {/* Search input */}
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.canvas, borderColor: colors.lineStrong }
          ]}
        >
          <Search size={15} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm từ, cách đọc, nghĩa, Hán Việt..."
            placeholderTextColor={colors.muted}
            style={[
              styles.searchInput,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.regular }
            ]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={15} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Status Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(
            [
              { id: 'all', label: `Tất cả (${statusTotals.all})` },
              { id: 'new', label: `Mới (${statusTotals.new})` },
              { id: 'learning', label: `Đang học (${statusTotals.learning})` },
              { id: 'due', label: `Đến hạn (${statusTotals.due})` },
              { id: 'mastered', label: `Đã thuộc (${statusTotals.mastered})` }
            ] as const
          ).map((item) => {
            const active = statusFilter === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  hapticSelect();
                  setStatusFilter(item.id);
                }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.accent : colors.canvas,
                    borderColor: active ? colors.accent : colors.line
                  }
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: active ? colors.onAccent : colors.muted,
                      fontFamily: typography.fontFamily.viNative.semibold
                    }
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Virtualized Vocabulary List */}
      <FlatList
        data={filteredCards}
        keyExtractor={(item) => item.id}
        initialNumToRender={20}
        windowSize={9}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text
              style={[
                styles.emptyTitle,
                { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
              ]}
            >
              {deckCards.length === 0
                ? 'Bộ thẻ này chưa có từ vựng nào'
                : 'Không tìm thấy từ phù hợp'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>
              {deckCards.length === 0
                ? 'Nếu bạn vừa thêm bộ thẻ này từ Web, hãy bấm nút bên dưới để tải gói từ vựng về máy.'
                : 'Thử đổi từ khoá hoặc chọn bộ lọc khác.'}
            </Text>
            {deckCards.length === 0 && user && (
              <Pressable
                disabled={isSyncingEmpty}
                onPress={() => void handleSyncEmpty()}
                style={({ pressed }) => [
                  styles.syncEmptyBtn,
                  {
                    backgroundColor: pressed ? colors.accentHover : colors.accent,
                    opacity: isSyncingEmpty ? 0.6 : 1
                  }
                ]}
              >
                {isSyncingEmpty ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <CloudDownload size={15} color={colors.onAccent} />
                )}
                <Text
                  style={[
                    styles.syncEmptyText,
                    { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                  ]}
                >
                  Tải từ vựng từ đám mây
                </Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const word = item.word!;
          const status = classifyCardStatus(item, nowMs);
          const isExpanded = Boolean(expandedIds[item.id]);
          const hasExample = Boolean(word.exampleJp || word.exampleVi);
          const readingText = word.readings.filter((r) => r && r !== word.surface).join(' · ');
          const kanjiChars = Array.from(new Set(Array.from(word.surface).filter((ch) => KANJI_CHAR_REGEX.test(ch))));

          const statusBg =
            status === 'new'
              ? colors.subtle
              : status === 'learning'
                ? colors.againSoft
                : status === 'due'
                  ? colors.accentSoft
                  : colors.subtle;
          const statusFg =
            status === 'new'
              ? colors.easy
              : status === 'learning'
                ? colors.signal
                : status === 'due'
                  ? colors.accent
                  : colors.muted;

          return (
            <Pressable
              onPress={() => {
                if (hasExample || kanjiChars.length > 0) {
                  hapticSelect();
                  setExpandedIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                }
              }}
              style={[
                styles.wordCard,
                { backgroundColor: colors.surface, borderColor: colors.line }
              ]}
            >
              <View style={styles.wordTopRow}>
                <View style={styles.wordMain}>
                  <View style={styles.surfaceLine}>
                    <Text
                      style={[
                        styles.surfaceText,
                        { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                      ]}
                    >
                      {word.surface}
                    </Text>
                    {readingText ? (
                      <Text
                        style={[
                          styles.readingText,
                          { color: colors.accent, fontFamily: typography.fontFamily.jpNative.medium }
                        ]}
                      >
                        {readingText}
                      </Text>
                    ) : null}
                  </View>

                  {word.hanVietBreakdown.length > 0 ? (
                    <Text style={[styles.hvText, { color: colors.muted }]}>
                      {word.hanVietBreakdown.join(' ')}
                    </Text>
                  ) : null}

                  <Text
                    style={[
                      styles.meaningText,
                      { color: colors.ink, fontFamily: typography.fontFamily.viNative.regular }
                    ]}
                  >
                    {word.meaningVi}
                  </Text>
                </View>

                <View style={styles.wordRight}>
                  <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                    <Text style={[styles.statusText, { color: statusFg }]}>
                      {getStatusLabel(item, status)}
                    </Text>
                  </View>

                  <View style={styles.iconRow}>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        hapticTap();
                        speakJapanese(word.surface);
                      }}
                      hitSlop={6}
                      style={[styles.iconBtn, { backgroundColor: colors.canvas }]}
                    >
                      <Volume2 size={15} color={colors.accent} />
                    </Pressable>

                    {canEditCards && (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeleteCard(item);
                        }}
                        hitSlop={6}
                        style={[styles.iconBtn, { backgroundColor: colors.canvas }]}
                      >
                        <Trash2 size={14} color={colors.muted} />
                      </Pressable>
                    )}

                    {(hasExample || kanjiChars.length > 0) && (
                      <View style={styles.expandIcon}>
                        {isExpanded ? (
                          <ChevronUp size={15} color={colors.muted} />
                        ) : (
                          <ChevronDown size={15} color={colors.muted} />
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {isExpanded && (
                <View style={[styles.expandedBlock, { borderTopColor: colors.line }]}>
                  {kanjiChars.length > 0 && (
                    <View style={styles.kanjiChipRow}>
                      <Text style={[styles.kanjiChipHint, { color: colors.muted }]}>Kanji:</Text>
                      {kanjiChars.map((ch) => (
                        <Pressable
                          key={`${item.id}-${ch}`}
                          onPress={() => {
                            hapticTap();
                            setSelectedKanji(ch);
                          }}
                          style={[
                            styles.kanjiChip,
                            { backgroundColor: colors.accentSoft, borderColor: colors.line }
                          ]}
                        >
                          <Text
                            style={[
                              styles.kanjiChipText,
                              {
                                color: colors.accent,
                                fontFamily: typography.fontFamily.jpNative.bold
                              }
                            ]}
                          >
                            {ch}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {hasExample && (
                    <View style={[styles.exampleBox, { backgroundColor: colors.canvas }]}>
                      {word.exampleJp ? (
                        <View style={styles.exampleJpRow}>
                          <Text
                            style={[
                              styles.exampleJp,
                              {
                                color: colors.ink,
                                fontFamily: typography.fontFamily.jpNative.regular
                              }
                            ]}
                          >
                            {word.exampleJp}
                          </Text>
                          <Pressable
                            onPress={() => {
                              hapticTap();
                              speakJapanese(word.exampleJp!);
                            }}
                            hitSlop={6}
                          >
                            <Volume2 size={14} color={colors.accent} />
                          </Pressable>
                        </View>
                      ) : null}
                      {word.exampleVi ? (
                        <Text style={[styles.exampleVi, { color: colors.muted }]}>
                          {word.exampleVi}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
              )}
            </Pressable>
          );
        }}
      />

      <KanjiBottomSheet char={selectedKanji} onClose={() => setSelectedKanji(null)} />

      {/* Add Card Modal (for owned custom decks) */}
      <Modal
        visible={isAddOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsAddOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.line }
            ]}
          >
            <View style={styles.modalHeader}>
              <Text
                style={[
                  styles.modalTitle,
                  { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                ]}
              >
                Thêm từ vào bộ thẻ
              </Text>
              <Pressable onPress={() => setIsAddOpen(false)} hitSlop={8}>
                <X size={20} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalForm}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                  Từ vựng / Kanji *
                </Text>
                <TextInput
                  value={surface}
                  onChangeText={setSurface}
                  placeholder="Ví dụ: 荷物, 預かる..."
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.canvas,
                      borderColor: colors.lineStrong,
                      color: colors.ink
                    }
                  ]}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                  Cách đọc (Hiragana)
                </Text>
                <TextInput
                  value={reading}
                  onChangeText={setReading}
                  placeholder="Ví dụ: にもつ, あずかる..."
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.canvas,
                      borderColor: colors.lineStrong,
                      color: colors.ink
                    }
                  ]}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                  Nghĩa tiếng Việt *
                </Text>
                <TextInput
                  value={meaningVi}
                  onChangeText={setMeaningVi}
                  placeholder="Ví dụ: hành lý; đồ đạc..."
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.canvas,
                      borderColor: colors.lineStrong,
                      color: colors.ink
                    }
                  ]}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                  Hán Việt (tuỳ chọn)
                </Text>
                <TextInput
                  value={hanViet}
                  onChangeText={setHanViet}
                  placeholder="HÀ VẬT"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.canvas,
                      borderColor: colors.lineStrong,
                      color: colors.ink
                    }
                  ]}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                  Ví dụ tiếng Nhật (tuỳ chọn)
                </Text>
                <TextInput
                  value={exampleJp}
                  onChangeText={setExampleJp}
                  placeholder="荷物をフロントに預ける。"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.canvas,
                      borderColor: colors.lineStrong,
                      color: colors.ink
                    }
                  ]}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                  Nghĩa ví dụ (tuỳ chọn)
                </Text>
                <TextInput
                  value={exampleVi}
                  onChangeText={setExampleVi}
                  placeholder="Gửi hành lý ở quầy lễ tân."
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.canvas,
                      borderColor: colors.lineStrong,
                      color: colors.ink
                    }
                  ]}
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colors.line }]}>
              <Pressable
                onPress={() => setIsAddOpen(false)}
                style={[styles.cancelBtn, { borderColor: colors.lineStrong }]}
              >
                <Text style={[styles.cancelBtnText, { color: colors.ink }]}>Huỷ</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveNewCard}
                style={[styles.saveBtn, { backgroundColor: colors.accent }]}
              >
                <Text
                  style={[
                    styles.saveBtnText,
                    { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                  ]}
                >
                  Lưu từ
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  topBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  totalLabel: {
    fontSize: 15,
    fontVariant: ['tabular-nums']
  },
  countPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  countItem: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums']
  },
  countSep: {
    fontSize: 11
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8
  },
  studyCta: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  studyCtaText: {
    fontSize: 14
  },
  addBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  addBtnText: {
    fontSize: 13
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 12
  },
  searchInput: {
    flex: 1,
    fontSize: 13
  },
  filterRow: {
    gap: 6,
    paddingVertical: 2
  },
  filterChip: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterChipText: {
    fontSize: 11,
    fontVariant: ['tabular-nums']
  },
  listContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 36
  },
  wordCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10
  },
  wordTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },
  wordMain: {
    flex: 1,
    gap: 3
  },
  surfaceLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 8
  },
  surfaceText: {
    fontSize: 18
  },
  readingText: {
    fontSize: 12
  },
  hvText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  meaningText: {
    fontSize: 13,
    lineHeight: 19
  },
  wordRight: {
    alignItems: 'flex-end',
    gap: 6
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700'
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  expandIcon: {
    width: 20,
    alignItems: 'center'
  },
  expandedBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8
  },
  kanjiChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6
  },
  kanjiChipHint: {
    fontSize: 11,
    fontWeight: '600'
  },
  kanjiChip: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center'
  },
  kanjiChipText: {
    fontSize: 16
  },
  exampleBox: {
    borderRadius: 10,
    padding: 10,
    gap: 4
  },
  exampleJpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8
  },
  exampleJp: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19
  },
  exampleVi: {
    fontSize: 12,
    lineHeight: 17
  },
  emptyBox: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10
  },
  emptyTitle: {
    fontSize: 15,
    textAlign: 'center'
  },
  emptySub: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center'
  },
  syncEmptyBtn: {
    marginTop: 6,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  syncEmptyText: {
    fontSize: 13
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  modalSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    overflow: 'hidden'
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  modalTitle: {
    fontSize: 16
  },
  modalForm: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 12
  },
  field: {
    gap: 5
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600'
  },
  input: {
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600'
  },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveBtnText: {
    fontSize: 14
  }
});
