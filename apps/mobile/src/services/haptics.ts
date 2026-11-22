import * as Haptics from 'expo-haptics';

export function hapticTap(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticSelect(): void {
  void Haptics.selectionAsync().catch(() => {});
}

export function hapticSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticWarning(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function hapticError(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
