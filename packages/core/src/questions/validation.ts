import { Question } from '../models/schemas.js';

export interface QuestionValidationResult {
  valid: boolean;
  errors: string[];
}

export const GRAMMAR_BLANK_MARKER = '{{blank}}';

function normalizeForCompare(text: string): string {
  return text.normalize('NFC').replace(/[\s\u3000]+/g, '').trim();
}

/**
 * Validate bài tập ngữ pháp (dùng cho admin form và dữ liệu Firestore).
 */
export function validateGrammarExercise(question: {
  type: string;
  prompt: string;
  answer: string | string[];
  choices?: string[];
  tokens?: string[];
}): QuestionValidationResult {
  const errors: string[] = [];

  if (!question.prompt || !question.prompt.trim()) {
    errors.push('Prompt không được để trống.');
  }

  if (question.type === 'fill_blank') {
    const blankCount = question.prompt.split(GRAMMAR_BLANK_MARKER).length - 1;
    if (blankCount !== 1) {
      errors.push(`Câu điền chỗ trống phải có đúng một ${GRAMMAR_BLANK_MARKER}.`);
    }
    if (typeof question.answer !== 'string' || !question.answer.trim()) {
      errors.push('Đáp án điền chỗ trống không được để trống.');
    }
    if (!question.choices || question.choices.length < 3) {
      errors.push('Câu điền chỗ trống cần ít nhất 3 lựa chọn.');
    } else {
      const unique = new Set(question.choices.map((choice) => choice.trim()));
      if (unique.size !== question.choices.length) {
        errors.push('Các lựa chọn không được trùng nhau.');
      }
      const answer = typeof question.answer === 'string' ? question.answer.trim() : '';
      if (answer && !question.choices.some((choice) => choice.trim() === answer)) {
        errors.push('Đáp án phải nằm trong danh sách lựa chọn.');
      }
    }
  }

  if (question.type === 'order') {
    const tokens = question.tokens || [];
    if (tokens.length < 2) {
      errors.push('Câu sắp xếp cần ít nhất 2 mảnh ghép.');
    }
    if (typeof question.answer !== 'string') {
      errors.push('Câu sắp xếp phải có một đáp án dạng chuỗi.');
    } else if (tokens.length >= 2) {
      if (normalizeForCompare(tokens.join('')) !== normalizeForCompare(question.answer)) {
        errors.push('Các mảnh ghép không khớp với câu đáp án.');
      }
    }
  }

  if (question.type === 'translate_jp_vi' || question.type === 'translate_vi_jp') {
    const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
    if (answers.every((answer) => !answer.trim())) {
      errors.push('Câu dịch cần ít nhất một đáp án.');
    }
  }

  if (question.type === 'K7') {
    if (!question.choices || question.choices.length < 3) {
      errors.push('Câu trắc nghiệm cần ít nhất 3 lựa chọn.');
    } else if (typeof question.answer === 'string') {
      if (!question.choices.includes(question.answer)) {
        errors.push('Đáp án phải nằm trong danh sách lựa chọn.');
      }
    } else {
      errors.push('Câu trắc nghiệm cần một đáp án dạng chuỗi.');
    }
  }

  return { valid: errors.length === 0, errors };
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
