import { describe, expect, it } from 'vitest';
import type { Deck, Word } from '../models/schemas.js';
import type { StudyCard } from '../fsrs/studySession.js';
import {
  ArenaQuestionGenerationError,
  calculateArenaScore,
  countArenaEligibleWords,
  generateArenaQuiz,
  gradeArenaAnswer,
  normalizeArenaReading,
  rankArenaPlayers,
  selectArenaWords,
  splitMeaningAlternatives
} from './arenaQuiz.js';

function word(id: string, surface: string, meaningVi = `nghĩa ${id}`, reading = `よみ${id}`): Word {
  return {
    id,
    surface,
    readings: [reading],
    meaningVi,
    kanji: [],
    hanVietBreakdown: [],
    exampleIds: [],
    tags: []
  };
}

const neverShuffle = () => 0;

describe('arena quiz generation', () => {
  it('creates a four-choice Vietnamese-to-Japanese question with one correct option', () => {
    const [bundle] = generateArenaQuiz(
      [
        word('animal', '動物', 'động vật'),
        word('plant', '植物', 'thực vật'),
        word('building', '建物', 'tòa nhà'),
        word('shopping', '買い物', 'mua sắm')
      ],
      1,
      'vi-to-jp',
      neverShuffle
    );

    expect(bundle?.question.type).toBe('vi-to-jp');
    expect(bundle?.question.choices).toHaveLength(4);
    expect(bundle?.question.choices?.filter((choice) => choice.text === '動物')).toHaveLength(1);
    expect(bundle?.answerKey.correctChoiceId).toBe(
      bundle?.question.choices?.find((choice) => choice.text === bundle?.answerKey.answer)?.id
    );
    expect(JSON.stringify(bundle?.question)).not.toContain('correctChoiceId');
    expect(JSON.stringify(bundle?.question)).not.toContain('answerKey');
    expect(JSON.stringify(bundle?.question)).not.toContain('surface');
  });

  it('rejects a multiple-choice set when it cannot supply three distractors', () => {
    expect(() => generateArenaQuiz([word('a', '学校')], 1, 'vi-to-jp', neverShuffle))
      .toThrow(ArenaQuestionGenerationError);
  });

  it('uses valid words when legacy data is missing a reading, and skips them for reading questions', () => {
    const missingReading = { ...word('no-reading', '食事', 'bữa ăn'), readings: [] };
    expect(countArenaEligibleWords([missingReading], 'jp-to-meaning')).toBe(1);
    expect(countArenaEligibleWords([missingReading], 'jp-to-reading')).toBe(0);
    expect(generateArenaQuiz([missingReading], 1, 'jp-to-meaning', neverShuffle)[0]?.question.prompt).toBe('食事');
    expect(() => generateArenaQuiz([missingReading], 1, 'jp-to-reading', neverShuffle))
      .toThrow(ArenaQuestionGenerationError);
  });

  it('does not create questions when a word has no usable meaning or reading', () => {
    const incomplete = { ...word('incomplete', '語彙'), readings: [], meaningVi: '' };
    expect(countArenaEligibleWords([incomplete], 'mixed')).toBe(0);
    expect(() => generateArenaQuiz([incomplete], 1, 'mixed', neverShuffle))
      .toThrow(ArenaQuestionGenerationError);
  });

  it('creates typed question forms without converting them to multiple choice', () => {
    const source = [
      word('a', '勉強', 'học tập', 'べんきょう'),
      word('b', '学校', 'trường học', 'がっこう'),
      word('c', '先生', 'giáo viên', 'せんせい')
    ];
    const reading = generateArenaQuiz(source, 1, 'jp-to-reading', neverShuffle)[0];
    const meaning = generateArenaQuiz(source, 1, 'jp-to-meaning', neverShuffle)[0];

    expect(reading?.question.type).toBe('jp-to-reading');
    expect(reading?.question.choices).toBeUndefined();
    const readingWord = source.find((item) => item.surface === reading?.question.prompt)!;
    expect(reading?.answerKey.acceptedAnswers).toContain(readingWord.readings[0]);
    expect(meaning?.question.type).toBe('jp-to-meaning');
    expect(meaning?.question.choices).toBeUndefined();
    const meaningWord = source.find((item) => item.surface === meaning?.question.prompt)!;
    expect(meaning?.answerKey.acceptedAnswers).toContain(meaningWord.meaningVi);
  });

  it('selects no repeated vocabulary across the generated quiz', () => {
    const source = [
      word('same-1', '学校', 'trường học', 'がっこう'),
      word('same-2', '学校', 'trường học', 'がっこう'),
      word('animal', '動物', 'động vật', 'どうぶつ')
    ];
    const quiz = generateArenaQuiz(source, 2, 'mixed', neverShuffle);
    expect(new Set(quiz.map(({ answerKey }) => answerKey.readings[0])).size).toBe(2);
  });

  it('selects vocabulary by source and deduplicates imported copies', () => {
    const cards: StudyCard[] = [
      { ...({} as StudyCard), id: 'a', type: 'word', deckId: 'mine', word: word('school', '学校') },
      { ...({} as StudyCard), id: 'b', type: 'word', deckId: 'community', word: word('school', '学校') },
      { ...({} as StudyCard), id: 'c', type: 'word', deckId: 'mine', word: word('animal', '動物') }
    ];
    const decks = [
      { id: 'mine', origin: 'owned' },
      { id: 'community', origin: 'community' }
    ] as Deck[];

    expect(selectArenaWords(cards, decks, 'owned').map((item) => item.id)).toEqual(['school', 'animal']);
    expect(selectArenaWords(cards, decks, 'community').map((item) => item.id)).toEqual(['school']);
    expect(selectArenaWords(cards, decks, 'all')).toHaveLength(2);
  });
});

describe('arena answer grading and scoring', () => {
  it('accepts hiragana, katakana, and half-width katakana while preserving reading marks', () => {
    const key = {
      answer: 'べんきょう',
      acceptedAnswers: ['べんきょう'],
      readings: ['べんきょう'],
      meanings: [],
      explanationVi: ''
    };
    expect(gradeArenaAnswer('jp-to-reading', key, ' ベンキョウ ')).toBe(true);
    expect(gradeArenaAnswer('jp-to-reading', key, 'ﾍﾞﾝｷｮｳ')).toBe(true);
    expect(gradeArenaAnswer('jp-to-reading', key, 'べんきよう')).toBe(false);
    expect(gradeArenaAnswer('jp-to-reading', key, 'へんきょう')).toBe(false);
    expect(normalizeArenaReading(' コーヒー ')).toBe('こーひー');
    expect(normalizeArenaReading('べん\u3000きょう\u200B')).toBe('べんきょう');
  });

  it('accepts listed Vietnamese meanings after Unicode, whitespace, and case normalization', () => {
    const key = {
      answer: 'trường học; học đường',
      acceptedAnswers: ['trường học', 'học đường'],
      readings: [],
      meanings: ['trường học', 'học đường'],
      explanationVi: ''
    };
    expect(gradeArenaAnswer('jp-to-meaning', key, '  HỌC   ĐƯỜNG  ')).toBe(true);
    expect(gradeArenaAnswer('jp-to-meaning', key, 'truong hoc')).toBe(false);
    expect(gradeArenaAnswer('jp-to-meaning', key, 'học đường.')).toBe(true);
    expect(gradeArenaAnswer('jp-to-meaning', key, 'học đường!')).toBe(true);
  });

  it('splits meaning alternatives by commas, ideographic commas, and slashes', () => {
    const alternatives = splitMeaningAlternatives('trường học、học đường / viện đào tạo; cơ sở giáo dục');
    expect(alternatives).toEqual([
      'trường học、học đường / viện đào tạo; cơ sở giáo dục',
      'trường học',
      'học đường',
      'viện đào tạo',
      'cơ sở giáo dục'
    ]);
  });

  it.each([
    [0, 1000],
    [3_000, 800],
    [7_000, 530],
    [10_000, 330],
    [15_000, 300]
  ])('scores a correct response at %s ms as %s', (timeMs, expected) => {
    expect(calculateArenaScore(true, timeMs, 15)).toBe(expected);
  });

  it('awards zero to wrong, missing, or late answers', () => {
    expect(calculateArenaScore(false, 0, 15)).toBe(0);
    expect(calculateArenaScore(true, 15_001, 15)).toBe(300);
    expect(calculateArenaScore(true, 16_001, 15)).toBe(0);
  });

  it('breaks score ties using the total response time for correct answers', () => {
    const ranked = rankArenaPlayers([
      { uid: 'slower', nickname: 'Chậm', score: 1_000, correctCount: 1, totalCorrectResponseMs: 2_000 },
      { uid: 'faster', nickname: 'Nhanh', score: 1_000, correctCount: 1, totalCorrectResponseMs: 1_000 }
    ]);
    expect(ranked.map((player) => player.uid)).toEqual(['faster', 'slower']);
  });
});
