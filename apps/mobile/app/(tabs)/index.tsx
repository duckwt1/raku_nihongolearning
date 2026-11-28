import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Check, Clock3, Flame, Plus } from 'lucide-react-native';
import { calculateDeckCounts, getTodayDateString } from '@raku/core';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { useStudy } from '@/providers/StudyProvider';
import { DeckRow } from '@/components/DeckRow';
import { hapticTap } from '@/services/haptics';

export default function StudyHomeScreen() {
  const router = useRouter();
  const { colors, typography } = useRakuTheme();
  const {
    user,
    cards,
    folders,
    decks,
    stats,
    dailyGoal,
    totalDueToday,
    totalNewToday,
    newWordsToday,
    currentStreak,
    refreshLocal,
    refreshDecksFromCloud
  } = useStudy();

  const [refreshing, setRefreshing] = useState(false);

  const isStatsToday = stats.todayStats.date === getTodayDateString();
  const reviewedCount = isStatsToday ? stats.todayStats.reviewedCount : 0;
  const studySeconds = isStatsToday ? stats.todayStats.studySeconds : 0;
  const minutes = Math.floor(studySeconds / 60);
  const formattedTime =
    minutes > 0 ? `${minutes} phút` : studySeconds > 0 ? '< 1 phút' : '0 phút';

  const remainingTotal = totalDueToday + totalNewToday;
  const hasWorkToday = remainingTotal > 0;
  const totalToday = reviewedCount + remainingTotal;
  const progress = totalToday > 0 ? Math.round((reviewedCount / totalToday) * 100) : 0;
  const isGoalDone = newWordsToday >= dailyGoal && !hasWorkToday && reviewedCount > 0;

  const todayLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      }).format(new Date());
    } catch {
      return getTodayDateString();
    }
  }, []);

  const unfiledDecks = useMemo(
    () =>
      decks.filter(
        (d) => !d.folderId || !folders.some((f) => f.id === d.folderId)
      ),
    [decks, folders]
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshLocal();
    if (user) {
      await refreshDecksFromCloud();
    }
    setRefreshing(false);
  };

  const headline = isGoalDone
    ? 'Đã xong mục tiêu hôm nay'
    : totalDueToday > 0
      ? `Còn ${totalDueToday} thẻ đến hạn`
      : totalNewToday > 0
        ? `${totalNewToday} thẻ mới sẵn sàng`
        : 'Không có thẻ đến hạn';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
          />
        }
      >
        {/* Top bar */}
        <View style={styles.topHeader}>
          <View style={styles.brandRow}>
            <View style={[styles.brandSeal, { backgroundColor: colors.ink }]}>
              <Text
                style={[
                  styles.brandChar,
                  { color: colors.surface, fontFamily: typography.fontFamily.jpNative.bold }
                ]}
              >
                楽
              </Text>
              <View style={[styles.brandDot, { backgroundColor: colors.signal }]} />
            </View>
            <View>
              <Text
                style={[
                  styles.brandTitle,
                  { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                ]}
              >
                Raku Nihongo
              </Text>
              <Text style={[styles.dateText, { color: colors.muted }]}>{todayLabel}</Text>
            </View>
          </View>

          <View style={styles.streakPill}>
            <Flame size={15} color={currentStreak > 0 ? colors.signal : colors.muted} />
            <Text
              style={[
                styles.streakText,
                { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
              ]}
            >
              {currentStreak}
            </Text>
          </View>
        </View>

        {/* Daily Study Card (Calm Washi style) */}
        <View style={[styles.dailyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text
            style={[
              styles.headline,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
          >
            {headline}
          </Text>

          <View style={styles.metaStrip}>
            <Text style={[styles.metaItem, { color: colors.muted }]}>
              Đã ôn <Text style={[styles.metaStrong, { color: colors.ink }]}>{reviewedCount}</Text>
            </Text>
            <Text style={[styles.metaItem, { color: colors.muted }]}>
              Từ mới{' '}
              <Text style={[styles.metaStrong, { color: colors.ink }]}>
                {newWordsToday}/{dailyGoal}
              </Text>
            </Text>
            <View style={styles.timeRow}>
              <Clock3 size={12} color={colors.muted} />
              <Text style={[styles.metaItem, { color: colors.muted }]}>{formattedTime}</Text>
            </View>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: colors.subtle }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.accent, width: `${progress}%` }
              ]}
            />
          </View>

          {hasWorkToday ? (
            <Pressable
              onPress={() => {
                hapticTap();
                router.push({ pathname: '/study/[target]', params: { target: 'today' } });
              }}
              style={({ pressed }) => [
                styles.ctaBtn,
                { backgroundColor: pressed ? colors.accentHover : colors.accent }
              ]}
            >
              <Text
                style={[
                  styles.ctaText,
                  { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                ]}
              >
                {reviewedCount > 0 ? 'Tiếp tục ôn' : 'Ôn ngay'} ({remainingTotal})
              </Text>
              <ArrowRight size={17} color={colors.onAccent} />
            </Pressable>
          ) : (
            <View style={styles.doneRow}>
              {isGoalDone && (
                <View style={[styles.doneTag, { backgroundColor: colors.accentSoft }]}>
                  <Check size={14} color={colors.accent} />
                  <Text
                    style={[
                      styles.doneTagText,
                      { color: colors.accent, fontFamily: typography.fontFamily.viNative.semibold }
                    ]}
                  >
                    Hoàn tất
                  </Text>
                </View>
              )}
              <Pressable
                onPress={() => {
                  hapticTap();
                  router.push({
                    pathname: '/study/[target]',
                    params: { target: 'today', extra: '20' }
                  });
                }}
                style={({ pressed }) => [
                  styles.secondaryCta,
                  {
                    borderColor: colors.lineStrong,
                    backgroundColor: pressed ? colors.subtle : colors.surface
                  }
                ]}
              >
                <Plus size={15} color={colors.ink} />
                <Text
                  style={[
                    styles.secondaryCtaText,
                    { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
                  ]}
                >
                  Học thêm 20 từ mới
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Section heading + legend */}
        <View style={styles.sectionHeader}>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
          >
            Bộ thẻ của bạn
          </Text>
          <View style={styles.legendRow}>
            <Text style={[styles.legendText, { color: colors.easy }]}>Mới</Text>
            <Text style={[styles.legendSep, { color: colors.muted }]}>·</Text>
            <Text style={[styles.legendText, { color: colors.signal }]}>Học lại</Text>
            <Text style={[styles.legendSep, { color: colors.muted }]}>·</Text>
            <Text style={[styles.legendText, { color: colors.accent }]}>Đến hạn</Text>
          </View>
        </View>

        {/* Folders & Decks */}
        {folders.map((folder) => {
          const childDecks = decks.filter((d) => d.folderId === folder.id);
          if (childDecks.length === 0 && folder.isDefault) return null;

          return (
            <View
              key={folder.id}
              style={[styles.folderCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
            >
              <Pressable
                onPress={() => {
                  if (childDecks.length === 0) return;
                  hapticTap();
                  router.push({
                    pathname: '/study/[target]',
                    params: { target: `folder:${folder.id}` }
                  });
                }}
                style={[styles.folderHeader, { borderBottomColor: colors.line, backgroundColor: colors.canvas }]}
              >
                <View style={styles.folderLeft}>
                  <View
                    style={[
                      styles.folderDot,
                      { backgroundColor: folder.color || colors.accent }
                    ]}
                  />
                  <Text
                    style={[
                      styles.folderTitle,
                      { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                    ]}
                    numberOfLines={1}
                  >
                    {folder.name}
                  </Text>
                </View>
                {childDecks.length > 0 && (
                  <Text style={[styles.folderAction, { color: colors.accent }]}>Ôn cả mục</Text>
                )}
              </Pressable>

              {childDecks.length === 0 ? (
                <View style={styles.emptyFolderRow}>
                  <Text style={[styles.emptyFolderText, { color: colors.muted }]}>
                    Chưa có bộ thẻ nào trong thư mục này.
                  </Text>
                </View>
              ) : (
                childDecks.map((deck, idx) => {
                  const counts = calculateDeckCounts(cards, deck.id, {
                    newCardsPerDay: deck.newCardsPerDay,
                    maxReviewsPerDay: deck.maxReviewsPerDay
                  });
                  return (
                    <DeckRow
                      key={deck.id}
                      deck={deck}
                      totalCards={counts.totalCards}
                      newCount={counts.newCount}
                      learnCount={counts.learnCount}
                      dueCount={counts.dueCount}
                      isFirst={idx === 0}
                      onPress={() =>
                        router.push({
                          pathname: '/deck/[id]',
                          params: { id: deck.id }
                        })
                      }
                      onStudyPress={() =>
                        router.push({
                          pathname: '/study/[target]',
                          params: { target: `deck:${deck.id}` }
                        })
                      }
                    />
                  );
                })
              )}
            </View>
          );
        })}

        {unfiledDecks.length > 0 && (
          <View
            style={[styles.folderCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
          >
            <View
              style={[styles.folderHeader, { borderBottomColor: colors.line, backgroundColor: colors.canvas }]}
            >
              <Text
                style={[
                  styles.folderTitle,
                  { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                ]}
              >
                Bộ thẻ khác
              </Text>
            </View>
            {unfiledDecks.map((deck, idx) => {
              const counts = calculateDeckCounts(cards, deck.id, {
                newCardsPerDay: deck.newCardsPerDay,
                maxReviewsPerDay: deck.maxReviewsPerDay
              });
              return (
                <DeckRow
                  key={deck.id}
                  deck={deck}
                  totalCards={counts.totalCards}
                  newCount={counts.newCount}
                  learnCount={counts.learnCount}
                  dueCount={counts.dueCount}
                  isFirst={idx === 0}
                  onPress={() =>
                    router.push({
                      pathname: '/deck/[id]',
                      params: { id: deck.id }
                    })
                  }
                  onStudyPress={() =>
                    router.push({
                      pathname: '/study/[target]',
                      params: { target: `deck:${deck.id}` }
                    })
                  }
                />
              );
            })}
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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  brandSeal: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  brandChar: {
    fontSize: 18
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    position: 'absolute',
    right: 4,
    bottom: 4
  },
  brandTitle: {
    fontSize: 16
  },
  dateText: {
    fontSize: 12,
    textTransform: 'capitalize'
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  streakText: {
    fontSize: 14,
    fontVariant: ['tabular-nums']
  },
  dailyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12
  },
  headline: {
    fontSize: 22,
    fontVariant: ['tabular-nums']
  },
  metaStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14
  },
  metaItem: {
    fontSize: 12,
    fontVariant: ['tabular-nums']
  },
  metaStrong: {
    fontWeight: '700'
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999
  },
  ctaBtn: {
    marginTop: 4,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  ctaText: {
    fontSize: 15,
    fontVariant: ['tabular-nums']
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4
  },
  doneTag: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  doneTagText: {
    fontSize: 13
  },
  secondaryCta: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  secondaryCtaText: {
    fontSize: 13
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 4
  },
  sectionTitle: {
    fontSize: 17
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600'
  },
  legendSep: {
    fontSize: 11
  },
  folderCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden'
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  folderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1
  },
  folderDot: {
    width: 8,
    height: 8,
    borderRadius: 99
  },
  folderTitle: {
    fontSize: 14
  },
  folderAction: {
    fontSize: 12,
    fontWeight: '600'
  },
  emptyFolderRow: {
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  emptyFolderText: {
    fontSize: 12
  }
});
