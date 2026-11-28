/**
 * Expo Go–compatible Speech-to-Text abstraction.
 * Keeps native builds clean without requiring a custom native plugin while
 * guiding users to the OS Japanese keyboard microphone (iOS/Android dictation).
 */
export interface MobileSpeechRecognitionInfo {
  isNativeSupported: boolean;
  hintVi: string;
}

export function getMobileSpeechRecognitionInfo(): MobileSpeechRecognitionInfo {
  return {
    isNativeSupported: false,
    hintVi: 'Chạm ô nhập rồi bấm biểu tượng Micro trên bàn phím tiếng Nhật (iOS/Android) để nói trực tiếp.'
  };
}
