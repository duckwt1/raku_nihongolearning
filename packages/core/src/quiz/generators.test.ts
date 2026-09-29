import { describe, expect, it } from 'vitest';
import { generateK2Question, generateK3Question, generateK4Question } from './generators.js';
import { validateQuestion } from '../questions/validation.js';
import { SEED_WORDS, SEED_KANJI } from '../data/index.js';

describe('Quiz Generators & Distractor Quality (Section 6)', () => {
  it('generates valid K2 (Meaning selection) question', () => {
    const word = SEED_WORDS.find((w) => w.kanji && w.kanji.length > 0)!;
    const question = generateK2Question(word);

    const validation = validateQuestion(question);
    expect(validation.valid).toBe(true);
    expect(question.choices?.length).toBe(4);
    expect(question.choices).toContain(question.answer);
  });

  it('generates valid K3 (Common kanji) question', () => {
    const question = generateK3Question('生');
    expect(question).toBeDefined();

    const validation = validateQuestion(question!);
    expect(validation.valid).toBe(true);
    expect(question?.choices?.length).toBe(4);
    expect(question?.choices).toContain('生');
  });

  it('generates valid K4 (Han Viet <-> Kanji) question', () => {
    const kanji = SEED_KANJI.find((k) => k.char === '男')!;
    const question = generateK4Question(kanji);

    const validation = validateQuestion(question);
    expect(validation.valid).toBe(true);
    expect(question.choices?.length).toBe(4);
    expect(question.choices).toContain('男');
  });
});
