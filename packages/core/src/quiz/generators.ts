import { Question, Word, Kanji } from '../models/schemas.js';
import { SEED_WORDS, SEED_KANJI, KANJI_BY_CHAR, getWordsByKanji } from '../data/index.js';

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

/**
 * Generates K2: Chọn nghĩa (Meaning selection)
 * Distractors chosen from words sharing the same kanji, or same part of speech
 */
export function generateK2Question(word: Word): Question {
  const correctMeaning = word.meaningVi;
  const distractorCandidates: string[] = [];

  // 1. Try words sharing the same kanji
  if (word.kanji && word.kanji.length > 0) {
    const firstKanji = word.kanji[0]!;
    const relatedWords = getWordsByKanji(firstKanji).filter((w) => w.id !== word.id);
    for (const rw of relatedWords) {
      if (rw.meaningVi !== correctMeaning && !distractorCandidates.includes(rw.meaningVi)) {
        distractorCandidates.push(rw.meaningVi);
      }
    }
  }

  // 2. Fallback to same POS / JLPT if needed
  if (distractorCandidates.length < 3) {
    const otherWords = SEED_WORDS.filter(
      (w) => w.id !== word.id && w.meaningVi !== correctMeaning && !distractorCandidates.includes(w.meaningVi)
    );
    for (const ow of shuffle(otherWords)) {
      distractorCandidates.push(ow.meaningVi);
      if (distractorCandidates.length >= 5) break;
    }
  }

  const choices = shuffle([correctMeaning, ...distractorCandidates.slice(0, 3)]);

  return {
    id: `q_k2_${word.id}`,
    type: 'K2',
    prompt: `Nghĩa đúng của từ「${word.surface}」(${word.readings.join(', ')}) là gì?`,
    choices,
    answer: correctMeaning,
    explanationVi: `${word.surface} có nghĩa là: ${correctMeaning}.${
      word.hanVietBreakdown?.length ? ` Hán Việt: ${word.hanVietBreakdown.join(' ')}.` : ''
    }`,
    kanjiRefs: word.kanji || [],
    wordRefs: [word.id],
    grammarRefs: [],
    difficulty: 2,
    provenance: {
      origin: 'seed',
      verified: true
    }
  };
}

/**
 * Generates K3: Kanji chung (Common kanji in 2-3 words)
 * Distractors chosen from lookalike kanji
 */
export function generateK3Question(targetKanjiChar: string): Question | null {
  const kanji = KANJI_BY_CHAR.get(targetKanjiChar);
  if (!kanji) return null;

  const wordsWithKanji = getWordsByKanji(targetKanjiChar);
  if (wordsWithKanji.length < 2) return null;

  const sampleWords = shuffle(wordsWithKanji).slice(0, 3);
  const wordsDisplay = sampleWords.map((w) => w.surface).join('、');

  const distractors: string[] = [];
  // 1. Lookalike kanji
  if (kanji.lookalikes && kanji.lookalikes.length > 0) {
    for (const lk of kanji.lookalikes) {
      if (lk !== targetKanjiChar && !distractors.includes(lk)) {
        distractors.push(lk);
      }
    }
  }

  // 2. Random kanji from seed
  if (distractors.length < 3) {
    const otherKanji = SEED_KANJI.filter((k) => k.char !== targetKanjiChar && !distractors.includes(k.char));
    for (const ok of shuffle(otherKanji)) {
      distractors.push(ok.char);
      if (distractors.length >= 3) break;
    }
  }

  const choices = shuffle([targetKanjiChar, ...distractors.slice(0, 3)]);

  return {
    id: `q_k3_${targetKanjiChar}`,
    type: 'K3',
    prompt: `Chữ Hán nào xuất hiện chung trong các từ sau:「${wordsDisplay}」?`,
    choices,
    answer: targetKanjiChar,
    explanationVi: `Chữ「${targetKanjiChar}」(Hán Việt: ${kanji.hanViet.join('/')}) xuất hiện chung trong cả các từ: ${wordsDisplay}.`,
    kanjiRefs: [targetKanjiChar],
    wordRefs: sampleWords.map((w) => w.id),
    grammarRefs: [],
    difficulty: 2,
    provenance: {
      origin: 'seed',
      verified: true
    }
  };
}

/**
 * Generates K4: Hán Việt <-> Kanji
 */
export function generateK4Question(kanji: Kanji): Question {
  const hanViet = kanji.hanViet[0] || 'CHƯA RÕ';
  const distractors: string[] = [];

  // Lookalikes first
  if (kanji.lookalikes && kanji.lookalikes.length > 0) {
    for (const lk of kanji.lookalikes) {
      if (lk !== kanji.char && !distractors.includes(lk)) {
        distractors.push(lk);
      }
    }
  }

  // Fill up to 3 distractors
  if (distractors.length < 3) {
    const other = SEED_KANJI.filter((k) => k.char !== kanji.char && !distractors.includes(k.char));
    for (const ok of shuffle(other)) {
      distractors.push(ok.char);
      if (distractors.length >= 3) break;
    }
  }

  const choices = shuffle([kanji.char, ...distractors.slice(0, 3)]);

  return {
    id: `q_k4_${kanji.char}`,
    type: 'K4',
    prompt: `Chữ Hán nào có âm Hán Việt là「${hanViet}」?`,
    choices,
    answer: kanji.char,
    explanationVi: `Chữ「${kanji.char}」có âm Hán Việt là ${kanji.hanViet.join(', ')}. Nghĩa: ${kanji.meaningVi}.`,
    kanjiRefs: [kanji.char],
    wordRefs: [],
    grammarRefs: [],
    difficulty: 1,
    provenance: {
      origin: 'seed',
      verified: true
    }
  };
}
