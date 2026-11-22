import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_PREF_KEY = 'raku_mobile_daily_reminder_v1';

export interface DailyReminderSettings {
  enabled: boolean;
  hour: number;
  minute: number;
}

const DEFAULT_REMINDER: DailyReminderSettings = {
  enabled: false,
  hour: 20,
  minute: 0
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

export async function loadReminderSettings(): Promise<DailyReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_PREF_KEY);
    if (!raw) return DEFAULT_REMINDER;
    const parsed = JSON.parse(raw) as Partial<DailyReminderSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      hour: typeof parsed.hour === 'number' ? parsed.hour : 20,
      minute: typeof parsed.minute === 'number' ? parsed.minute : 0
    };
  } catch {
    return DEFAULT_REMINDER;
  }
}

async function saveReminderSettings(settings: DailyReminderSettings): Promise<void> {
  await AsyncStorage.setItem(REMINDER_PREF_KEY, JSON.stringify(settings));
}

export async function enableDailyReminder(
  hour: number,
  minute: number
): Promise<{ granted: boolean; settings: DailyReminderSettings }> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    const disabled = { enabled: false, hour, minute };
    await saveReminderSettings(disabled);
    return { granted: false, settings: disabled };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('study-reminders', {
      name: 'Nhắc ôn tập hàng ngày',
      importance: Notifications.AndroidImportance.DEFAULT
    });
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Đến giờ ôn tiếng Nhật',
      body: 'Dành 5 phút ôn thẻ đến hạn để giữ chuỗi học hôm nay.',
      sound: true
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: Platform.OS === 'android' ? 'study-reminders' : undefined
    }
  });

  const next = { enabled: true, hour, minute };
  await saveReminderSettings(next);
  return { granted: true, settings: next };
}

export async function disableDailyReminder(
  hour = 20,
  minute = 0
): Promise<DailyReminderSettings> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  const next = { enabled: false, hour, minute };
  await saveReminderSettings(next);
  return next;
}
