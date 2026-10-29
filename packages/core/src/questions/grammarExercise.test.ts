import { describe, expect, it } from 'vitest';
import type { GrammarExercise } from '../models/schemas.js';
import { GRAMMAR_BLANK_MARKER, validateGrammarExercise } from './validation.js';

const baseExercise: GrammarExercise = {
  id: 'gex_1',
  grammarId: 'g_n3_01_0',
  grammarPattern: '〜うちに',
  grammarTitle: '〜うちに (Trong lúc)',
  jlpt: 'N3',
  type: 'fill_blank',
  prompt: `毎日話している${GRAMMAR_BLANK_MARKER}、好きになりました。`,
  answer: 'うちに',
  choices: ['うちに', 'ために', 'ながら', 'たびに'],
  explanationVi: 'Giải thích',
  difficulty: 2,
  tags: [],
  createdByUid: 'admin',
  origin: 'admin',
  visibility: 'public'
};

describe('validateGrammarExercise', () => {
  it('accepts a valid fill-blank exercise', () => {
    expect(validateGrammarExercise(baseExercise).valid).toBe(true);
  });

  it('rejects fill-blank without exactly one marker', () => {
    const result = validateGrammarExercise({
      ...baseExercise,
      prompt: '毎日話しているうちに、好きになりました。'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain(GRAMMAR_BLANK_MARKER);
  });

  it('rejects fill-blank answer missing from choices', () => {
    const result = validateGrammarExercise({
      ...baseExercise,
      choices: ['ために', 'ながら', 'たびに']
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Đáp án');
  });

  it('validates order tokens', () => {
    const valid = {
      ...baseExercise,
      type: 'order' as const,
      prompt: 'Sắp xếp câu.',
      answer: '毎日話しているうちに、好きになりました。',
      tokens: ['毎日', '話している', 'うちに、', '好きに', 'なりました。'],
      choices: undefined
    };
    expect(validateGrammarExercise(valid).valid).toBe(true);
    expect(
      validateGrammarExercise({ ...valid, tokens: ['毎日', '話している'] }).valid
    ).toBe(false);
  });
});
