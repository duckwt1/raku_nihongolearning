import { Question } from '../models/schemas.js';

export interface QuestionValidationResult {
  valid: boolean;
  errors: string[];
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
