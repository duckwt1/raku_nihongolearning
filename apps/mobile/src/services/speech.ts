import * as Speech from 'expo-speech';

export function speakJapanese(
  text: string,
  options: { rate?: number; onDone?: () => void } = {}
): void {
  const clean = text.trim();
  if (!clean) return;
  try {
    Speech.stop();
    Speech.speak(clean, {
      language: 'ja-JP',
      rate: options.rate ?? 0.92,
      pitch: 1.0,
      onDone: options.onDone,
      onError: options.onDone
    });
  } catch {
    options.onDone?.();
  }
}

export function stopJapaneseSpeech(): void {
  try {
    Speech.stop();
  } catch {
    // Ignore
  }
}
