import { normalizeKana } from '../text/normalize.js';

export interface GradeReadingResult {
  isCorrect: boolean;
  normalizedInput: string;
  matchedReading?: string;
  acceptableReadings: string[];
}

/**
 * Grades user reading input against a list of acceptable readings for a word.
 * Automatically normalizes:
 * - Trims whitespace
 * - Converts Katakana to Hiragana (so user typing katakana or hiragana is graded fairly)
 * - Checks all acceptable readings (e.g. 預かる -> あずかる)
 */
export function gradeReadingAnswer(
  userInput: string,
  acceptableReadings: string[]
): GradeReadingResult {
  const normalizedInput = normalizeKana(userInput);
  const normalizedAcceptable = acceptableReadings.map((r) => ({
    original: r,
    normalized: normalizeKana(r)
  }));

  const match = normalizedAcceptable.find(
    (item) => item.normalized === normalizedInput && normalizedInput.length > 0
  );

  return {
    isCorrect: Boolean(match),
    normalizedInput,
    matchedReading: match ? match.original : undefined,
    acceptableReadings
  };
}
