import { Card, Rating, previewCardGrades, applyGrade, createNewCard } from '../fsrs/scheduler.js';
import type { Word, Kanji, Grammar } from '../models/schemas.js';

export interface StudyCard {
  id: string; // card document id: `word_${wordId}`
  type: 'word' | 'kanji' | 'grammar' | 'custom';
  refId: string;
  word?: Word;
  kanji?: Kanji;
  grammar?: Grammar;
  customPrompt?: string;
  customAnswer?: string;
  fsrsCard: Card;
  isNew: boolean;
  isDue: boolean;
  deckId?: string;
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
  now: Date = new Date(),
  extraNewCards = 0
): ReviewSessionState {
  const dueCards: StudyCard[] = [];
  const newCards: StudyCard[] = [];
  const todayStr = now.toISOString().slice(0, 10);

  // Count how many cards in this set were already introduced today
  let newLearnedToday = 0;
  for (const card of cards) {
    if (
      card.fsrsCard.last_review &&
      new Date(card.fsrsCard.last_review).toISOString().slice(0, 10) === todayStr &&
      card.fsrsCard.reps === 1
    ) {
      newLearnedToday++;
    }
  }

  const effectiveNewLimit = Math.max(0, maxNewCards - newLearnedToday) + extraNewCards;

  for (const card of cards) {
    const isActuallyNew =
      Boolean(card.isNew) &&
      (!card.fsrsCard.reps || card.fsrsCard.reps === 0) &&
      !card.fsrsCard.last_review;

    if (isActuallyNew) {
      if (newCards.length < effectiveNewLimit) {
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
