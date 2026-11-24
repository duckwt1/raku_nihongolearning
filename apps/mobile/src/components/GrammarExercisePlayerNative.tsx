import React, { useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { ArrowRight, Check, RotateCcw, Volume2, X } from 'lucide-react-native';
import type { GrammarExercise } from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { hapticSelect, hapticSuccess, hapticTap, hapticWarning } from '@/services/haptics';
import { speakJapanese } from '@/services/speech';

interface GrammarExercisePlayerNativeProps {
  exercises: GrammarExercise[];
  title: string;
  onExit: () => void;
}

function normalizeAnswer(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[。、,.!?！？]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOrderAnswer(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[。、,.!?！？]/g, '')
    .replace(/[\s\u3000]+/g, '');
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function grammarExerciseTypeLabel(type: string): string {
  switch (type) {
    case 'fill_blank':
      return 'Điền chỗ trống';
    case 'order':
      return 'Sắp xếp câu';
    case 'translate_jp_vi':
      return 'Dịch Nhật → Việt';
    case 'translate_vi_jp':
      return 'Dịch Việt → Nhật';
    default:
      return 'Trắc nghiệm';
  }
}

export function GrammarExercisePlayerNative({
  exercises,
  title,
  onExit
}: GrammarExercisePlayerNativeProps) {
  const { colors, typography } = useRakuTheme();

  const [index, setIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [assembledKeys, setAssembledKeys] = useState<number[]>([]);
  const [translateInput, setTranslateInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [attemptSeed, setAttemptSeed] = useState(0);

  const exercise = exercises[index];

  const shuffledChoices = useMemo(() => {
    if (!exercise?.choices) return [];
    return shuffle(exercise.choices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise?.id, attemptSeed]);

  const tokenItems = useMemo(() => {
    if (!exercise?.tokens) return [];
    return shuffle(exercise.tokens.map((token, tokenIndex) => ({ token, tokenIndex })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise?.id, attemptSeed]);

  const resetInputs = () => {
    setSelectedChoice(null);
    setAssembledKeys([]);
    setTranslateInput('');
    setChecked(false);
  };

  const restart = () => {
    hapticTap();
    setAttemptSeed((s) => s + 1);
    setIndex(0);
    setScore(0);
    setFinished(false);
    resetInputs();
  };

  if (finished || !exercise) {
    const total = Math.max(1, exercises.length);
    const pct = Math.round((score / total) * 100);
    return (
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
          Đúng {score} / {exercises.length} câu
        </Text>
        <Text style={[styles.subText, { color: colors.muted, textAlign: 'center' }]}>
          {title} · Độ chính xác {pct}%
        </Text>

        <View style={styles.completeActions}>
          <Pressable
            onPress={restart}
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
              Làm lại bộ này
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              hapticTap();
              onExit();
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
              Chọn bộ khác
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const answerList = Array.isArray(exercise.answer) ? exercise.answer : [exercise.answer];
  const primaryAnswer = String(answerList[0] ?? '');

  const assembledTokens = assembledKeys
    .map((key) => tokenItems.find((item) => item.tokenIndex === key)?.token)
    .filter((t): t is string => Boolean(t));

  const isChoiceType = exercise.type === 'fill_blank' || exercise.type === 'K7';
  const isOrderType = exercise.type === 'order';
  const isTranslateType = !isChoiceType && !isOrderType;

  const isCorrect = (() => {
    if (isChoiceType) {
      return selectedChoice !== null && selectedChoice.trim() === primaryAnswer.trim();
    }
    if (isOrderType) {
      return (
        normalizeOrderAnswer(assembledTokens.join('')) === normalizeOrderAnswer(primaryAnswer)
      );
    }
    return answerList.some((ans) => normalizeAnswer(String(ans)) === normalizeAnswer(translateInput));
  })();

  const canCheck = isChoiceType
    ? selectedChoice !== null
    : isOrderType
      ? assembledTokens.length > 0
      : translateInput.trim().length > 0;

  const handleCheck = () => {
    if (checked || !canCheck) return;
    Keyboard.dismiss();
    setChecked(true);
    if (isCorrect) {
      setScore((prev) => prev + 1);
      hapticSuccess();
    } else {
      hapticWarning();
    }
  };

  const handleChooseOption = (option: string) => {
    if (checked) return;
    setSelectedChoice(option);
    const correctNow = option.trim() === primaryAnswer.trim();
    setChecked(true);
    if (correctNow) {
      setScore((prev) => prev + 1);
      hapticSuccess();
    } else {
      hapticWarning();
    }
  };

  const handleNext = () => {
    hapticSelect();
    if (index + 1 >= exercises.length) {
      setFinished(true);
      hapticSuccess();
      return;
    }
    setIndex((prev) => prev + 1);
    resetInputs();
  };

  const promptDisplay =
    exercise.type === 'fill_blank'
      ? exercise.prompt.replace(/\{\{blank\}\}/g, '（　　　）')
      : exercise.prompt;

  const speakableText =
    exercise.type === 'translate_vi_jp'
      ? checked
        ? primaryAnswer
        : ''
      : exercise.type === 'fill_blank' && checked
        ? exercise.prompt.replace(/\{\{blank\}\}/g, primaryAnswer)
        : exercise.prompt.replace(/\{\{blank\}\}/g, '');

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Top session header */}
      <View style={styles.sessionTopRow}>
        <View style={styles.flex}>
          <Text
            style={[
              styles.sessionTitle,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text style={[styles.progressMetaText, { color: colors.muted }]}>
            Câu {index + 1} / {exercises.length} · Đúng {score}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            hapticTap();
            onExit();
          }}
          style={[styles.exitBtn, { borderColor: colors.lineStrong, backgroundColor: colors.surface }]}
        >
          <Text
            style={[
              styles.exitBtnText,
              { color: colors.muted, fontFamily: typography.fontFamily.viNative.semibold }
            ]}
          >
            Thoát
          </Text>
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={[styles.track, { backgroundColor: colors.subtle }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: colors.accent,
              width: `${Math.round(((index + 1) / Math.max(1, exercises.length)) * 100)}%`
            }
          ]}
        />
      </View>

      {/* Question Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.badgeRow}>
          <View style={styles.badgesLeft}>
            <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.badgeText, { color: colors.accent }]}>
                {grammarExerciseTypeLabel(exercise.type)}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.subtle }]}>
              <Text style={[styles.badgeText, { color: colors.muted }]}>{exercise.jlpt}</Text>
            </View>
            {exercise.grammarPattern ? (
              <View style={[styles.badge, { backgroundColor: colors.subtle }]}>
                <Text
                  style={[
                    styles.badgeText,
                    { color: colors.ink, fontFamily: typography.fontFamily.jpNative.medium }
                  ]}
                  numberOfLines={1}
                >
                  {exercise.grammarPattern}
                </Text>
              </View>
            ) : null}
          </View>

          {speakableText ? (
            <Pressable
              onPress={() => {
                hapticTap();
                speakJapanese(speakableText);
              }}
              hitSlop={10}
            >
              <Volume2 size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <Text
          style={[
            styles.promptText,
            {
              color: colors.ink,
              fontFamily:
                exercise.type === 'translate_vi_jp'
                  ? typography.fontFamily.viNative.semibold
                  : typography.fontFamily.jpNative.medium
            }
          ]}
        >
          {promptDisplay}
        </Text>
      </View>

      {/* Interaction Zone */}
      {isChoiceType ? (
        <View style={styles.optionsList}>
          {shuffledChoices.map((option) => {
            const isPicked = selectedChoice === option;
            const isAnswer = option.trim() === primaryAnswer.trim();
            let bg = colors.surface;
            let border = colors.line;
            let fg = colors.ink;

            if (checked) {
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
                disabled={checked}
                onPress={() => handleChooseOption(option)}
                style={({ pressed }) => [
                  styles.optionBtn,
                  {
                    backgroundColor: pressed && !checked ? colors.subtle : bg,
                    borderColor: border
                  }
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: fg, fontFamily: typography.fontFamily.jpNative.medium }
                  ]}
                >
                  {option}
                </Text>
                {checked && isAnswer && <Check size={16} color={colors.good} />}
                {checked && isPicked && !isAnswer && <X size={16} color={colors.again} />}
              </Pressable>
            );
          })}
        </View>
      ) : isOrderType ? (
        <View style={styles.orderWrap}>
          {/* Assembled sentence box */}
          <View
            style={[
              styles.assembledBox,
              {
                backgroundColor: colors.surface,
                borderColor: checked
                  ? isCorrect
                    ? colors.good
                    : colors.again
                  : colors.lineStrong
              }
            ]}
          >
            {assembledKeys.length === 0 ? (
              <Text style={[styles.assembledPlaceholder, { color: colors.muted }]}>
                Chạm vào từng mảnh bên dưới theo đúng thứ tự...
              </Text>
            ) : (
              <View style={styles.chipWrap}>
                {assembledKeys.map((tokenIdx) => {
                  const item = tokenItems.find((t) => t.tokenIndex === tokenIdx);
                  if (!item) return null;
                  return (
                    <Pressable
                      key={`picked-${tokenIdx}`}
                      disabled={checked}
                      onPress={() => {
                        hapticTap();
                        setAssembledKeys((prev) => prev.filter((k) => k !== tokenIdx));
                      }}
                      style={[
                        styles.tokenChip,
                        { backgroundColor: colors.accentSoft, borderColor: colors.accent }
                      ]}
                    >
                      <Text
                        style={[
                          styles.tokenChipText,
                          { color: colors.accent, fontFamily: typography.fontFamily.jpNative.medium }
                        ]}
                      >
                        {item.token}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Remaining pool */}
          <View style={styles.chipWrap}>
            {tokenItems.map((item) => {
              const used = assembledKeys.includes(item.tokenIndex);
              return (
                <Pressable
                  key={`pool-${item.tokenIndex}`}
                  disabled={checked || used}
                  onPress={() => {
                    hapticTap();
                    setAssembledKeys((prev) => [...prev, item.tokenIndex]);
                  }}
                  style={[
                    styles.tokenChip,
                    {
                      backgroundColor: used ? colors.subtle : colors.surface,
                      borderColor: used ? colors.line : colors.lineStrong,
                      opacity: used ? 0.35 : 1
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.tokenChipText,
                      { color: colors.ink, fontFamily: typography.fontFamily.jpNative.medium }
                    ]}
                  >
                    {item.token}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!checked && (
            <View style={styles.orderActions}>
              <Pressable
                disabled={assembledKeys.length === 0}
                onPress={() => {
                  hapticTap();
                  setAssembledKeys([]);
                }}
                style={[
                  styles.secondaryBtn,
                  {
                    borderColor: colors.lineStrong,
                    opacity: assembledKeys.length === 0 ? 0.45 : 1
                  }
                ]}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.ink }]}>Xóa chọn</Text>
              </Pressable>
              <Pressable
                disabled={!canCheck}
                onPress={handleCheck}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.flex,
                  {
                    backgroundColor: pressed ? colors.accentHover : colors.accent,
                    opacity: !canCheck ? 0.5 : 1
                  }
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
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        /* Translate input */
        <View style={styles.translateWrap}>
          <TextInput
            value={translateInput}
            onChangeText={setTranslateInput}
            editable={!checked}
            onSubmitEditing={handleCheck}
            placeholder={
              exercise.type === 'translate_vi_jp'
                ? 'Nhập câu tiếng Nhật...'
                : 'Nhập nghĩa tiếng Việt...'
            }
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            multiline
            style={[
              styles.translateInput,
              {
                backgroundColor: colors.surface,
                borderColor: checked
                  ? isCorrect
                    ? colors.good
                    : colors.again
                  : colors.lineStrong,
                color: colors.ink,
                fontFamily:
                  exercise.type === 'translate_vi_jp'
                    ? typography.fontFamily.jpNative.medium
                    : typography.fontFamily.viNative.regular
              }
            ]}
          />
          {!checked && (
            <Pressable
              disabled={!canCheck}
              onPress={handleCheck}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: pressed ? colors.accentHover : colors.accent,
                  opacity: !canCheck ? 0.5 : 1
                }
              ]}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                ]}
              >
                Kiểm tra đáp án
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Feedback & Explanation */}
      {checked && (
        <View
          style={[
            styles.feedbackCard,
            {
              backgroundColor: isCorrect ? colors.goodSoft : colors.againSoft,
              borderColor: isCorrect ? colors.good : colors.again
            }
          ]}
        >
          <View style={styles.feedbackHead}>
            {isCorrect ? <Check size={16} color={colors.good} /> : <X size={16} color={colors.again} />}
            <Text
              style={[
                styles.feedbackTitle,
                {
                  color: isCorrect ? colors.good : colors.again,
                  fontFamily: typography.fontFamily.viNative.bold
                }
              ]}
            >
              {isCorrect ? 'Chính xác!' : 'Chưa đúng'}
            </Text>
          </View>

          {!isCorrect && (
            <Text
              style={[
                styles.correctAnswerText,
                { color: colors.ink, fontFamily: typography.fontFamily.jpNative.medium }
              ]}
            >
              Đáp án: {answerList.join(' / ')}
            </Text>
          )}

          {exercise.explanationVi ? (
            <Text style={[styles.explanationText, { color: colors.body }]}>
              {exercise.explanationVi}
            </Text>
          ) : null}
        </View>
      )}

      {checked && (
        <Pressable
          onPress={handleNext}
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
            {index + 1 >= exercises.length ? 'Xem kết quả' : 'Câu tiếp theo'}
          </Text>
          <ArrowRight size={16} color={colors.onAccent} />
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  body: {
    gap: 14,
    paddingBottom: 32
  },
  sessionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  sessionTitle: {
    fontSize: 15
  },
  progressMetaText: {
    fontSize: 12,
    marginTop: 2,
    fontVariant: ['tabular-nums']
  },
  exitBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  exitBtnText: {
    fontSize: 12
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
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  badgesLeft: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    flex: 1
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600'
  },
  promptText: {
    fontSize: 19,
    lineHeight: 30
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
    fontSize: 15,
    lineHeight: 22
  },
  orderWrap: {
    gap: 12
  },
  assembledBox: {
    minHeight: 74,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    justifyContent: 'center'
  },
  assembledPlaceholder: {
    fontSize: 13,
    textAlign: 'center'
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  tokenChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1
  },
  tokenChipText: {
    fontSize: 15
  },
  orderActions: {
    flexDirection: 'row',
    gap: 10
  },
  translateWrap: {
    gap: 10
  },
  translateInput: {
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top'
  },
  feedbackCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6
  },
  feedbackHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  feedbackTitle: {
    fontSize: 14
  },
  correctAnswerText: {
    fontSize: 14,
    lineHeight: 20
  },
  explanationText: {
    fontSize: 13,
    lineHeight: 19
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
    fontSize: 15
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  secondaryBtnText: {
    fontSize: 14
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
  subText: {
    fontSize: 13
  },
  completeActions: {
    width: '100%',
    gap: 10,
    marginTop: 10
  }
});
