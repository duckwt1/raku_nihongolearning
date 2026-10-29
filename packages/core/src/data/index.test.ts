import { describe, expect, it } from 'vitest';
import {
  SEED_KANJI,
  SEED_WORDS,
  SEED_SENTENCES,
  KANJI_BY_CHAR,
  WORDS_BY_ID,
  getWordsByKanji
} from './index.js';

describe('Seed Data Integrity', () => {
  it('loads kanji, words, and sentences successfully', () => {
    expect(SEED_KANJI.length).toBeGreaterThan(500);
    expect(SEED_WORDS.length).toBeGreaterThan(800);
    expect(SEED_SENTENCES.length).toBeGreaterThan(800);
    expect(WORDS_BY_ID.size).toBe(SEED_WORDS.length);
  });

  it('maps kanji by character accurately', () => {
    const kanjiDan = KANJI_BY_CHAR.get('男');
    expect(kanjiDan).toBeDefined();
    expect(kanjiDan?.hanViet).toContain('NAM');

    const kanjiSei = KANJI_BY_CHAR.get('生');
    expect(kanjiSei).toBeDefined();
    expect(kanjiSei?.hanViet).toContain('SINH');
  });

  it('retrieves words linked to a specific kanji', () => {
    const seiWords = getWordsByKanji('生');
    expect(seiWords.length).toBeGreaterThan(0);
    // Every returned word must contain 生 in its kanji list
    for (const w of seiWords) {
      expect(w.kanji).toContain('生');
    }
  });

  it('ensures each word with kanji has hanVietBreakdown of matching length', () => {
    for (const word of SEED_WORDS) {
      if (word.kanji && word.kanji.length > 0) {
        expect(word.hanVietBreakdown?.length).toBe(word.kanji.length);
        // Han Viet should not contain '?'
        for (const hv of word.hanVietBreakdown || []) {
          expect(hv).not.toBe('?');
        }
      }
    }
  });

  it('ensures sentence examples link to existing sentences', () => {
    const firstWord = SEED_WORDS.find((w) => w.exampleIds && w.exampleIds.length > 0);
    expect(firstWord).toBeDefined();
    const sentenceId = firstWord!.exampleIds[0];
    const sentence = SEED_SENTENCES.find((s) => s.id === sentenceId);
    expect(sentence).toBeDefined();
    expect(sentence?.tokens.length).toBeGreaterThan(0);
  });
});
