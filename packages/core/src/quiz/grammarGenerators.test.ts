import { describe, expect, it } from 'vitest';
import type { Grammar, Question } from '../models/schemas.js';
import { SEED_GRAMMAR } from '../data/index.js';
import { GRAMMAR_BLANK_MARKER, validateGrammarExercise } from '../questions/validation.js';
import {
  extractGrammarKeys,
  findGrammarSpan,
  generateSeedGrammarExercises,
  tokenizeJapaneseSentence
} from './grammarGenerators.js';

const grammar: Grammar = {
  id: 'g_test',
  title: 'うちに (Trong lúc / Trong khi)',
  explanationVi: 'Diễn tả hành động tranh thủ làm gì trước khi trạng thái thay đổi.',
  examples: [
    { jp: '毎日話しているうちに、好きになりました。', vi: 'Trong lúc nói chuyện mỗi ngày, tôi đã thích cô ấy.' },
    { jp: '熱いうちに食べてください。', vi: 'Hãy ăn khi còn nóng.' }
  ],
  jlpt: 'N3'
};

const otherGrammar: Grammar[] = [
  { id: 'g_1', title: 'ために (Để / Vì)', explanationVi: '...', examples: [], jlpt: 'N3' },
  { id: 'g_2', title: 'ながら (Vừa... vừa...)', explanationVi: '...', examples: [], jlpt: 'N3' },
  { id: 'g_3', title: 'たびに (Mỗi lần)', explanationVi: '...', examples: [], jlpt: 'N3' }
];

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q_test',
    type: 'fill_blank',
    prompt: `毎日話している${GRAMMAR_BLANK_MARKER}、好きになりました。`,
    answer: 'うちに',
    choices: ['うちに', 'ために', 'ながら', 'たびに'],
    explanationVi: '...',
    kanjiRefs: [],
    wordRefs: [],
    grammarRefs: ['g_test'],
    grammarId: 'g_test',
    sourceExample: '毎日話しているうちに、好きになりました。',
    difficulty: 2,
    provenance: { origin: 'user', verified: true },
    ...overrides
  };
}

describe('grammar exercise helpers', () => {
  it('extracts grammar keys from titles', () => {
    expect(extractGrammarKeys('〜てからでないと・〜てからでなければ (Phải...)')).toEqual([
      'てからでないと',
      'てからでなければ'
    ]);
    expect(extractGrammarKeys('間・間に (Trong...)')).toEqual(['間', '間に']);
  });

  it('finds the grammar span inside an example sentence', () => {
    expect(findGrammarSpan(grammar.examples[0]!.jp, grammar.title)).toEqual({
      text: 'うちに',
      index: 7
    });
  });

  it('tokenizes Japanese sentences without relying on spaces', () => {
    const tokens = tokenizeJapaneseSentence('毎日話しているうちに、好きになりました。');
    expect(tokens.length).toBeGreaterThan(2);
    expect(tokens.join('')).toBe('毎日話しているうちに、好きになりました。');
  });

  it('generates fill_blank and order seed exercises that pass validation', () => {
    const exercises = generateSeedGrammarExercises(grammar, [grammar, ...otherGrammar]);

    expect(exercises.some((exercise) => exercise.type === 'fill_blank')).toBe(true);
    expect(exercises.some((exercise) => exercise.type === 'order')).toBe(true);

    for (const exercise of exercises) {
      expect(exercise.grammarId).toBe('g_test');
      const result = validateGrammarExercise(exercise);
      expect(result.valid, `${exercise.type}: ${result.errors.join(', ')}`).toBe(true);
    }

    const fill = exercises.find((exercise) => exercise.type === 'fill_blank')!;
    expect(fill.prompt).toContain(GRAMMAR_BLANK_MARKER);
    expect(fill.prompt.split(GRAMMAR_BLANK_MARKER)).toHaveLength(2);
  });

  it('generates only valid exercises across all seed grammar points', () => {
    const all = SEED_GRAMMAR.flatMap((item) =>
      generateSeedGrammarExercises(item, SEED_GRAMMAR)
    );
    expect(all.length).toBeGreaterThan(50);

    for (const exercise of all) {
      const result = validateGrammarExercise(exercise);
      expect(result.valid, `${exercise.id}: ${result.errors.join(', ')}`).toBe(true);
    }
  });
});

describe('validateGrammarExercise', () => {
  it('accepts a valid fill-blank question', () => {
    expect(validateGrammarExercise(makeQuestion()).valid).toBe(true);
  });

  it('rejects fill-blank without exactly one marker', () => {
    const result = validateGrammarExercise(
      makeQuestion({ prompt: '毎日話しているうちに、好きになりました。' })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain(GRAMMAR_BLANK_MARKER);
  });

  it('rejects when the filled sentence differs from the source example', () => {
    const result = validateGrammarExercise(
      makeQuestion({ prompt: `毎日話している${GRAMMAR_BLANK_MARKER}、好きになりました。`, answer: 'ために' })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('source example');
  });

  it('validates order tokens reconstructing the answer', () => {
    const valid = makeQuestion({
      type: 'order',
      prompt: 'Sắp xếp câu.',
      tokens: ['毎日', '話している', 'うちに', '、', '好きに', 'なりました。'],
      answer: '毎日話しているうちに、好きになりました。',
      choices: undefined
    });
    expect(validateGrammarExercise(valid).valid).toBe(true);

    const invalid = { ...valid, tokens: ['毎日', '話している'] };
    expect(validateGrammarExercise(invalid).valid).toBe(false);
  });

  it('requires at least 3 choices for grammar multiple choice', () => {
    const result = validateGrammarExercise(
      makeQuestion({ choices: ['うちに', 'ために'] })
    );
    expect(result.valid).toBe(false);
  });
});
