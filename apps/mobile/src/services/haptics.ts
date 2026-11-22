import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const HAPTICS_STORAGE_KEY = 'raku.hapticsEnabled';

let hapticsEnabled = true;
let initialized = false;
const listeners = new Set<(enabled: boolean) => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(hapticsEnabled);
  }
}

export async function initHapticsPreference(): Promise<boolean> {
  if (initialized) return hapticsEnabled;
  initialized = true;
  try {
    const raw = await AsyncStorage.getItem(HAPTICS_STORAGE_KEY);
    if (raw === '0' || raw === 'false') {
      hapticsEnabled = false;
      notifyListeners();
    } else if (raw === '1' || raw === 'true') {
      hapticsEnabled = true;
      notifyListeners();
    }
  } catch {
    // Keep default enabled state if storage is unavailable
  }
  return hapticsEnabled;
}

export function getHapticsEnabled(): boolean {
  return hapticsEnabled;
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  hapticsEnabled = enabled;
  initialized = true;
  notifyListeners();
  try {
    await AsyncStorage.setItem(HAPTICS_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage persistence errors
  }
}

export function subscribeHapticsEnabled(listener: (enabled: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hapticTap(): void {
  if (!hapticsEnabled) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticSelect(): void {
  if (!hapticsEnabled) return;
  void Haptics.selectionAsync().catch(() => {});
}

export function hapticSuccess(): void {
  if (!hapticsEnabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticWarning(): void {
  if (!hapticsEnabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function hapticError(): void {
  if (!hapticsEnabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
