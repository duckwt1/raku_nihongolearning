import { describe, expect, it } from 'vitest';
import {
  halfWidthKatakanaToFullWidth,
  katakanaToHiragana,
  normalizeKana,
  normalizeNfc
} from './normalize.js';

describe('normalizeNfc', () => {
  it('normalizes Vietnamese combining accent marks correctly', () => {
    // Combining accent test (NFD vs NFC)
    const decomposed = 'đo\u0300'; // đ + o + grave accent
    expect(normalizeNfc(decomposed)).toBe('đò');
  });

  it('handles empty string', () => {
    expect(normalizeNfc('')).toBe('');
  });
});

describe('halfWidthKatakanaToFullWidth', () => {
  it('converts basic half-width katakana', () => {
    expect(halfWidthKatakanaToFullWidth('ｱｽﾞｶﾙ')).toBe('アズカル');
  });

  it('converts half-width kana with dakuten and handakuten', () => {
    expect(halfWidthKatakanaToFullWidth('ｶﾞｯｺｳ')).toBe('ガッコウ');
    expect(halfWidthKatakanaToFullWidth('ﾊﾟﾝ')).toBe('パン');
  });
});

describe('katakanaToHiragana', () => {
  it('converts katakana to hiragana', () => {
    expect(katakanaToHiragana('アズカル')).toBe('あずかる');
    expect(katakanaToHiragana('トウキョウ')).toBe('とうきょう');
  });

  it('preserves prolonged sound mark ー and kanji', () => {
    expect(katakanaToHiragana('コーヒー')).toBe('こーひー');
    expect(katakanaToHiragana('東京タワー')).toBe('東京たわー');
  });
});

describe('normalizeKana', () => {
  it('removes spaces and standardizes user kana input', () => {
    expect(normalizeKana(' あずかる ')).toBe('あずかる');
    expect(normalizeKana('あ　ず　か　る')).toBe('あずかる');
    expect(normalizeKana('アズカル')).toBe('あずかる');
    expect(normalizeKana('ｱｽﾞｶﾙ')).toBe('あずかる');
  });
});
