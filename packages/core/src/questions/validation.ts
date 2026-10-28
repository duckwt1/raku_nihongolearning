import { Question } from '../models/schemas.js';

export interface QuestionValidationResult {
  valid: boolean;
  errors: string[];
}

/** Marker dùng trong prompt của bài điền chỗ trống */
export const GRAMMAR_BLANK_MARKER = '{{blank}}';

function normalizeForCompare(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\s\u3000]+/g, '')
    .trim();
}

/**
 * Validates question structure and semantic constraints (Section 6 & 8.3).
 * Ensures:
 * 1. Prompt is not empty.
 * 2. If multiple-choice, choices must be provided (>= 2 choices).
 * 3. Exactly one correct answer exists in the choices list (or acceptable answers).
 * 4. Choices must not contain duplicate options.
 * 5. Answer must not appear more than once in choices.
 */
export function validateQuestion(question: Question): QuestionValidationResult {
  const errors: string[] = [];

  if (!question.prompt || question.prompt.trim() === '') {
    errors.push('Question prompt cannot be empty.');
  }

  // Multiple-choice questions
  if (question.choices && question.choices.length > 0) {
    if (question.choices.length < 2) {
      errors.push('Multiple-choice questions must have at least 2 choices.');
    }

    // Check duplicate choices
    const choiceSet = new Set<string>();
    for (const choice of question.choices) {
      const normalizedChoice = choice.trim();
      if (choiceSet.has(normalizedChoice)) {
        errors.push(`Duplicate choice detected: "${choice}".`);
      }
      choiceSet.add(normalizedChoice);
    }

    // Validate that the correct answer is contained in choices
    const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
    const normalizedAnswers = answers.map((a) => a.trim());

    const matchingChoices = question.choices.filter((choice) =>
      normalizedAnswers.includes(choice.trim())
    );

    if (matchingChoices.length === 0) {
      errors.push('The correct answer is not present among the choices.');
    } else if (matchingChoices.length > 1 && !Array.isArray(question.answer)) {
      errors.push('Multiple choices match the correct answer in a single-answer question.');
    }
  }

  // Sentence ordering question
  if (question.type === 'order') {
    if (!question.tokens || question.tokens.length < 2) {
      errors.push('Order questions must contain at least 2 tokens to assemble.');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validation bổ sung cho bài tập ngữ pháp:
 * - fill_blank: đúng 1 marker, answer không rỗng, câu sau khi điền khớp sourceExample (nếu có).
 * - order: token ghép lại đúng câu answer.
 * - MCQ ngữ pháp: tối thiểu 3 lựa chọn.
 */
export function validateGrammarExercise(question: Question): QuestionValidationResult {
  const errors = [...validateQuestion(question).errors];

  if (question.type === 'fill_blank') {
    const blankCount = question.prompt.split(GRAMMAR_BLANK_MARKER).length - 1;
    if (blankCount !== 1) {
      errors.push(
        `Fill-blank questions must contain exactly one ${GRAMMAR_BLANK_MARKER} marker.`
      );
    }

    if (typeof question.answer !== 'string' || !question.answer.trim()) {
      errors.push('Fill-blank questions must have a non-empty text answer.');
    } else if (blankCount === 1 && question.sourceExample) {
      const filled = question.prompt.replace(GRAMMAR_BLANK_MARKER, question.answer);
      if (normalizeForCompare(filled) !== normalizeForCompare(question.sourceExample)) {
        errors.push('The filled sentence does not match the source example.');
      }
    }
  }

  if (question.type === 'order') {
    const tokens = question.tokens ?? [];
    if (tokens.length < 2) {
      errors.push('Order questions must contain at least 2 tokens to assemble.');
    }
    if (typeof question.answer !== 'string') {
      errors.push('Order questions must have a single string answer.');
    } else if (tokens.length >= 2) {
      if (normalizeForCompare(tokens.join('')) !== normalizeForCompare(question.answer)) {
        errors.push('Order tokens do not reconstruct the answer sentence.');
      }
    }
  }

  if (question.type === 'translate_jp_vi' || question.type === 'translate_vi_jp') {
    const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
    if (answers.every((answer) => !answer.trim())) {
      errors.push('Translation questions must have a non-empty answer.');
    }
  }

  if (question.choices && question.choices.length > 0 && question.choices.length < 3) {
    errors.push('Grammar multiple-choice questions need at least 3 choices.');
  }

  if (
    (question.type === 'fill_blank' || question.type === 'K7') &&
    (!question.choices || question.choices.length < 3)
  ) {
    errors.push('Fill-blank and K7 grammar questions need at least 3 choices.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
