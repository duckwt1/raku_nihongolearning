import { Card, Rating, previewCardGrades, applyGrade, createNewCard } from '../fsrs/scheduler.js';
import type { Word } from '../models/schemas.js';

export interface StudyCard {
  id: string; // card document id: `word_${wordId}`
  type: 'word' | 'kanji' | 'grammar' | 'custom';
  refId: string;
  word: Word;
  fsrsCard: Card;
  isNew: boolean;
  isDue: boolean;
}

export interface ReviewSessionState {
  queue: StudyCard[];
  currentIndex: number;
  totalCards: number;
  newCount: number;
  dueCount: number;
  completedCount: number;
  againQueue: StudyCard[]; // Cards that need relearning in the same session (<1d)
}

/**
 * Builds a review session queue based on due cards and new cards limit.
 */
export function buildReviewQueue(
  cards: StudyCard[],
  maxNewCards = 20,
  maxDueCards = 50,
  now: Date = new Date()
): ReviewSessionState {
  const dueCards: StudyCard[] = [];
  const newCards: StudyCard[] = [];

  for (const card of cards) {
    if (card.isNew) {
      if (newCards.length < maxNewCards) {
        newCards.push(card);
      }
    } else if (card.fsrsCard.due.getTime() <= now.getTime()) {
      if (dueCards.length < maxDueCards) {
        dueCards.push(card);
      }
    }
  }

  // Session priority: due cards first, then new cards
  const queue = [...dueCards, ...newCards];

  return {
    queue,
    currentIndex: 0,
    totalCards: queue.length,
    newCount: newCards.length,
    dueCount: dueCards.length,
    completedCount: 0,
    againQueue: []
  };
}

export { previewCardGrades, applyGrade, createNewCard, Rating };
