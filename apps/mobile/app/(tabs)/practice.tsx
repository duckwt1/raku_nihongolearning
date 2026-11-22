import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Check, RotateCcw, Volume2, X } from 'lucide-react-native';
import { SEED_WORDS, type Word } from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { hapticSelect, hapticSuccess, hapticTap, hapticWarning } from '@/services/haptics';
import { speakJapanese } from '@/services/speech';

interface QuickQuizQuestion {
  word: Word;
  options: string[];
  correctOption: string;
}

function buildQuickVocabQuiz(count = 10): QuickQuizQuestion[] {
  const pool = [...SEED_WORDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const picked = pool.slice(0, Math.min(count, pool.length));
  return picked.map((word) => {
    const distractors: string[] = [];
    for (const candidate of pool) {
      if (distractors.length >= 3) break;
      if (candidate.id !== word.id && candidate.meaningVi !== word.meaningVi && !distractors.includes(candidate.meaningVi)) {
        distractors.push(candidate.meaningVi);
      }
    }
    const options = [word.meaningVi, ...distractors];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j]!, options[i]!];
    }
    return { word, options, correctOption: word.meaningVi };
  });
}

export default function PracticeScreen() {
  const { colors, typography } = useRakuTheme();
  const [seed, setSeed] = useState(0);
  const questions = useMemo(() => buildQuickVocabQuiz(10), [seed]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const current = questions[index];

  const handleChoose = (option: string) => {
    if (!current || selected !== null) return;
    setSelected(option);
    if (option === current.correctOption) {
      setScore((prev) => prev + 1);
      hapticSuccess();
    } else {
      hapticWarning();
    }
  };

  const handleNext = () => {
    hapticSelect();
    if (index + 1 >= questions.length) {
      setFinished(true);
      hapticSuccess();
      return;
    }
    setIndex((prev) => prev + 1);
    setSelected(null);
  };

  const restart = () => {
    hapticTap();
    setSeed((s) => s + 1);
    setIndex(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text
            style={[
              styles.pageTitle,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
          >
            Luyện tập nhanh
          </Text>
          <Text style={[styles.pageSub, { color: colors.muted }]}>
            Trắc nghiệm 10 từ N3 chạy hoàn toàn ngoại tuyến.
          </Text>
        </View>

        {finished || !current ? (
          <View style={[styles.card, styles.completeCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
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

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
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
                    onPress={() => handleChoose(option)}
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
                    {selected !== null && isPicked && !isAnswer && <X size={16} color={colors.again} />}
                  </Pressable>
                );
              })}
            </View>

            {selected !== null && (
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
                  {index + 1 >= questions.length ? 'Xem kết quả' : 'Câu tiếp theo'}
                </Text>
                <ArrowRight size={16} color={colors.onAccent} />
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32
  },
  header: {
    gap: 4
  },
  pageTitle: {
    fontSize: 22
  },
  pageSub: {
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
    padding: 20,
    gap: 10
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
    marginTop: 4
  },
  primaryBtnText: {
    fontSize: 15
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
  }
});
