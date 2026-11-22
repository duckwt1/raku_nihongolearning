import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import { Stack } from 'expo-router';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Check, Settings2, Smartphone, Volume2, X } from 'lucide-react-native';
import {
  Rating,
  SENTENCES_BY_ID,
  applyGrade,
  gradeReadingAnswer,
  previewCardGrades,
  type StudyCard
} from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import {
  getHapticsEnabled,
  hapticSelect,
  hapticSuccess,
  hapticTap,
  hapticWarning,
  initHapticsPreference,
  setHapticsEnabled,
  subscribeHapticsEnabled
} from '@/services/haptics';
import { speakJapanese } from '@/services/speech';
import { KanjiBottomSheet } from './KanjiBottomSheet';

type StudyMode = 'flip' | 'type' | 'choice';
const MODE_KEY = 'raku.studyMode.v2';
const MODE_OPTIONS: { key: StudyMode; label: string; desc: string }[] = [
  {
    key: 'flip',
    label: 'Lật thẻ (Mặc định)',
    desc: 'Chạm vào thẻ để lật 3D qua lại, vuốt trái/phải 2 nấc để chấm 4 mức'
  },
  {
    key: 'type',
    label: 'Nhập cách đọc',
    desc: 'Gõ Hiragana hoặc âm Hán Việt để kiểm tra trí nhớ'
  },
  {
    key: 'choice',
    label: 'Trắc nghiệm 4 ô',
    desc: 'Chọn nhanh 1 trong 4 đáp án kiểu Quizlet'
  }
];

// Horizontal 2-tier thresholds for 4 FSRS ratings:
// Left short  (-SOFT .. -DEEP) -> Hard (Khó)
// Left deep   (< -DEEP)        -> Again (Quên)
// Right short (+SOFT .. +DEEP) -> Good (Tốt)
// Right deep  (> +DEEP)        -> Easy (Dễ)
const SWIPE_SOFT_THRESHOLD = 48;
const SWIPE_DEEP_THRESHOLD = 132;
const SWIPE_MAX_DRAG = 230;
const SWIPE_EXIT_X = 420;

const RATING_AGAIN = Rating.Again;
const RATING_HARD = Rating.Hard;
const RATING_GOOD = Rating.Good;
const RATING_EASY = Rating.Easy;

function isRatingZoneActive(dx: number, rating: number): boolean {
  'worklet';
  if (rating === RATING_AGAIN) return dx <= -SWIPE_DEEP_THRESHOLD;
  if (rating === RATING_HARD) return dx <= -SWIPE_SOFT_THRESHOLD && dx > -SWIPE_DEEP_THRESHOLD;
  if (rating === RATING_GOOD) return dx >= SWIPE_SOFT_THRESHOLD && dx < SWIPE_DEEP_THRESHOLD;
  if (rating === RATING_EASY) return dx >= SWIPE_DEEP_THRESHOLD;
  return false;
}

function resolveSwipeRatingWorklet(dx: number): Rating | null {
  'worklet';
  const abs = Math.abs(dx);
  if (abs < SWIPE_SOFT_THRESHOLD) return null;
  if (dx < 0) {
    return abs >= SWIPE_DEEP_THRESHOLD ? RATING_AGAIN : RATING_HARD;
  }
  return abs >= SWIPE_DEEP_THRESHOLD ? RATING_EASY : RATING_GOOD;
}

/** Label of the correct answer for multiple-choice, plus a pool key so distractors are comparable. */
function answerOf(card: StudyCard): { label: string; pool: string } | null {
  if (card.word) {
    const hasK = Boolean(card.word.kanji && card.word.kanji.length > 0);
    const label = hasK ? card.word.readings[0] : card.word.meaningVi;
    return label ? { label, pool: hasK ? 'word-reading' : 'word-meaning' } : null;
  }
  if (card.kanji) {
    const label = card.kanji.hanViet?.[0] || card.kanji.onyomi?.[0] || card.kanji.kunyomi?.[0];
    return label ? { label, pool: 'kanji' } : null;
  }
  return null;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getCardFrontText(card: StudyCard | undefined): string {
  if (!card) return '';
  return (
    card.word?.surface ||
    card.kanji?.char ||
    card.grammar?.title ||
    card.customPrompt ||
    ''
  );
}

interface RatingOptionMeta {
  rating: Rating;
  label: string;
  hint: string;
  fg: string;
  bg: string;
  intervalLabel: string;
}

/** UI-thread animated swipe stamp badge inside the card — zero JS re-renders while dragging. */
function SwipeStampOverlay({
  meta,
  dragX,
  fontBold
}: {
  meta: RatingOptionMeta;
  dragX: SharedValue<number>;
  fontBold: string;
}) {
  const animStyle = useAnimatedStyle(() => {
    const active = isRatingZoneActive(dragX.value, meta.rating);
    return {
      opacity: withTiming(active ? 1 : 0, { duration: 110 }),
      transform: [{ scale: withTiming(active ? 1 : 0.88, { duration: 110 }) }]
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.swipeStampPill,
        { backgroundColor: meta.bg, borderColor: meta.fg },
        animStyle
      ]}
    >
      <Text style={[styles.swipeStampText, { color: meta.fg, fontFamily: fontBold }]}>
        {meta.label} · {meta.intervalLabel}
      </Text>
    </Animated.View>
  );
}

/** UI-thread animated 4-tier swipe guide pill above the rating buttons. */
function SwipeGaugePill({
  meta,
  dragX,
  mutedColor,
  fontBold
}: {
  meta: RatingOptionMeta;
  dragX: SharedValue<number>;
  mutedColor: string;
  fontBold: string;
}) {
  const animStyle = useAnimatedStyle(() => {
    const active = isRatingZoneActive(dragX.value, meta.rating);
    return {
      backgroundColor: active ? meta.bg : 'transparent',
      borderColor: active ? meta.fg : 'transparent',
      transform: [{ scale: withTiming(active ? 1.03 : 1, { duration: 90 }) }]
    };
  });

  return (
    <Animated.View style={[styles.swipeGaugeSegment, animStyle]}>
      <Text style={[styles.swipeGaugeHint, { color: mutedColor }]}>{meta.hint}</Text>
      <Text style={[styles.swipeGaugeLabel, { color: meta.fg, fontFamily: fontBold }]}>
        {meta.label}
      </Text>
    </Animated.View>
  );
}

/** UI-thread animated FSRS rating button that subtly elevates when swiped into its zone. */
function RatingActionButton({
  meta,
  dragX,
  enableDragHighlight,
  fontBold,
  onPress
}: {
  meta: RatingOptionMeta;
  dragX: SharedValue<number>;
  enableDragHighlight: boolean;
  fontBold: string;
  onPress: () => void;
}) {
  const animStyle = useAnimatedStyle(() => {
    const active = enableDragHighlight && isRatingZoneActive(dragX.value, meta.rating);
    return {
      borderColor: active ? meta.fg : `${meta.fg}45`,
      borderWidth: active ? 2 : 1,
      transform: [{ scale: withTiming(active ? 1.05 : 1, { duration: 100 }) }]
    };
  });

  return (
    <Animated.View style={[styles.ratingBtnWrap, { backgroundColor: meta.bg }, animStyle]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.ratingBtnInner, { opacity: pressed ? 0.72 : 1 }]}
      >
        <Text style={[styles.ratingInterval, { color: meta.fg }]}>{meta.intervalLabel}</Text>
        <Text style={[styles.ratingLabel, { color: meta.fg, fontFamily: fontBold }]}>
          {meta.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

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
  const [mode, setMode] = useState<StudyMode>('flip');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hapticsOn, setHapticsOn] = useState<boolean>(() => getHapticsEnabled());
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  const dragX = useSharedValue(0);
  const flipVal = useSharedValue(0);
  const enterProgress = useSharedValue(1);
  const isSwipingOut = useSharedValue(false);

  const rateRef = useRef<(rating: Rating, fromSwipe?: boolean) => void>(() => {});

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((v) => {
        if (v === 'flip' || v === 'type' || v === 'choice') setMode(v);
      })
      .catch(() => undefined);

    void initHapticsPreference().then(setHapticsOn);
    return subscribeHapticsEnabled(setHapticsOn);
  }, []);

  const resetCardMotion = useCallback(
    (animateEnter = false) => {
      dragX.value = 0;
      flipVal.value = 0;
      isSwipingOut.value = false;
      if (animateEnter) {
        enterProgress.value = 0;
        enterProgress.value = withTiming(1, {
          duration: 180,
          easing: Easing.out(Easing.cubic)
        });
      } else {
        enterProgress.value = 1;
      }
    },
    [dragX, flipVal, enterProgress, isSwipingOut]
  );

  const changeMode = (next: StudyMode) => {
    hapticSelect();
    Keyboard.dismiss();
    setSettingsOpen(false);
    if (next === mode) return;
    setMode(next);
    setGradeResult(null);
    setSelectedChoice(null);
    setIsRevealed(false);
    resetCardMotion(false);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => undefined);
  };

  const handleToggleHaptics = async (nextEnabled: boolean) => {
    await setHapticsEnabled(nextEnabled);
    if (nextEnabled) {
      hapticSelect();
    }
  };

  useEffect(() => {
    setSessionCards(initialCards);
    setCurrentIndex(0);
    setInputReading('');
    setIsRevealed(false);
    setGradeResult(null);
    setSelectedChoice(null);
    resetCardMotion(false);
    setCompletedCount(initialCards.length === 0 ? 0 : null);
  }, [initialCards, resetCardMotion]);

  const triggerShake = useCallback(() => {
    dragX.value = withSequence(
      withTiming(-8, { duration: 48 }),
      withTiming(8, { duration: 48 }),
      withTiming(-5, { duration: 48 }),
      withTiming(0, { duration: 48 })
    );
  }, [dragX]);

  const currentCard = sessionCards[currentIndex];
  const nextCard = sessionCards[currentIndex + 1];
  const totalCards = sessionCards.length;

  const isWord = Boolean(currentCard?.word);
  const isKanji = Boolean(currentCard?.kanji);
  const hasKanji = Boolean(currentCard?.word?.kanji && currentCard.word.kanji.length > 0);
  const requiresInput = isWord ? hasKanji : isKanji;

  const choiceData = useMemo(() => {
    if (!currentCard) return null;
    const answer = answerOf(currentCard);
    if (!answer) return null;
    const seen = new Set<string>([answer.label]);
    const distractors: string[] = [];
    for (const other of shuffle(sessionCards)) {
      if (other.id === currentCard.id) continue;
      const a = answerOf(other);
      if (!a || a.pool !== answer.pool || seen.has(a.label)) continue;
      seen.add(a.label);
      distractors.push(a.label);
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) return null;
    return { answer: answer.label, options: shuffle([answer.label, ...distractors]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCard?.id, currentIndex, sessionCards.length]);

  const inputKind: StudyMode =
    mode === 'type' && requiresInput ? 'type' : mode === 'choice' && choiceData ? 'choice' : 'flip';

  // Smooth 3D flip toggle on card tap (no buttons needed, no vibration lag)
  const handleCardFlipPress = useCallback(() => {
    if (!currentCard || inputKind !== 'flip' || isSwipingOut.value) return;
    setGradeResult(null);
    setIsRevealed((prev) => {
      const next = !prev;
      flipVal.value = withTiming(next ? 1 : 0, {
        duration: 340,
        easing: Easing.bezier(0.22, 1, 0.36, 1)
      });
      return next;
    });
  }, [currentCard, inputKind, flipVal, isSwipingOut]);

  const handleChoose = (label: string) => {
    if (!currentCard || isRevealed || !choiceData) return;
    const correct = label === choiceData.answer;
    setSelectedChoice(label);
    setGradeResult({ isCorrect: correct });
    setIsRevealed(true);
    if (correct) {
      hapticSuccess();
    } else {
      hapticWarning();
      triggerShake();
    }
  };

  const handleCheck = () => {
    if (!currentCard || isRevealed) return;
    Keyboard.dismiss();

    if (inputKind !== 'type') {
      handleCardFlipPress();
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

  const handleRate = useCallback(
    (rating: Rating, fromSwipe = false) => {
      if (!currentCard) return;
      if (inputKind !== 'flip' && !isRevealed) return;

      // Never vibrate on swipe so gliding through cards stays silky smooth
      if (!fromSwipe) {
        hapticSelect();
      }

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
      setSelectedChoice(null);
      setInputReading('');
      resetCardMotion(true);

      if (currentIndex + 1 < nextCards.length) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        if (!fromSwipe) {
          hapticSuccess();
        }
        setCompletedCount(nextCards.length);
      }
    },
    [currentCard, currentIndex, inputKind, isRevealed, onRateCard, resetCardMotion, sessionCards]
  );

  rateRef.current = handleRate;

  const commitSwipeRating = useCallback((rating: Rating) => {
    rateRef.current(rating, true);
  }, []);

  // Native UI-thread horizontal pan gesture (zero JS updates & zero vibration during swipe)
  const panGesture = usePanGesture({
    enabled: inputKind === 'flip' && completedCount === null && Boolean(currentCard),
    activeOffsetX: [-12, 12],
    failOffsetY: [-14, 14],
    onUpdate: (e) => {
      'worklet';
      if (isSwipingOut.value) return;
      const clamped = Math.max(-SWIPE_MAX_DRAG, Math.min(SWIPE_MAX_DRAG, e.translationX));
      dragX.value = clamped;
    },
    onDeactivate: (e) => {
      'worklet';
      if (isSwipingOut.value) return;
      if (e.canceled) {
        dragX.value = withSpring(0, { damping: 20, stiffness: 260 });
        return;
      }
      const chosen = resolveSwipeRatingWorklet(e.translationX);
      if (chosen === null) {
        dragX.value = withSpring(0, { damping: 20, stiffness: 260 });
        return;
      }

      isSwipingOut.value = true;
      const exitX = e.translationX < 0 ? -SWIPE_EXIT_X : SWIPE_EXIT_X;
      dragX.value = withTiming(
        exitX,
        { duration: 175, easing: Easing.out(Easing.quad) },
        (finished) => {
          'worklet';
          if (finished) {
            scheduleOnRN(commitSwipeRating, chosen);
          }
        }
      );
    }
  });

  // UI-thread styles for active card container (drag + subtle arc + entry scale)
  const cardDragStyle = useAnimatedStyle(() => {
    const absX = Math.abs(dragX.value);
    const rotateZ = interpolate(
      dragX.value,
      [-SWIPE_MAX_DRAG, 0, SWIPE_MAX_DRAG],
      [-10, 0, 10],
      Extrapolation.CLAMP
    );
    const translateY = interpolate(absX, [0, SWIPE_MAX_DRAG], [0, 10], Extrapolation.CLAMP);
    const dragOpacity = interpolate(absX, [240, SWIPE_EXIT_X], [1, 0], Extrapolation.CLAMP);
    const enterScale = interpolate(enterProgress.value, [0, 1], [0.95, 1], Extrapolation.CLAMP);

    return {
      opacity: dragOpacity * enterProgress.value,
      transform: [
        { translateX: dragX.value },
        { translateY },
        { rotateZ: `${rotateZ}deg` },
        { scale: enterScale }
      ]
    };
  });

  // UI-thread style for next-card deck peek behind active card
  const nextCardPeekStyle = useAnimatedStyle(() => {
    const absX = Math.abs(dragX.value);
    const scale = interpolate(absX, [0, 170], [0.94, 0.99], Extrapolation.CLAMP);
    const translateY = interpolate(absX, [0, 170], [10, 2], Extrapolation.CLAMP);
    const opacity = interpolate(absX, [0, 170], [0.45, 0.92], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }, { scale }]
    };
  });

  // UI-thread 3D flip styles for front & back faces + dynamic border color on drag
  const frontFaceAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipVal.value, [0, 1], [0, 180], Extrapolation.CLAMP);
    const scale = interpolate(flipVal.value, [0, 0.5, 1], [1, 0.94, 1], Extrapolation.CLAMP);
    const dx = dragX.value;
    let borderColor = colors.line;
    if (dx <= -SWIPE_DEEP_THRESHOLD) borderColor = colors.again;
    else if (dx <= -SWIPE_SOFT_THRESHOLD) borderColor = colors.hard;
    else if (dx >= SWIPE_DEEP_THRESHOLD) borderColor = colors.easy;
    else if (dx >= SWIPE_SOFT_THRESHOLD) borderColor = colors.good;

    return {
      opacity: flipVal.value < 0.5 ? 1 : 0,
      borderColor,
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }, { scale }]
    };
  });

  const backFaceAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipVal.value, [0, 1], [180, 360], Extrapolation.CLAMP);
    const scale = interpolate(flipVal.value, [0, 0.5, 1], [1, 0.94, 1], Extrapolation.CLAMP);
    const dx = dragX.value;
    let borderColor = colors.line;
    if (dx <= -SWIPE_DEEP_THRESHOLD) borderColor = colors.again;
    else if (dx <= -SWIPE_SOFT_THRESHOLD) borderColor = colors.hard;
    else if (dx >= SWIPE_DEEP_THRESHOLD) borderColor = colors.easy;
    else if (dx >= SWIPE_SOFT_THRESHOLD) borderColor = colors.good;

    return {
      opacity: flipVal.value >= 0.5 ? 1 : 0,
      borderColor,
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }, { scale }]
    };
  });

  // Shake-only style for Type / Choice modes
  const nonFlipShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }]
  }));

  const headerRightButton = (
    <Pressable
      onPress={() => {
        hapticTap();
        setSettingsOpen(true);
      }}
      hitSlop={10}
      accessibilityLabel="Cài đặt phiên học"
      style={({ pressed }) => [
        styles.headerSettingBtn,
        { backgroundColor: pressed ? colors.subtle : 'transparent' }
      ]}
    >
      <Settings2 size={19} color={colors.ink} />
    </Pressable>
  );

  const settingsModal = (
    <Modal
      visible={settingsOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setSettingsOpen(false)}
    >
      <Pressable style={styles.modalBackdrop} onPress={() => setSettingsOpen(false)}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
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
              Cài đặt học
            </Text>
            <Pressable
              onPress={() => setSettingsOpen(false)}
              hitSlop={10}
              style={styles.iconBtn}
            >
              <X size={18} color={colors.muted} />
            </Pressable>
          </View>

          <Text
            style={[
              styles.modalSectionLabel,
              { color: colors.muted, fontFamily: typography.fontFamily.viNative.semibold }
            ]}
          >
            CHẾ ĐỘ HỌC
          </Text>

          <View style={styles.modeOptionList}>
            {MODE_OPTIONS.map((opt) => {
              const active = opt.key === mode;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => changeMode(opt.key)}
                  style={[
                    styles.modeOptionCard,
                    {
                      backgroundColor: active ? colors.subtle : colors.canvas,
                      borderColor: active ? colors.accent : colors.line
                    }
                  ]}
                >
                  <View style={styles.modeOptionTextWrap}>
                    <Text
                      style={[
                        styles.modeOptionLabel,
                        {
                          color: active ? colors.accent : colors.ink,
                          fontFamily: typography.fontFamily.viNative.bold
                        }
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={[styles.modeOptionDesc, { color: colors.muted }]}>
                      {opt.desc}
                    </Text>
                  </View>
                  {active && <Check size={18} color={colors.accent} />}
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.modalDivider, { backgroundColor: colors.line }]} />

          <View style={styles.hapticsRow}>
            <View style={styles.hapticsInfo}>
              <View style={styles.hapticsTitleRow}>
                <Smartphone size={15} color={colors.accent} />
                <Text
                  style={[
                    styles.modeOptionLabel,
                    { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                  ]}
                >
                  Phản hồi rung
                </Text>
              </View>
              <Text style={[styles.modeOptionDesc, { color: colors.muted }]}>
                Rung nhẹ khi bấm nút hoặc kiểm tra đáp án (không rung khi vuốt thẻ).
              </Text>
            </View>
            <Switch
              value={hapticsOn}
              onValueChange={(v) => void handleToggleHaptics(v)}
              trackColor={{ false: colors.lineStrong, true: colors.accent }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  if (completedCount !== null || !currentCard) {
    return (
      <View style={styles.completeWrap}>
        <Stack.Screen options={{ headerRight: () => headerRightButton }} />
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
        {settingsModal}
      </View>
    );
  }

  const previews = previewCardGrades(currentCard.fsrsCard);
  const frontText = getCardFrontText(currentCard);
  const nextFrontText = getCardFrontText(nextCard);

  const sentence = currentCard.word?.exampleIds?.[0]
    ? SENTENCES_BY_ID.get(currentCard.word.exampleIds[0])
    : currentCard.word?.exampleJp
      ? { jp: currentCard.word.exampleJp, vi: currentCard.word.exampleVi || '' }
      : undefined;

  const progressRatio = totalCards > 0 ? (currentIndex + 1) / totalCards : 0;

  const ratingMeta: RatingOptionMeta[] = [
    {
      rating: Rating.Again,
      label: 'Quên',
      hint: '<< Trái sâu',
      fg: colors.again,
      bg: colors.againSoft,
      intervalLabel: previews[Rating.Again].intervalLabel
    },
    {
      rating: Rating.Hard,
      label: 'Khó',
      hint: '< Trái nhẹ',
      fg: colors.hard,
      bg: colors.hardSoft,
      intervalLabel: previews[Rating.Hard].intervalLabel
    },
    {
      rating: Rating.Good,
      label: 'Tốt',
      hint: 'Phải nhẹ >',
      fg: colors.good,
      bg: colors.goodSoft,
      intervalLabel: previews[Rating.Good].intervalLabel
    },
    {
      rating: Rating.Easy,
      label: 'Dễ',
      hint: 'Phải sâu >>',
      fg: colors.easy,
      bg: colors.easySoft,
      intervalLabel: previews[Rating.Easy].intervalLabel
    }
  ];

  const renderBackDetails = (stopProp = false) => (
    <>
      {currentCard.word && (
        <View style={styles.backDetailsInner}>
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
                    onPress={(e) => {
                      if (stopProp) e.stopPropagation();
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
                  onPress={(e) => {
                    if (stopProp) e.stopPropagation();
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
        </View>
      )}

      {currentCard.kanji && (
        <View style={styles.backDetailsInner}>
          {currentCard.kanji.hanViet && currentCard.kanji.hanViet.length > 0 && (
            <Text
              style={[
                styles.backReading,
                { color: colors.accent, fontFamily: typography.fontFamily.viNative.bold }
              ]}
            >
              {currentCard.kanji.hanViet.join(' ・ ').toUpperCase()}
            </Text>
          )}
          <Text
            style={[
              styles.backMeaning,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
            ]}
          >
            {currentCard.kanji.meaningVi}
          </Text>
          {(currentCard.kanji.onyomi?.length > 0 || currentCard.kanji.kunyomi?.length > 0) && (
            <Text style={[styles.sentenceVi, { color: colors.muted, textAlign: 'center' }]}>
              {[
                currentCard.kanji.onyomi?.length
                  ? `On: ${currentCard.kanji.onyomi.join('・')}`
                  : '',
                currentCard.kanji.kunyomi?.length
                  ? `Kun: ${currentCard.kanji.kunyomi.join('・')}`
                  : ''
              ]
                .filter(Boolean)
                .join('   |   ')}
            </Text>
          )}
        </View>
      )}

      {currentCard.grammar && (
        <View style={styles.backDetailsInner}>
          <Text
            style={[
              styles.backMeaning,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
            ]}
          >
            {currentCard.grammar.meaningVi}
          </Text>
          {currentCard.grammar.explanationVi ? (
            <Text style={[styles.sentenceVi, { color: colors.muted, textAlign: 'center' }]}>
              {currentCard.grammar.explanationVi}
            </Text>
          ) : null}
        </View>
      )}
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 92 : 0}
    >
      <Stack.Screen options={{ headerRight: () => headerRightButton }} />

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

      {/* Main Card Area */}
      {inputKind === 'flip' ? (
        <View style={styles.flipStage}>
          <View style={styles.deckWrapper}>
            {/* Next card deck peek behind the active card */}
            {nextCard && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.nextCardBackdrop,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                  nextCardPeekStyle
                ]}
              >
                <Text
                  numberOfLines={2}
                  style={[
                    styles.nextCardText,
                    { color: colors.muted, fontFamily: typography.fontFamily.jpNative.bold }
                  ]}
                >
                  {nextFrontText}
                </Text>
              </Animated.View>
            )}

            {/* Active 3D double-sided swipeable flashcard */}
            <GestureDetector gesture={panGesture}>
              <Animated.View style={[styles.flipCardSlot, cardDragStyle]}>
                {/* FRONT FACE */}
                <Animated.View
                  pointerEvents={isRevealed ? 'none' : 'auto'}
                  style={[
                    styles.flipFace,
                    styles.cardShadow,
                    { backgroundColor: colors.surface },
                    frontFaceAnimatedStyle
                  ]}
                >
                  <Pressable
                    onPress={handleCardFlipPress}
                    accessibilityLabel="Chạm thẻ để lật sang mặt sau"
                    style={styles.flipFacePressable}
                  >
                    <View style={styles.cardTopRow}>
                      <View style={[styles.faceTag, { backgroundColor: colors.subtle }]}>
                        <Text style={[styles.faceTagText, { color: colors.muted }]}>Mặt trước</Text>
                      </View>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
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

                    <View style={styles.flipFrontCenter}>
                      <Text
                        adjustsFontSizeToFit
                        numberOfLines={3}
                        style={[
                          styles.flipFrontText,
                          { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                        ]}
                      >
                        {frontText}
                      </Text>
                    </View>

                    <Text style={[styles.flipFooterHint, { color: colors.muted }]}>
                      Chạm vào thẻ để lật
                    </Text>
                  </Pressable>
                </Animated.View>

                {/* BACK FACE */}
                <Animated.View
                  pointerEvents={isRevealed ? 'auto' : 'none'}
                  style={[
                    styles.flipFace,
                    styles.flipFaceAbsolute,
                    styles.cardShadow,
                    { backgroundColor: colors.surface },
                    backFaceAnimatedStyle
                  ]}
                >
                  <View style={styles.cardTopRowBack}>
                    <Pressable
                      onPress={handleCardFlipPress}
                      style={styles.backHeaderLeft}
                    >
                      <View style={[styles.faceTag, { backgroundColor: colors.accentSoft }]}>
                        <Text style={[styles.faceTagText, { color: colors.accent }]}>Mặt sau</Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.backSurfaceMini,
                          { color: colors.muted, fontFamily: typography.fontFamily.jpNative.medium }
                        ]}
                      >
                        {frontText}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
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

                  <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.flipBackScrollContent}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    <Pressable
                      onPress={handleCardFlipPress}
                      accessibilityLabel="Chạm thẻ để lật về mặt trước"
                      style={styles.flipBackPressable}
                    >
                      {renderBackDetails(true)}
                    </Pressable>
                  </ScrollView>
                </Animated.View>

                {/* UI-thread floating swipe rating stamps (centered top) */}
                <View pointerEvents="none" style={styles.swipeStampAnchor}>
                  {ratingMeta.map((meta) => (
                    <SwipeStampOverlay
                      key={meta.rating}
                      meta={meta}
                      dragX={dragX}
                      fontBold={typography.fontFamily.viNative.bold}
                    />
                  ))}
                </View>
              </Animated.View>
            </GestureDetector>
          </View>
        </View>
      ) : (
        /* Type & Multiple-Choice Card Layout */
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.cardScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            key={currentCard.id + '_' + currentIndex}
            entering={FadeIn.duration(160)}
            style={[
              styles.standardCard,
              styles.cardShadow,
              nonFlipShakeStyle,
              { backgroundColor: colors.surface, borderColor: colors.line }
            ]}
          >
            <View style={styles.cardTopRow}>
              <Text style={[styles.promptHint, { color: colors.muted }]}>
                {inputKind === 'choice'
                  ? 'Chọn đáp án đúng'
                  : isWord
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

            <View style={styles.standardFrontZone}>
              <Text
                style={[
                  styles.frontText,
                  { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                ]}
              >
                {frontText}
              </Text>
            </View>

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
                  {gradeResult.isCorrect ? 'Chính xác' : 'Chưa khớp — xem đáp án bên dưới'}
                </Text>
              </View>
            )}

            {isRevealed && (
              <Animated.View
                entering={FadeIn.duration(150)}
                style={[styles.backFaceSection, { borderTopColor: colors.line }]}
              >
                {renderBackDetails(false)}
              </Animated.View>
            )}
          </Animated.View>
        </ScrollView>
      )}

      {/* Thumb-Zone Bottom Dock */}
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
        {inputKind === 'choice' && !isRevealed && choiceData ? (
          <View style={styles.choiceGrid}>
            {choiceData.options.map((opt) => (
              <Pressable
                key={opt}
                onPress={() => handleChoose(opt)}
                style={({ pressed }) => [
                  styles.choiceBtn,
                  {
                    borderColor: colors.lineStrong,
                    backgroundColor: pressed ? colors.subtle : colors.surface
                  }
                ]}
              >
                <Text
                  numberOfLines={3}
                  style={[
                    styles.choiceText,
                    { color: colors.ink, fontFamily: typography.fontFamily.jpNative.medium }
                  ]}
                >
                  {opt}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : inputKind === 'type' && !isRevealed ? (
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
          <View style={styles.ratingWrap}>
            {inputKind === 'flip' && (
              <View style={[styles.swipeGaugeRow, { backgroundColor: colors.subtle }]}>
                {ratingMeta.map((meta) => (
                  <SwipeGaugePill
                    key={meta.rating}
                    meta={meta}
                    dragX={dragX}
                    mutedColor={colors.muted}
                    fontBold={typography.fontFamily.viNative.bold}
                  />
                ))}
              </View>
            )}
            {inputKind === 'choice' && choiceData && selectedChoice !== choiceData.answer && (
              <Text style={[styles.swipeHint, { color: colors.again }]}>
                Đáp án đúng: {choiceData.answer}
              </Text>
            )}
            <View style={styles.ratingGrid}>
              {ratingMeta.map((meta) => (
                <RatingActionButton
                  key={meta.rating}
                  meta={meta}
                  dragX={dragX}
                  enableDragHighlight={inputKind === 'flip'}
                  fontBold={typography.fontFamily.viNative.bold}
                  onPress={() => handleRate(meta.rating, false)}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      {settingsModal}
      <KanjiBottomSheet char={selectedKanji} onClose={() => setSelectedKanji(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  headerSettingBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
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
  flipStage: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    justifyContent: 'center'
  },
  deckWrapper: {
    flex: 1,
    maxHeight: 460,
    minHeight: 320,
    justifyContent: 'center'
  },
  nextCardBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  nextCardText: {
    fontSize: 36,
    opacity: 0.25,
    textAlign: 'center'
  },
  flipCardSlot: {
    flex: 1
  },
  flipFace: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1.5,
    backfaceVisibility: 'hidden',
    overflow: 'hidden'
  },
  flipFaceAbsolute: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  },
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3
  },
  flipFacePressable: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between'
  },
  flipFrontCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  flipFrontText: {
    fontSize: 48,
    lineHeight: 60,
    textAlign: 'center'
  },
  flipFooterHint: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.6
  },
  cardTopRowBack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
    gap: 10
  },
  backHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  backSurfaceMini: {
    flex: 1,
    fontSize: 15
  },
  flipBackScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 22
  },
  flipBackPressable: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8
  },
  faceTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  faceTagText: {
    fontSize: 11,
    fontWeight: '600'
  },
  swipeStampAnchor: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  swipeStampPill: {
    position: 'absolute',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5
  },
  swipeStampText: {
    fontSize: 13
  },
  cardScrollContent: {
    padding: 16,
    flexGrow: 1,
    justifyContent: 'center'
  },
  standardCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 22,
    minHeight: 280
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  promptHint: {
    fontSize: 12,
    flex: 1
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  standardFrontZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24
  },
  frontText: {
    fontSize: 42,
    lineHeight: 54,
    textAlign: 'center'
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
  backFaceSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 18
  },
  backDetailsInner: {
    gap: 12
  },
  backReading: {
    fontSize: 25,
    textAlign: 'center'
  },
  backMeaning: {
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 25
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
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  choiceBtn: {
    width: '48%',
    flexGrow: 1,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  choiceText: {
    fontSize: 16,
    textAlign: 'center'
  },
  ratingWrap: {
    gap: 8
  },
  swipeGaugeRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    gap: 4
  },
  swipeGaugeSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  swipeGaugeHint: {
    fontSize: 10
  },
  swipeGaugeLabel: {
    fontSize: 11
  },
  swipeHint: {
    fontSize: 12,
    textAlign: 'center'
  },
  ratingGrid: {
    flexDirection: 'row',
    gap: 8
  },
  ratingBtnWrap: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    overflow: 'hidden'
  },
  ratingBtnInner: {
    flex: 1,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20
  },
  modalSheet: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 12
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  modalTitle: {
    fontSize: 17
  },
  modalSectionLabel: {
    fontSize: 11,
    letterSpacing: 0.6
  },
  modeOptionList: {
    gap: 10
  },
  modeOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5
  },
  modeOptionTextWrap: {
    flex: 1,
    gap: 3
  },
  modeOptionLabel: {
    fontSize: 14
  },
  modeOptionDesc: {
    fontSize: 12,
    lineHeight: 17
  },
  modalDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4
  },
  hapticsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  hapticsInfo: {
    flex: 1,
    gap: 3
  },
  hapticsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
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
