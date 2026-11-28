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

const KANJI_EXTRACT_REGEX = /[\u4E00-\u9FAF\u3400-\u4DBF]/g;

/**
 * Extracts unique Kanji characters from a Japanese string in order of appearance.
 */
export function extractKanjiChars(text: string): string[] {
  if (!text) return [];
  const matches = text.match(KANJI_EXTRACT_REGEX);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

/**
 * Finds unique Kanji characters present in `texts` that are missing from both
 * SEED_KANJI and the user's custom Kanji cache.
 */
export function findMissingKanjiChars(
  texts: string[],
  customKanjiMap?: ReadonlyMap<string, Kanji>
): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const ch of extractKanjiChars(text)) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      if (!KANJI_BY_CHAR.has(ch) && !customKanjiMap?.has(ch)) {
        missing.push(ch);
      }
    }
  }
  return missing;
}

/**
 * Looks up a Kanji entry in the built-in seed dictionary first, then custom AI/user cache.
 */
export function getKanjiByChar(
  char: string,
  customKanjiMap?: ReadonlyMap<string, Kanji>
): Kanji | undefined {
  return KANJI_BY_CHAR.get(char) || customKanjiMap?.get(char);
}

/**
 * Computes Han-Viet breakdown for a word's Kanji characters using seed + custom Kanji maps.
 */
export function buildHanVietBreakdownForSurface(
  surface: string,
  customKanjiMap?: ReadonlyMap<string, Kanji>
): string[] {
  const matches = surface.match(KANJI_EXTRACT_REGEX);
  if (!matches) return [];
  const parts: string[] = [];
  for (const ch of matches) {
    const entry = getKanjiByChar(ch, customKanjiMap);
    const hv = entry?.hanViet?.[0]?.trim();
    if (hv) parts.push(hv.toUpperCase());
  }
  return parts;
}

/**
 * Finds all words containing a specific kanji character (seed dictionary + optional extra custom words).
 */
export function getWordsByKanji(char: string, extraWords?: Word[]): Word[] {
  const base = SEED_WORDS.filter((w) => w.kanji && w.kanji.includes(char));
  if (!extraWords || extraWords.length === 0) return base;

  const seen = new Set(base.map((w) => `${w.surface}::${w.readings[0] || ''}`));
  const combined = [...base];
  for (const w of extraWords) {
    if (!w || (!w.surface.includes(char) && !w.kanji?.includes(char))) continue;
    const key = `${w.surface}::${w.readings[0] || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(w);
  }
  return combined;
}
