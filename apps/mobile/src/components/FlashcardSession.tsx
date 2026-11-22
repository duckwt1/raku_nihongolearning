import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Check, Volume2, X } from 'lucide-react-native';
import {
  Rating,
  SENTENCES_BY_ID,
  applyGrade,
  gradeReadingAnswer,
  previewCardGrades,
  type StudyCard
} from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { hapticSelect, hapticSuccess, hapticTap, hapticWarning } from '@/services/haptics';
import { speakJapanese } from '@/services/speech';
import { KanjiBottomSheet } from './KanjiBottomSheet';

interface FlashcardSessionProps {
  initialCards: StudyCard[];
  onRateCard: (updatedCard: StudyCard, rating: number) => void;
  onComplete: () => void;
  onLoadMoreNew?: () => void;
}

export function FlashcardSession({
  initialCards,
  onRateCard,
  onComplete,
  onLoadMoreNew
}: FlashcardSessionProps) {
  const { colors, typography } = useRakuTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const [sessionCards, setSessionCards] = useState<StudyCard[]>(() => initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputReading, setInputReading] = useState('');
  const [isRevealed, setIsRevealed] = useState(false);
  const [gradeResult, setGradeResult] = useState<{ isCorrect: boolean } | null>(null);
  const [selectedKanji, setSelectedKanji] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState<number | null>(null);

  const shakeX = useSharedValue(0);

  useEffect(() => {
    setSessionCards(initialCards);
    setCurrentIndex(0);
    setInputReading('');
    setIsRevealed(false);
    setGradeResult(null);
    setCompletedCount(initialCards.length === 0 ? 0 : null);
  }, [initialCards]);

  const cardShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }]
  }));

  const triggerShake = useCallback(() => {
    shakeX.value = withSequence(
      withTiming(-7, { duration: 55 }),
      withTiming(7, { duration: 55 }),
      withTiming(-4, { duration: 55 }),
      withTiming(0, { duration: 55 })
    );
  }, [shakeX]);

  const currentCard = sessionCards[currentIndex];
  const totalCards = sessionCards.length;

  const isWord = Boolean(currentCard?.word);
  const isKanji = Boolean(currentCard?.kanji);
  const hasKanji = Boolean(currentCard?.word?.kanji && currentCard.word.kanji.length > 0);
  const requiresInput = isWord ? hasKanji : isKanji;

  const handleCheck = () => {
    if (!currentCard || isRevealed) return;
    Keyboard.dismiss();

    if (!requiresInput) {
      hapticTap();
      setIsRevealed(true);
      return;
    }

    let correct = false;
    if (currentCard.word) {
      correct = gradeReadingAnswer(inputReading, currentCard.word.readings).isCorrect;
    } else if (currentCard.kanji) {
      const normalized = inputReading.trim().toLowerCase();
      const valid = [
        ...(currentCard.kanji.hanViet || []).map((hv) => hv.toLowerCase()),
        ...(currentCard.kanji.onyomi || []),
        ...(currentCard.kanji.kunyomi || []).flatMap((k) => {
          const stripped = k.replace(/[.\-]/g, '');
          return stripped !== k ? [k, stripped] : [k];
        })
      ];
      correct = gradeReadingAnswer(normalized, valid).isCorrect;
    }

    setGradeResult({ isCorrect: correct });
    setIsRevealed(true);
    if (correct) {
      hapticSuccess();
    } else {
      hapticWarning();
      triggerShake();
    }
  };

  const handleUnknown = () => {
    if (!currentCard || isRevealed) return;
    Keyboard.dismiss();
    hapticWarning();
    setGradeResult({ isCorrect: false });
    setIsRevealed(true);
  };

  const handleRate = (rating: Rating) => {
    if (!currentCard || !isRevealed) return;
    hapticSelect();

    const recordLog = applyGrade(currentCard.fsrsCard, rating as 1 | 2 | 3 | 4);
    const reviewedAt = new Date().toISOString();
    const updatedCard: StudyCard = {
      ...currentCard,
      fsrsCard: recordLog.card,
      isNew: false,
      isDue: recordLog.card.due.getTime() <= Date.now(),
      firstLearnedAt: currentCard.firstLearnedAt || reviewedAt,
      learnedAt: currentCard.learnedAt || (rating > Rating.Again ? reviewedAt : undefined)
    };

    onRateCard(updatedCard, rating);

    const isAgain = rating === Rating.Again;
    const nextCards = isAgain ? [...sessionCards, updatedCard] : sessionCards;
    if (isAgain) {
      setSessionCards(nextCards);
    }

    setIsRevealed(false);
    setGradeResult(null);
    setInputReading('');

    if (currentIndex + 1 < nextCards.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      hapticSuccess();
      setCompletedCount(nextCards.length);
    }
  };

  if (completedCount !== null || !currentCard) {
    return (
      <View style={styles.completeWrap}>
        <Animated.View
          entering={FadeIn.duration(220)}
          style={[styles.completeCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <View style={[styles.hankoSeal, { borderColor: colors.signal }]}>
            <Text
              style={[
                styles.hankoText,
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
            {completedCount && completedCount > 0
              ? `Xong phiên ôn · ${completedCount} thẻ`
              : 'Đã xong thẻ hôm nay'}
          </Text>
          <Text style={[styles.completeSub, { color: colors.muted }]}>
            Lịch ôn tập tiếp theo đã được cập nhật trên thiết bị.
          </Text>

          <View style={styles.completeActions}>
            <Pressable
              onPress={() => {
                hapticTap();
                onComplete();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: pressed ? colors.accentHover : colors.accent }
              ]}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                ]}
              >
                Về danh sách
              </Text>
            </Pressable>

            {onLoadMoreNew && (
              <Pressable
                onPress={() => {
                  hapticTap();
                  onLoadMoreNew();
                }}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  {
                    borderColor: colors.lineStrong,
                    backgroundColor: pressed ? colors.subtle : colors.surface
                  }
                ]}
              >
                <Text
                  style={[
                    styles.secondaryBtnText,
                    { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
                  ]}
                >
                  Học thêm 20 từ mới
                </Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </View>
    );
  }

  const previews = previewCardGrades(currentCard.fsrsCard);
  const frontText =
    currentCard.word?.surface ||
    currentCard.kanji?.char ||
    currentCard.grammar?.title ||
    currentCard.customPrompt ||
    '';

  const sentence = currentCard.word?.exampleIds?.[0]
    ? SENTENCES_BY_ID.get(currentCard.word.exampleIds[0])
    : currentCard.word?.exampleJp
      ? { jp: currentCard.word.exampleJp, vi: currentCard.word.exampleVi || '' }
      : undefined;

  const progressRatio = totalCards > 0 ? (currentIndex + 1) / totalCards : 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 92 : 0}
    >
      {/* Slim progress bar */}
      <View style={styles.progressHeader}>
        <View style={styles.progressLabels}>
          <Text style={[styles.progressCount, { color: colors.muted }]}>
            {currentIndex + 1} / {totalCards}
          </Text>
          {currentCard.isNew ? (
            <View style={[styles.stateBadge, { backgroundColor: colors.easySoft }]}>
              <Text style={[styles.stateBadgeText, { color: colors.easy }]}>Mới</Text>
            </View>
          ) : currentCard.isDue ? (
            <View style={[styles.stateBadge, { backgroundColor: colors.hardSoft }]}>
              <Text style={[styles.stateBadgeText, { color: colors.hard }]}>Đến hạn</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.track, { backgroundColor: colors.subtle }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: colors.accent, width: `${Math.round(progressRatio * 100)}%` }
            ]}
          />
        </View>
      </View>

      {/* Main Card Scrollable Area */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.cardScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          key={currentCard.id + '_' + currentIndex}
          entering={FadeIn.duration(180)}
          style={[
            styles.flashcard,
            cardShakeStyle,
            { backgroundColor: colors.surface, borderColor: colors.line }
          ]}
        >
          <View style={styles.cardTopRow}>
            <Text style={[styles.promptHint, { color: colors.muted }]}>
              {isWord
                ? hasKanji
                  ? 'Cách đọc (Hiragana)'
                  : 'Nhớ nghĩa từ này'
                : isKanji
                  ? 'Hán Việt hoặc cách đọc'
                  : 'Nội dung thẻ'}
            </Text>

            <Pressable
              onPress={() => {
                hapticTap();
                speakJapanese(currentCard.word?.readings[0] || frontText);
              }}
              hitSlop={10}
              accessibilityLabel="Nghe phát âm tiếng Nhật"
              style={({ pressed }) => [
                styles.iconBtn,
                { backgroundColor: pressed ? colors.subtle : 'transparent' }
              ]}
            >
              <Volume2 size={18} color={colors.muted} />
            </Pressable>
          </View>

          <Text
            style={[
              styles.frontText,
              { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
            ]}
          >
            {frontText}
          </Text>

          {isRevealed && gradeResult && (
            <View
              style={[
                styles.feedbackRow,
                {
                  backgroundColor: gradeResult.isCorrect ? colors.goodSoft : colors.againSoft,
                  borderColor: gradeResult.isCorrect ? colors.good : colors.again
                }
              ]}
            >
              {gradeResult.isCorrect ? (
                <Check size={16} color={colors.good} />
              ) : (
                <X size={16} color={colors.again} />
              )}
              <Text
                style={[
                  styles.feedbackText,
                  {
                    color: gradeResult.isCorrect ? colors.good : colors.again,
                    fontFamily: typography.fontFamily.viNative.semibold
                  }
                ]}
              >
                {gradeResult.isCorrect ? 'Chính xác' : 'Chưa khớp — xem cách đọc bên dưới'}
              </Text>
            </View>
          )}

          {isRevealed && currentCard.word && (
            <Animated.View
              entering={FadeIn.duration(180)}
              style={[styles.backFace, { borderTopColor: colors.line }]}
            >
              <Text
                style={[
                  styles.backReading,
                  { color: colors.accent, fontFamily: typography.fontFamily.jpNative.bold }
                ]}
              >
                {currentCard.word.readings.join(' ・ ')}
              </Text>

              <Text
                style={[
                  styles.backMeaning,
                  { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
                ]}
              >
                {currentCard.word.meaningVi}
              </Text>

              {currentCard.word.kanji && currentCard.word.kanji.length > 0 && (
                <View style={styles.kanjiChipsRow}>
                  {currentCard.word.kanji.map((ch, idx) => {
                    const hv = currentCard.word?.hanVietBreakdown?.[idx] || '';
                    return (
                      <Pressable
                        key={`${ch}-${idx}`}
                        onPress={() => {
                          hapticTap();
                          setSelectedKanji(ch);
                        }}
                        style={({ pressed }) => [
                          styles.kanjiChip,
                          {
                            backgroundColor: pressed ? colors.subtle : colors.canvas,
                            borderColor: colors.line
                          }
                        ]}
                      >
                        <Text
                          style={[
                            styles.kanjiChipChar,
                            { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                          ]}
                        >
                          {ch}
                        </Text>
                        {hv ? (
                          <Text style={[styles.kanjiChipHv, { color: colors.muted }]}>{hv}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {sentence && (
                <View
                  style={[
                    styles.sentenceBox,
                    { backgroundColor: colors.canvas, borderColor: colors.line }
                  ]}
                >
                  <View style={styles.sentenceHead}>
                    <Text
                      style={[
                        styles.sentenceJp,
                        { color: colors.ink, fontFamily: typography.fontFamily.jpNative.medium }
                      ]}
                    >
                      {sentence.jp}
                    </Text>
                    <Pressable
                      onPress={() => {
                        hapticTap();
                        speakJapanese(sentence.jp);
                      }}
                      hitSlop={8}
                    >
                      <Volume2 size={15} color={colors.muted} />
                    </Pressable>
                  </View>
                  <Text style={[styles.sentenceVi, { color: colors.muted }]}>{sentence.vi}</Text>
                </View>
              )}
            </Animated.View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Thumb-Zone Bottom Dock (Input OR 4 FSRS Rating Buttons) */}
      <View
        style={[
          styles.bottomDock,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.line,
            paddingBottom: Math.max(insets.bottom, 12)
          }
        ]}
      >
        {!isRevealed ? (
          requiresInput ? (
            <View style={styles.inputDock}>
              <TextInput
                ref={inputRef}
                value={inputReading}
                onChangeText={setInputReading}
                onSubmitEditing={handleCheck}
                placeholder="Nhập hiragana..."
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                style={[
                  styles.readingInput,
                  {
                    backgroundColor: colors.canvas,
                    borderColor: colors.lineStrong,
                    color: colors.ink,
                    fontFamily: typography.fontFamily.jpNative.medium
                  }
                ]}
              />
              <View style={styles.inputActions}>
                <Pressable
                  onPress={handleUnknown}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    styles.unknownBtn,
                    {
                      borderColor: colors.lineStrong,
                      backgroundColor: pressed ? colors.subtle : colors.surface
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.secondaryBtnText,
                      { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
                    ]}
                  >
                    Chưa nhớ
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleCheck}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    styles.checkBtn,
                    { backgroundColor: pressed ? colors.accentHover : colors.accent }
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                    ]}
                  >
                    Kiểm tra
                  </Text>
                  <ArrowRight size={16} color={colors.onAccent} />
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={handleCheck}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: pressed ? colors.accentHover : colors.accent }
              ]}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                ]}
              >
                Hiện đáp án
              </Text>
            </Pressable>
          )
        ) : (
          <View style={styles.ratingGrid}>
            {(
              [
                { rating: Rating.Again, label: 'Quên', fg: colors.again, bg: colors.againSoft },
                { rating: Rating.Hard, label: 'Khó', fg: colors.hard, bg: colors.hardSoft },
                { rating: Rating.Good, label: 'Tốt', fg: colors.good, bg: colors.goodSoft },
                { rating: Rating.Easy, label: 'Dễ', fg: colors.easy, bg: colors.easySoft }
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.rating}
                onPress={() => handleRate(opt.rating)}
                style={({ pressed }) => [
                  styles.ratingBtn,
                  {
                    backgroundColor: opt.bg,
                    borderColor: `${opt.fg}45`,
                    opacity: pressed ? 0.78 : 1
                  }
                ]}
              >
                <Text style={[styles.ratingInterval, { color: opt.fg }]}>
                  {previews[opt.rating].intervalLabel}
                </Text>
                <Text
                  style={[
                    styles.ratingLabel,
                    { color: opt.fg, fontFamily: typography.fontFamily.viNative.bold }
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <KanjiBottomSheet char={selectedKanji} onClose={() => setSelectedKanji(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  progressHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6
  },
  progressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  progressCount: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums']
  },
  stateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  stateBadgeText: {
    fontSize: 11,
    fontWeight: '600'
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
  cardScrollContent: {
    padding: 16,
    flexGrow: 1,
    justifyContent: 'center'
  },
  flashcard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    minHeight: 280
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  promptHint: {
    fontSize: 12
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  frontText: {
    fontSize: 42,
    lineHeight: 54,
    textAlign: 'center',
    marginVertical: 28
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14
  },
  feedbackText: {
    fontSize: 13
  },
  backFace: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 18,
    gap: 12
  },
  backReading: {
    fontSize: 22,
    textAlign: 'center'
  },
  backMeaning: {
    fontSize: 16,
    textAlign: 'center'
  },
  kanjiChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4
  },
  kanjiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1
  },
  kanjiChipChar: {
    fontSize: 15
  },
  kanjiChipHv: {
    fontSize: 12
  },
  sentenceBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    marginTop: 4
  },
  sentenceHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8
  },
  sentenceJp: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22
  },
  sentenceVi: {
    fontSize: 12,
    lineHeight: 18
  },
  bottomDock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12
  },
  inputDock: {
    gap: 10
  },
  readingInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 17,
    textAlign: 'center'
  },
  inputActions: {
    flexDirection: 'row',
    gap: 10
  },
  unknownBtn: {
    paddingHorizontal: 16
  },
  checkBtn: {
    flex: 1
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18
  },
  primaryBtnText: {
    fontSize: 15
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  secondaryBtnText: {
    fontSize: 14
  },
  ratingGrid: {
    flexDirection: 'row',
    gap: 8
  },
  ratingBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 2
  },
  ratingInterval: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    opacity: 0.85
  },
  ratingLabel: {
    fontSize: 14
  },
  completeWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 20
  },
  completeCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center'
  },
  hankoSeal: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  hankoText: {
    fontSize: 26
  },
  completeTitle: {
    fontSize: 20,
    textAlign: 'center'
  },
  completeSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20
  },
  completeActions: {
    width: '100%',
    gap: 10,
    marginTop: 22
  }
});
