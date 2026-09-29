import { describe, expect, it } from 'vitest';
import { Question } from '../models/schemas.js';
import { validateQuestion } from './validation.js';

describe('validateQuestion', () => {
  const validQuestion: Question = {
    id: 'q1',
    type: 'K2',
    prompt: 'Nghĩa của từ 預かる là gì?',
    choices: ['nhận giữ; chăm sóc', 'từ chối', 'bắt đầu', 'kết thúc'],
    answer: 'nhận giữ; chăm sóc',
    explanationVi: '預かる mang nghĩa trông nom, giữ hộ đồ.',
    kanjiRefs: ['預'],
    wordRefs: ['w1'],
    grammarRefs: [],
    difficulty: 1,
    provenance: {
      origin: 'seed',
      verified: true
    }
  };

  it('passes a well-formed multiple-choice question', () => {
    const res = validateQuestion(validQuestion);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects empty prompt', () => {
    const res = validateQuestion({ ...validQuestion, prompt: '   ' });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('Question prompt cannot be empty.');
  });

  it('rejects questions where correct answer is missing from choices', () => {
    const res = validateQuestion({
      ...validQuestion,
      answer: 'một đáp án khác hoàn toàn'
    });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('The correct answer is not present among the choices.');
  });

  it('rejects duplicate choices', () => {
    const res = validateQuestion({
      ...validQuestion,
      choices: ['đáp án A', 'đáp án B', 'đáp án A']
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Duplicate choice detected'))).toBe(true);
  });
});
