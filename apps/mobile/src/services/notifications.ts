import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_PREF_KEY = 'raku_mobile_daily_reminder_v2';
const LEGACY_REMINDER_PREF_KEY = 'raku_mobile_daily_reminder_v1';
const LAST_SYNCED_OPEN_DATE_KEY = 'raku_mobile_reminder_last_open_date_v1';
const EVENING_LOOKAHEAD_DAYS = 14;
const ANDROID_CHANNEL_ID = 'study-reminders';

export interface DailyReminderSettings {
  enabled: boolean;
  morningHour: number;
  morningMinute: number;
  eveningHour: number;
  eveningMinute: number;
}

export const DEFAULT_REMINDER: DailyReminderSettings = {
  enabled: false,
  morningHour: 7,
  morningMinute: 30,
  eveningHour: 20,
  eveningMinute: 30
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export async function loadReminderSettings(): Promise<DailyReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_PREF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyReminderSettings>;
      return {
        enabled: Boolean(parsed.enabled),
        morningHour:
          typeof parsed.morningHour === 'number'
            ? parsed.morningHour
            : DEFAULT_REMINDER.morningHour,
        morningMinute:
          typeof parsed.morningMinute === 'number'
            ? parsed.morningMinute
            : DEFAULT_REMINDER.morningMinute,
        eveningHour:
          typeof parsed.eveningHour === 'number'
            ? parsed.eveningHour
            : DEFAULT_REMINDER.eveningHour,
        eveningMinute:
          typeof parsed.eveningMinute === 'number'
            ? parsed.eveningMinute
            : DEFAULT_REMINDER.eveningMinute
      };
    }

    // Migrate legacy v1 settings (preserve enabled flag, upgrade morning to 07:30 + evening check)
    const legacyRaw = await AsyncStorage.getItem(LEGACY_REMINDER_PREF_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as {
        enabled?: boolean;
        hour?: number;
        minute?: number;
      };
      const migrated: DailyReminderSettings = {
        enabled: Boolean(legacy.enabled),
        morningHour: DEFAULT_REMINDER.morningHour,
        morningMinute: DEFAULT_REMINDER.morningMinute,
        eveningHour:
          typeof legacy.hour === 'number' && legacy.hour >= 18
            ? legacy.hour
            : DEFAULT_REMINDER.eveningHour,
        eveningMinute:
          typeof legacy.hour === 'number' && legacy.hour >= 18 && typeof legacy.minute === 'number'
            ? legacy.minute
            : DEFAULT_REMINDER.eveningMinute
      };
      await saveReminderSettings(migrated);
      return migrated;
    }

    return DEFAULT_REMINDER;
  } catch {
    return DEFAULT_REMINDER;
  }
}

async function saveReminderSettings(settings: DailyReminderSettings): Promise<void> {
  await AsyncStorage.setItem(REMINDER_PREF_KEY, JSON.stringify(settings));
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Nhắc ôn tập hàng ngày',
    importance: Notifications.AndroidImportance.DEFAULT
  });
}

/**
 * Schedules:
 * 1) Daily morning reminder (default 07:30)
 * 2) Rolling 14-day evening catch-up reminders (default 20:30)
 *    - When `openedToday` is true (user has opened the app today), tonight (dayOffset = 0)
 *      is skipped so the evening catch-up reminder only fires on days the user hasn't opened the app.
 */
async function scheduleSmartNotifications(
  settings: DailyReminderSettings,
  openedToday: boolean
): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const channelId = Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined;

  // 1. Morning daily reminder (default 07:30)
  await Notifications.scheduleNotificationAsync({
    identifier: 'raku-morning-daily',
    content: {
      title: 'Chào buổi sáng! Đến giờ ôn tiếng Nhật',
      body: 'Dành 5 phút đầu ngày ôn thẻ đến hạn để giữ chuỗi học nhé.',
      sound: true
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: settings.morningHour,
      minute: settings.morningMinute,
      channelId
    }
  });

  // 2. Evening catch-up reminders for upcoming days where user hasn't opened the app
  const now = new Date();
  const startDayOffset = openedToday ? 1 : 0;

  for (let offset = startDayOffset; offset <= EVENING_LOOKAHEAD_DAYS; offset++) {
    const fireAt = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
      settings.eveningHour,
      settings.eveningMinute,
      0,
      0
    );

    if (fireAt.getTime() <= now.getTime() + 30_000) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: `raku-evening-catchup-${offset}`,
      content: {
        title: 'Hôm nay bạn chưa vào học!',
        body: 'Còn kịp vài phút buổi tối để ôn bài và giữ chuỗi học hôm nay nhé.',
        sound: true
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId
      }
    });
  }
}

export async function enableDailyReminder(
  morningHour = DEFAULT_REMINDER.morningHour,
  morningMinute = DEFAULT_REMINDER.morningMinute,
  eveningHour = DEFAULT_REMINDER.eveningHour,
  eveningMinute = DEFAULT_REMINDER.eveningMinute
): Promise<{ granted: boolean; settings: DailyReminderSettings }> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    const disabled: DailyReminderSettings = {
      enabled: false,
      morningHour,
      morningMinute,
      eveningHour,
      eveningMinute
    };
    await saveReminderSettings(disabled);
    return { granted: false, settings: disabled };
  }

  const next: DailyReminderSettings = {
    enabled: true,
    morningHour,
    morningMinute,
    eveningHour,
    eveningMinute
  };

  // User is currently inside the app today -> skip tonight's catch-up, queue tomorrow onwards
  await scheduleSmartNotifications(next, true);
  await saveReminderSettings(next);
  await AsyncStorage.setItem(LAST_SYNCED_OPEN_DATE_KEY, getLocalDateKey()).catch(() => {});
  return { granted: true, settings: next };
}

export async function disableDailyReminder(
  current: Partial<DailyReminderSettings> = {}
): Promise<DailyReminderSettings> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  const next: DailyReminderSettings = {
    enabled: false,
    morningHour: current.morningHour ?? DEFAULT_REMINDER.morningHour,
    morningMinute: current.morningMinute ?? DEFAULT_REMINDER.morningMinute,
    eveningHour: current.eveningHour ?? DEFAULT_REMINDER.eveningHour,
    eveningMinute: current.eveningMinute ?? DEFAULT_REMINDER.eveningMinute
  };
  await saveReminderSettings(next);
  return next;
}

/**
 * Call whenever the app launches or returns to foreground.
 * If reminders are enabled, marks today as visited and cancels tonight's catch-up reminder
 * while keeping the 07:30 daily reminder and tomorrow's evening catch-up scheduled.
 */
export async function syncSmartRemindersOnAppOpen(): Promise<void> {
  try {
    const settings = await loadReminderSettings();
    if (!settings.enabled) return;

    const today = getLocalDateKey();
    const lastSynced = await AsyncStorage.getItem(LAST_SYNCED_OPEN_DATE_KEY);
    if (lastSynced === today) return;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await scheduleSmartNotifications(settings, true);
    await AsyncStorage.setItem(LAST_SYNCED_OPEN_DATE_KEY, today);
  } catch {
    // Non-fatal: skip quietly if notifications aren't supported on the current runtime
  }
}
