import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles, Volume2, X } from 'lucide-react-native';
import { getKanjiByChar, getWordsByKanji, type Word } from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { useStudy } from '@/providers/StudyProvider';
import { hapticSelect, hapticSuccess, hapticTap } from '@/services/haptics';
import { speakJapanese } from '@/services/speech';

interface KanjiBottomSheetProps {
  char: string | null;
  onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function KanjiBottomSheet({ char, onClose }: KanjiBottomSheetProps) {
  const { colors, typography } = useRakuTheme();
  const { user, cards, customKanjiMap, enrichKanjiChar } = useStudy();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  useEffect(() => {
    setIsEnriching(false);
    setEnrichError(null);
    if (char) {
      translateY.value = SCREEN_HEIGHT * 0.5;
      translateY.value = withSpring(0, { damping: 24, stiffness: 260 });
    }
  }, [char, translateY]);

  const extraWords = useMemo<Word[]>(() => {
    const list: Word[] = [];
    for (const c of cards) {
      if (c.word) list.push(c.word);
    }
    return list;
  }, [cards]);

  const dismiss = () => {
    hapticSelect();
    translateY.value = withTiming(SCREEN_HEIGHT, { duration: 180 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 90 || event.velocityY > 700) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 24, stiffness: 280 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }]
  }));

  if (!char) return null;

  const kanji = getKanjiByChar(char, customKanjiMap);
  const words = getWordsByKanji(char, extraWords);

  const handleEnrich = async () => {
    if (isEnriching) return;
    hapticTap();
    setIsEnriching(true);
    setEnrichError(null);
    try {
      const result = await enrichKanjiChar(char);
      if (result) {
        hapticSuccess();
      } else {
        setEnrichError('AI chưa trả về dữ liệu cho chữ này. Vui lòng thử lại.');
      }
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : 'Không thể tra cứu bằng AI.');
    } finally {
      setIsEnriching(false);
    }
  };

  return (
    <Modal visible={Boolean(char)} transparent animationType="fade" onRequestClose={dismiss}>
      <GestureHandlerRootView style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={dismiss} />

        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: Math.max(insets.bottom, 16)
            }
          ]}
        >
          <GestureDetector gesture={panGesture}>
            <View style={styles.handleArea}>
              <View style={[styles.handle, { backgroundColor: colors.lineStrong }]} />
              <View style={[styles.header, { borderBottomColor: colors.line }]}>
                <View style={styles.headerLeft}>
                  <View
                    style={[
                      styles.kanjiBox,
                      { backgroundColor: colors.canvas, borderColor: colors.line }
                    ]}
                  >
                    <Text
                      style={[
                        styles.kanjiChar,
                        { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                      ]}
                    >
                      {char}
                    </Text>
                  </View>
                  <View style={styles.headerText}>
                    <View style={styles.kickerRow}>
                      <Text
                        style={[
                          styles.kicker,
                          { color: colors.muted, fontFamily: typography.fontFamily.viNative.medium }
                        ]}
                      >
                        Hán Việt
                      </Text>
                      {kanji?.source === 'ai' && (
                        <View style={[styles.aiBadge, { backgroundColor: colors.accentSoft }]}>
                          <Sparkles size={10} color={colors.accent} />
                          <Text style={[styles.aiBadgeText, { color: colors.accent }]}>AI</Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.hanViet,
                        {
                          color: colors.accent,
                          fontFamily: typography.fontFamily.viNative.bold
                        }
                      ]}
                    >
                      {kanji?.hanViet.join(' · ') || 'Chưa có'}
                    </Text>
                    <Text
                      style={[
                        styles.meaning,
                        { color: colors.body, fontFamily: typography.fontFamily.viNative.regular }
                      ]}
                      numberOfLines={2}
                    >
                      {kanji?.meaningVi || '—'}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={dismiss}
                  hitSlop={10}
                  accessibilityLabel="Đóng chi tiết Kanji"
                  style={({ pressed }) => [
                    styles.closeBtn,
                    { backgroundColor: pressed ? colors.subtle : 'transparent' }
                  ]}
                >
                  <X size={20} color={colors.muted} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {!kanji && (
              <View
                style={[
                  styles.aiPromptCard,
                  { backgroundColor: colors.accentSoft, borderColor: colors.accent }
                ]}
              >
                <Text style={[styles.aiPromptText, { color: colors.ink }]}>
                  Chữ 「{char}」 chưa có trong kho 609 chữ N3. Dùng AI bổ sung Hán Việt, cách đọc, nghĩa và lưu vĩnh viễn vào kho của bạn.
                </Text>
                <Pressable
                  disabled={isEnriching || !user}
                  onPress={() => void handleEnrich()}
                  style={({ pressed }) => [
                    styles.aiPromptBtn,
                    {
                      backgroundColor: pressed ? colors.accentHover : colors.accent,
                      opacity: isEnriching || !user ? 0.55 : 1
                    }
                  ]}
                >
                  {isEnriching ? (
                    <ActivityIndicator size="small" color={colors.onAccent} />
                  ) : (
                    <Sparkles size={14} color={colors.onAccent} />
                  )}
                  <Text
                    style={[
                      styles.aiPromptBtnText,
                      { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                    ]}
                  >
                    {isEnriching
                      ? 'Đang tra cứu bằng AI...'
                      : user
                        ? `Tra & lưu「${char}」bằng AI`
                        : 'Đăng nhập để dùng AI tra Kanji'}
                  </Text>
                </Pressable>
                {enrichError ? (
                  <Text style={[styles.aiErrorText, { color: colors.signal }]}>{enrichError}</Text>
                ) : null}
              </View>
            )}

            {/* Compact metadata */}
            <View
              style={[
                styles.metaGrid,
                { backgroundColor: colors.canvas, borderColor: colors.line }
              ]}
            >
              <View style={styles.metaCell}>
                <Text style={[styles.metaLabel, { color: colors.muted }]}>Cấp độ</Text>
                <Text
                  style={[
                    styles.metaValue,
                    { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
                  ]}
                >
                  {kanji?.jlpt || '—'}
                </Text>
              </View>
              <View style={[styles.metaDivider, { backgroundColor: colors.line }]} />
              <View style={styles.metaCell}>
                <Text style={[styles.metaLabel, { color: colors.muted }]}>Số nét</Text>
                <Text
                  style={[
                    styles.metaValue,
                    { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
                  ]}
                >
                  {kanji?.strokeCount || '—'}
                </Text>
              </View>
              <View style={[styles.metaDivider, { backgroundColor: colors.line }]} />
              <View style={styles.metaCell}>
                <Text style={[styles.metaLabel, { color: colors.muted }]}>Từ ghép</Text>
                <Text
                  style={[
                    styles.metaValue,
                    { color: colors.accent, fontFamily: typography.fontFamily.viNative.semibold }
                  ]}
                >
                  {words.length}
                </Text>
              </View>
            </View>

            {/* Onyomi / Kunyomi */}
            {(kanji?.onyomi?.length || kanji?.kunyomi?.length) ? (
              <View
                style={[
                  styles.readingsBox,
                  { backgroundColor: colors.canvas, borderColor: colors.line }
                ]}
              >
                {kanji.onyomi.length > 0 && (
                  <View style={styles.readingRow}>
                    <Text style={[styles.readingTag, { color: colors.muted }]}>Onyomi</Text>
                    <Text
                      style={[
                        styles.readingValue,
                        { color: colors.ink, fontFamily: typography.fontFamily.jpNative.medium }
                      ]}
                    >
                      {kanji.onyomi.join('、')}
                    </Text>
                  </View>
                )}
                {kanji.kunyomi.length > 0 && (
                  <View style={styles.readingRow}>
                    <Text style={[styles.readingTag, { color: colors.muted }]}>Kunyomi</Text>
                    <Text
                      style={[
                        styles.readingValue,
                        { color: colors.ink, fontFamily: typography.fontFamily.jpNative.medium }
                      ]}
                    >
                      {kanji.kunyomi.join('、')}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            {/* Lookalikes */}
            {kanji?.lookalikes && kanji.lookalikes.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.muted }]}>Chữ dễ nhầm</Text>
                <View style={styles.lookalikesRow}>
                  {kanji.lookalikes.map((lk) => (
                    <View
                      key={lk}
                      style={[
                        styles.lookalikeChip,
                        { backgroundColor: colors.hardSoft, borderColor: colors.hard }
                      ]}
                    >
                      <Text
                        style={[
                          styles.lookalikeChar,
                          { color: colors.hard, fontFamily: typography.fontFamily.jpNative.bold }
                        ]}
                      >
                        {lk}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Words containing this Kanji */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.muted }]}>
                Từ vựng chứa「{char}」({words.length})
              </Text>
              {words.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  Chưa có từ ghép trong kho.
                </Text>
              ) : (
                <View
                  style={[
                    styles.wordsList,
                    { backgroundColor: colors.canvas, borderColor: colors.line }
                  ]}
                >
                  {words.slice(0, 24).map((w, idx) => (
                    <View
                      key={w.id}
                      style={[
                        styles.wordRow,
                        idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }
                      ]}
                    >
                      <View style={styles.wordTextCol}>
                        <View style={styles.wordHeadRow}>
                          <Text
                            style={[
                              styles.wordSurface,
                              { color: colors.ink, fontFamily: typography.fontFamily.jpNative.bold }
                            ]}
                          >
                            {w.surface}
                          </Text>
                          <Text
                            style={[
                              styles.wordReading,
                              {
                                color: colors.accent,
                                fontFamily: typography.fontFamily.jpNative.regular
                              }
                            ]}
                          >
                            {w.readings.join('・')}
                          </Text>
                        </View>
                        <Text style={[styles.wordMeaning, { color: colors.muted }]}>
                          {w.meaningVi}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          hapticTap();
                          speakJapanese(w.readings[0] || w.surface);
                        }}
                        hitSlop={8}
                        accessibilityLabel={`Nghe ${w.surface}`}
                        style={({ pressed }) => [
                          styles.speakBtn,
                          { backgroundColor: pressed ? colors.subtle : 'transparent' }
                        ]}
                      >
                        <Volume2 size={16} color={colors.muted} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(21, 29, 27, 0.45)'
  },
  sheet: {
    maxHeight: SCREEN_HEIGHT * 0.82,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    overflow: 'hidden'
  },
  handleArea: {
    paddingTop: 10
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 8
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1
  },
  kanjiBox: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  kanjiChar: {
    fontSize: 34,
    lineHeight: 42
  },
  headerText: {
    flex: 1
  },
  kicker: {
    fontSize: 11
  },
  hanViet: {
    fontSize: 17,
    marginTop: 1
  },
  meaning: {
    fontSize: 13,
    marginTop: 2
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  scroll: {
    maxHeight: SCREEN_HEIGHT * 0.62
  },
  scrollContent: {
    padding: 20,
    gap: 16
  },
  metaGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10
  },
  metaCell: {
    flex: 1,
    alignItems: 'center'
  },
  metaDivider: {
    width: StyleSheet.hairlineWidth,
    height: 26
  },
  metaLabel: {
    fontSize: 11
  },
  metaValue: {
    fontSize: 15,
    marginTop: 2,
    fontVariant: ['tabular-nums']
  },
  readingsBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6
  },
  readingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10
  },
  readingTag: {
    width: 64,
    fontSize: 12
  },
  readingValue: {
    flex: 1,
    fontSize: 14
  },
  section: {
    gap: 8
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600'
  },
  lookalikesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  lookalikeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth
  },
  lookalikeChar: {
    fontSize: 16
  },
  wordsList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden'
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10
  },
  wordTextCol: {
    flex: 1
  },
  wordHeadRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 8
  },
  wordSurface: {
    fontSize: 15
  },
  wordReading: {
    fontSize: 13
  },
  wordMeaning: {
    fontSize: 12,
    marginTop: 2
  },
  speakBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    fontSize: 13
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '700'
  },
  aiPromptCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10
  },
  aiPromptText: {
    fontSize: 12,
    lineHeight: 18
  },
  aiPromptBtn: {
    height: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  aiPromptBtnText: {
    fontSize: 13
  },
  aiErrorText: {
    fontSize: 12
  }
});
