import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, ChevronRight, Cloud, Download, RefreshCw, Smartphone, User as UserIcon } from 'lucide-react-native';
import { DAILY_NEW_WORD_GOAL_OPTIONS } from '@raku/sync';
import { useRakuTheme, type ThemePreference } from '@/providers/ThemeProvider';
import { useStudy } from '@/providers/StudyProvider';
import { StudyHeatmapNative } from '@/components/StudyHeatmapNative';
import {
  getHapticsEnabled,
  hapticSelect,
  hapticTap,
  initHapticsPreference,
  setHapticsEnabled,
  subscribeHapticsEnabled
} from '@/services/haptics';
import {
  disableDailyReminder,
  enableDailyReminder,
  loadReminderSettings,
  type DailyReminderSettings
} from '@/services/notifications';

const REMINDER_PRESETS = [
  { label: '07:30', hour: 7, minute: 30 },
  { label: '12:30', hour: 12, minute: 30 },
  { label: '20:00', hour: 20, minute: 0 },
  { label: '21:30', hour: 21, minute: 30 }
] as const;

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, typography, preference, setPreference } = useRakuTheme();
  const {
    user,
    dailyGoal,
    pendingSyncCount,
    isSyncing,
    lastSyncMessage,
    dailyNewWords,
    currentStreak,
    longestStreak,
    setDailyGoal,
    syncNow,
    pullFromCloud
  } = useStudy();

  const [reminder, setReminder] = useState<DailyReminderSettings>({
    enabled: false,
    hour: 20,
    minute: 0
  });
  const [hapticsOn, setHapticsOn] = useState<boolean>(() => getHapticsEnabled());

  useEffect(() => {
    void loadReminderSettings().then(setReminder);
    void initHapticsPreference().then(setHapticsOn);
    return subscribeHapticsEnabled(setHapticsOn);
  }, []);

  const handleToggleHaptics = async (nextEnabled: boolean) => {
    await setHapticsEnabled(nextEnabled);
    if (nextEnabled) {
      hapticSelect();
    }
  };

  const handleToggleReminder = async (nextEnabled: boolean) => {
    hapticSelect();
    if (!nextEnabled) {
      const next = await disableDailyReminder(reminder.hour, reminder.minute);
      setReminder(next);
      return;
    }
    const res = await enableDailyReminder(reminder.hour, reminder.minute);
    setReminder(res.settings);
    if (!res.granted) {
      Alert.alert(
        'Chưa có quyền thông báo',
        'Hãy bật quyền thông báo cho Raku Nihongo trong Cài đặt thiết bị để nhận nhắc học.'
      );
    }
  };

  const handlePickReminderTime = async (hour: number, minute: number) => {
    hapticSelect();
    if (reminder.enabled) {
      const res = await enableDailyReminder(hour, minute);
      setReminder(res.settings);
    } else {
      setReminder({ enabled: false, hour, minute });
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text
          style={[
            styles.pageTitle,
            { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
          ]}
        >
          Hồ sơ
        </Text>

        {/* Account row */}
        <Pressable
          onPress={() => {
            hapticTap();
            router.push('/auth');
          }}
          style={({ pressed }) => [
            styles.card,
            styles.accountRow,
            {
              backgroundColor: pressed ? colors.subtle : colors.surface,
              borderColor: colors.line
            }
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
            <UserIcon size={20} color={colors.accent} />
          </View>
          <View style={styles.accountInfo}>
            <Text
              style={[
                styles.accountTitle,
                { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
              ]}
              numberOfLines={1}
            >
              {user
                ? user.isAnonymous
                  ? 'Khách ẩn danh'
                  : user.email || 'Đã đăng nhập'
                : 'Đăng nhập để đồng bộ'}
            </Text>
            <Text style={[styles.accountSub, { color: colors.muted }]}>
              {user ? 'Chạm để quản lý tài khoản' : 'Đồng bộ tiến độ giữa Web và Mobile'}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </Pressable>

        {/* Study Heatmap */}
        <StudyHeatmapNative
          counts={dailyNewWords}
          goal={dailyGoal}
          currentStreak={currentStreak}
          longestStreak={longestStreak}
        />

        {/* Daily Goal */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text
            style={[
              styles.cardTitle,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
          >
            Mục tiêu từ mới mỗi ngày
          </Text>
          <Text style={[styles.cardSub, { color: colors.muted }]}>
            Đạt đủ số từ mới này để tính một ngày giữ chuỗi.
          </Text>
          <View style={styles.chipRow}>
            {DAILY_NEW_WORD_GOAL_OPTIONS.map((goal) => {
              const active = dailyGoal === goal;
              return (
                <Pressable
                  key={goal}
                  onPress={() => {
                    hapticSelect();
                    setDailyGoal(goal);
                  }}
                  style={[
                    styles.choiceChip,
                    {
                      backgroundColor: active ? colors.accentSoft : colors.canvas,
                      borderColor: active ? colors.accent : colors.line
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      {
                        color: active ? colors.accent : colors.muted,
                        fontFamily: typography.fontFamily.viNative.semibold
                      }
                    ]}
                  >
                    {goal} từ/ngày
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Daily Native Reminder */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.switchRow}>
            <View style={styles.switchTitleWrap}>
              <View style={styles.inlineTitle}>
                <Bell size={16} color={colors.accent} />
                <Text
                  style={[
                    styles.cardTitle,
                    { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                  ]}
                >
                  Nhắc ôn bài mỗi ngày
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.muted }]}>
                Thông báo bản địa nhắc nhẹ để không đứt chuỗi học.
              </Text>
            </View>
            <Switch
              value={reminder.enabled}
              onValueChange={(v) => void handleToggleReminder(v)}
              trackColor={{ false: colors.lineStrong, true: colors.accent }}
            />
          </View>

          <View style={styles.chipRow}>
            {REMINDER_PRESETS.map((slot) => {
              const active = reminder.hour === slot.hour && reminder.minute === slot.minute;
              return (
                <Pressable
                  key={slot.label}
                  onPress={() => void handlePickReminderTime(slot.hour, slot.minute)}
                  style={[
                    styles.choiceChip,
                    {
                      backgroundColor: active ? colors.accentSoft : colors.canvas,
                      borderColor: active ? colors.accent : colors.line
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      {
                        color: active ? colors.accent : colors.muted,
                        fontFamily: typography.fontFamily.viNative.semibold
                      }
                    ]}
                  >
                    {slot.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Theme Mode */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text
            style={[
              styles.cardTitle,
              { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
            ]}
          >
            Giao diện
          </Text>
          <View style={styles.chipRow}>
            {(
              [
                { id: 'system', label: 'Hệ thống' },
                { id: 'light', label: 'Giấy sáng' },
                { id: 'dark', label: 'Tối dịu' }
              ] as Array<{ id: ThemePreference; label: string }>
            ).map((opt) => {
              const active = preference === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    hapticSelect();
                    setPreference(opt.id);
                  }}
                  style={[
                    styles.choiceChip,
                    {
                      backgroundColor: active ? colors.accentSoft : colors.canvas,
                      borderColor: active ? colors.accent : colors.line
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      {
                        color: active ? colors.accent : colors.muted,
                        fontFamily: typography.fontFamily.viNative.semibold
                      }
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Haptics Toggle */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.switchRow}>
            <View style={styles.switchTitleWrap}>
              <View style={styles.inlineTitle}>
                <Smartphone size={16} color={colors.accent} />
                <Text
                  style={[
                    styles.cardTitle,
                    { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                  ]}
                >
                  Phản hồi rung
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.muted }]}>
                Rung nhẹ khi chạm nút và kiểm tra đáp án (luôn tắt khi vuốt thẻ).
              </Text>
            </View>
            <Switch
              value={hapticsOn}
              onValueChange={(v) => void handleToggleHaptics(v)}
              trackColor={{ false: colors.lineStrong, true: colors.accent }}
            />
          </View>
        </View>

        {/* Cloud Sync */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.switchRow}>
            <View style={styles.switchTitleWrap}>
              <View style={styles.inlineTitle}>
                <Cloud size={16} color={colors.accent} />
                <Text
                  style={[
                    styles.cardTitle,
                    { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
                  ]}
                >
                  Đồng bộ đám mây
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.muted }]}>
                {pendingSyncCount > 0
                  ? `${pendingSyncCount} lượt ôn đang chờ sao lưu.`
                  : 'Tiến độ lưu ngoại tuyến ngay trên thiết bị.'}
              </Text>
            </View>
          </View>

          <View style={styles.syncActions}>
            <Pressable
              disabled={isSyncing}
              onPress={() => {
                hapticTap();
                void syncNow();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: pressed ? colors.accentHover : colors.accent,
                  opacity: isSyncing ? 0.55 : 1
                }
              ]}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <RefreshCw size={15} color={colors.onAccent} />
              )}
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                ]}
              >
                Đồng bộ ngay
              </Text>
            </Pressable>

            <Pressable
              disabled={isSyncing}
              onPress={() => {
                hapticTap();
                void pullFromCloud();
              }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                {
                  borderColor: colors.lineStrong,
                  backgroundColor: pressed ? colors.subtle : colors.canvas,
                  opacity: isSyncing ? 0.55 : 1
                }
              ]}
            >
              <Download size={15} color={colors.ink} />
              <Text
                style={[
                  styles.secondaryBtnText,
                  { color: colors.ink, fontFamily: typography.fontFamily.viNative.semibold }
                ]}
              >
                Khôi phục
              </Text>
            </Pressable>
          </View>

          {lastSyncMessage && (
            <Text style={[styles.syncMessage, { color: colors.muted }]}>{lastSyncMessage}</Text>
          )}
        </View>
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
    gap: 14,
    paddingBottom: 32
  },
  pageTitle: {
    fontSize: 22
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  accountInfo: {
    flex: 1,
    gap: 2
  },
  accountTitle: {
    fontSize: 15
  },
  accountSub: {
    fontSize: 12
  },
  cardTitle: {
    fontSize: 15
  },
  cardSub: {
    fontSize: 12,
    lineHeight: 18
  },
  inlineTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  switchTitleWrap: {
    flex: 1,
    gap: 2
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2
  },
  choiceChip: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  choiceChipText: {
    fontSize: 12,
    fontVariant: ['tabular-nums']
  },
  syncActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  primaryBtnText: {
    fontSize: 13
  },
  secondaryBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  secondaryBtnText: {
    fontSize: 13
  },
  syncMessage: {
    fontSize: 12,
    marginTop: 2
  }
});
