import seedKanji from './seed-kanji.json';
import seedWords from './seed-words.json';
import seedSentences from './seed-sentences.json';
import type { Kanji, Word, Sentence } from '../models/schemas.js';

export const SEED_KANJI = seedKanji as Kanji[];
export const SEED_WORDS = seedWords as Word[];
export const SEED_SENTENCES = seedSentences as Sentence[];

// Fast indexed lookups
export const KANJI_BY_CHAR = new Map<string, Kanji>(SEED_KANJI.map((k) => [k.char, k]));
export const WORDS_BY_ID = new Map<string, Word>(SEED_WORDS.map((w) => [w.id, w]));
export const WORDS_BY_SURFACE = new Map<string, Word[]>();
for (const w of SEED_WORDS) {
  const existing = WORDS_BY_SURFACE.get(w.surface) || [];
  existing.push(w);
  WORDS_BY_SURFACE.set(w.surface, existing);
}
export const SENTENCES_BY_ID = new Map<string, Sentence>(SEED_SENTENCES.map((s) => [s.id, s]));

/**
 * Finds all words containing a specific kanji character.
 */
export function getWordsByKanji(char: string): Word[] {
  return SEED_WORDS.filter((w) => w.kanji && w.kanji.includes(char));
}
