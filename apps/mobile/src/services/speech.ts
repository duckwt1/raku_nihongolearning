import * as Speech from 'expo-speech';

export function speakJapanese(text: string): void {
  const clean = text.trim();
  if (!clean) return;
  try {
    Speech.stop();
    Speech.speak(clean, {
      language: 'ja-JP',
      rate: 0.92,
      pitch: 1.0
    });
  } catch {
    // Ignore on platforms where TTS is unavailable
  }
}

export function stopJapaneseSpeech(): void {
  try {
    Speech.stop();
  } catch {
    // Ignore
  }
}
