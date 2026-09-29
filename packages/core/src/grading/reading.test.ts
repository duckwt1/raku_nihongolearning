import { describe, expect, it } from 'vitest';
import { gradeReadingAnswer } from './reading.js';

describe('gradeReadingAnswer', () => {
  const acceptable = ['あずかる', 'あづかる'];

  it('accepts exact hiragana match', () => {
    const res = gradeReadingAnswer('あずかる', acceptable);
    expect(res.isCorrect).toBe(true);
    expect(res.matchedReading).toBe('あずかる');
  });

  it('accepts alternative valid reading', () => {
    const res = gradeReadingAnswer('あづかる', acceptable);
    expect(res.isCorrect).toBe(true);
    expect(res.matchedReading).toBe('あづかる');
  });

  it('accepts katakana input by converting to hiragana', () => {
    const res = gradeReadingAnswer('アズカル', acceptable);
    expect(res.isCorrect).toBe(true);
    expect(res.matchedReading).toBe('あずかる');
  });

  it('ignores surrounding whitespace and fullwidth spaces', () => {
    const res = gradeReadingAnswer('  あずかる　', acceptable);
    expect(res.isCorrect).toBe(true);
  });

  it('rejects incorrect reading', () => {
    const res = gradeReadingAnswer('たずねる', acceptable);
    expect(res.isCorrect).toBe(false);
    expect(res.matchedReading).toBeUndefined();
  });

  it('rejects empty input', () => {
    const res = gradeReadingAnswer('', acceptable);
    expect(res.isCorrect).toBe(false);
  });
});
