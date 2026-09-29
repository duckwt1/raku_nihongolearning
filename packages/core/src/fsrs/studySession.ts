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
  firstLearnedAt?: string;
}

/**
 * Returns today's date in local YYYY-MM-DD format.
 */
export function getTodayDateString(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if a card was introduced or learned today.
 */
export function isCardLearnedToday(card: StudyCard, todayStr: string): boolean {
  if (card.firstLearnedAt) {
    return getTodayDateString(new Date(card.firstLearnedAt)) === todayStr;
  }
  return Boolean(
    card.fsrsCard.last_review &&
    getTodayDateString(new Date(card.fsrsCard.last_review)) === todayStr &&
    card.fsrsCard.reps === 1
  );
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
  const todayStr = getTodayDateString(now);

  // Count how many cards in this set were already introduced today
  let newLearnedToday = 0;
  for (const card of cards) {
    if (isCardLearnedToday(card, todayStr)) {
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

export interface CardReviewLog {
  cardId: string;
  rating: number; // 1 | 2 | 3 | 4
  reviewedAt: Date;
  state?: number;
}

/**
 * Replays a chronological sequence of review logs through the FSRS algorithm
 * to reconstruct the exact card state (due date, stability, difficulty, reps).
 */
export function applyReviewLogsToCards(
  cards: StudyCard[],
  logs: CardReviewLog[],
  now: Date = new Date()
): StudyCard[] {
  if (!logs || logs.length === 0) return cards;

  // Group logs by normalized cardId
  const logsByCard = new Map<string, CardReviewLog[]>();
  for (const log of logs) {
    if (!log.cardId) continue;
    const cleanId = String(log.cardId).trim();
    const noPrefix = cleanId.replace(/^c_/, '');

    const list1 = logsByCard.get(cleanId) || [];
    list1.push(log);
    logsByCard.set(cleanId, list1);

    if (noPrefix !== cleanId) {
      const list2 = logsByCard.get(noPrefix) || [];
      list2.push(log);
      logsByCard.set(noPrefix, list2);
    }
  }

  // Sort each card's logs chronologically
  for (const [, list] of logsByCard) {
    list.sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
  }

  return cards.map((c) => {
    const cardLogs =
      logsByCard.get(c.id) ||
      logsByCard.get(c.id.replace(/^c_/, '')) ||
      logsByCard.get(c.refId);

    if (!cardLogs || cardLogs.length === 0) {
      return c;
    }

    const firstLog = cardLogs[0]!;

    // Start with a fresh card initialized at first review time
    let fsrs = createNewCard(firstLog.reviewedAt);

    // Replay each review through FSRS algorithm
    for (const log of cardLogs) {
      const grade = (log.rating >= 1 && log.rating <= 4 ? log.rating : 3) as 1 | 2 | 3 | 4;
      const record = applyGrade(fsrs, grade, log.reviewedAt);
      fsrs = record.card;
    }

    const isDue = fsrs.due.getTime() <= now.getTime();

    return {
      ...c,
      fsrsCard: fsrs,
      isNew: false,
      isDue,
      firstLearnedAt: c.firstLearnedAt || firstLog.reviewedAt.toISOString()
    };
  });
}

export { previewCardGrades, applyGrade, createNewCard, Rating };

