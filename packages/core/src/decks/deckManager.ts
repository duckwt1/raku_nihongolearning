import { State } from 'ts-fsrs';
import type { Deck, Folder, UserStudyStats } from '../models/schemas.js';
import type { StudyCard } from '../fsrs/studySession.js';
import { createNewCard } from '../fsrs/scheduler.js';
import { SEED_WORDS, SEED_KANJI, SEED_GRAMMAR } from '../data/index.js';

export interface DeckCounts {
  newCount: number;
  learnCount: number;
  dueCount: number;
  totalCards: number;
}

export const DEFAULT_FOLDERS: Folder[] = [
  {
    id: 'folder_jlpt_n3',
    name: 'JLPT N3',
    description: 'Kho kiến thức chuẩn JLPT N3 đầy đủ Kanji, Từ vựng, Ngữ pháp',
    color: '#0284c7', // sky-600
    parentId: null,
    createdAt: new Date().toISOString()
  },
  {
    id: 'folder_custom',
    name: 'Kho Cá Nhân & AI',
    description: 'Bộ thẻ tự nhập từ file và bộ đề do AI sinh tự động',
    color: '#8b5cf6', // violet-500
    parentId: null,
    createdAt: new Date().toISOString()
  }
];

export const DEFAULT_DECKS: Deck[] = [
  {
    id: 'deck_n3_words',
    folderId: 'folder_jlpt_n3',
    name: 'N3 Từ Vựng (Mimikara 880)',
    description: '880 từ vựng N3 cốt lõi phân tích theo Kanji và âm Hán Việt',
    color: '#0284c7',
    cardType: 'word',
    cardIds: [],
    newCardsPerDay: 20,
    maxReviewsPerDay: 50,
    isDefault: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'deck_n3_kanji',
    folderId: 'folder_jlpt_n3',
    name: 'N3 Chữ Hán (609 Kanji)',
    description: '609 chữ Kanji N3 kèm 100% âm Hán Việt, Onyomi, Kunyomi',
    color: '#059669',
    cardType: 'kanji',
    cardIds: [],
    newCardsPerDay: 15,
    maxReviewsPerDay: 40,
    isDefault: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'deck_n3_grammar',
    folderId: 'folder_jlpt_n3',
    name: 'N3 Ngữ Pháp Cốt Lõi (97 Cấu Trúc)',
    description: '97 mẫu câu ngữ pháp N3 hay xuất hiện trong các đề thi',
    color: '#d97706',
    cardType: 'grammar',
    cardIds: [],
    newCardsPerDay: 10,
    maxReviewsPerDay: 30,
    isDefault: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'deck_custom_import',
    folderId: 'folder_custom',
    name: 'Từ Vựng Tự Nhập (Import)',
    description: 'Từ vựng người dùng tự dán hoặc upload từ file CSV/TSV/Anki',
    color: '#8b5cf6',
    cardType: 'custom',
    cardIds: [],
    newCardsPerDay: 20,
    maxReviewsPerDay: 50,
    isDefault: true,
    createdAt: new Date().toISOString()
  }
];

/**
 * Builds standard default StudyCards for N3 Words, Kanji, and Grammar.
 */
export function buildDefaultCards(): StudyCard[] {
  const cards: StudyCard[] = [];

  // 1. N3 Words
  for (let idx = 0; idx < SEED_WORDS.length; idx++) {
    const w = SEED_WORDS[idx];
    if (!w) continue;
    cards.push({
      id: `c_word_${w.id}`,
      type: 'word',
      refId: w.id,
      word: w,
      deckId: 'deck_n3_words',
      fsrsCard: createNewCard(),
      isNew: true,
      isDue: false
    });
  }

  // 2. N3 Kanji
  for (let idx = 0; idx < SEED_KANJI.length; idx++) {
    const k = SEED_KANJI[idx];
    if (!k) continue;
    cards.push({
      id: `c_kanji_${k.char}`,
      type: 'kanji',
      refId: k.char,
      kanji: k,
      deckId: 'deck_n3_kanji',
      fsrsCard: createNewCard(),
      isNew: true,
      isDue: false
    });
  }

  // 3. N3 Grammar
  for (let idx = 0; idx < SEED_GRAMMAR.length; idx++) {
    const g = SEED_GRAMMAR[idx];
    if (!g) continue;
    cards.push({
      id: `c_grammar_${g.id}`,
      type: 'grammar',
      refId: g.id,
      grammar: g,
      deckId: 'deck_n3_grammar',
      fsrsCard: createNewCard(),
      isNew: true,
      isDue: false
    });
  }

  return cards;
}

/**
 * Calculates Anki-style counts (New, Learn, Due) for a given deck.
 */
export function calculateDeckCounts(
  cards: StudyCard[],
  deckId: string,
  deckLimit?: { newCardsPerDay: number; maxReviewsPerDay: number },
  now = new Date()
): DeckCounts {
  let newCount = 0;
  let learnCount = 0;
  let dueCount = 0;
  let totalCards = 0;
  let newLearnedToday = 0;
  const todayStr = getTodayDateString(now);

  for (const card of cards) {
    if (card.deckId !== deckId) continue;
    totalCards++;

    if (
      card.fsrsCard.last_review &&
      getTodayDateString(new Date(card.fsrsCard.last_review)) === todayStr &&
      card.fsrsCard.reps === 1
    ) {
      newLearnedToday++;
    }

    const isActuallyNew =
      Boolean(card.isNew) &&
      (!card.fsrsCard.reps || card.fsrsCard.reps === 0) &&
      !card.fsrsCard.last_review;

    if (isActuallyNew) {
      newCount++;
    } else if (
      card.fsrsCard.state === State.Learning ||
      card.fsrsCard.state === State.Relearning
    ) {
      if (card.fsrsCard.due.getTime() <= now.getTime()) {
        learnCount++;
      }
    } else if (card.fsrsCard.due.getTime() <= now.getTime()) {
      dueCount++;
    }
  }

  const remainingNew = deckLimit
    ? Math.max(0, deckLimit.newCardsPerDay - newLearnedToday)
    : newCount;

  return {
    newCount: deckLimit ? Math.min(newCount, remainingNew) : newCount,
    learnCount,
    dueCount: deckLimit ? Math.min(dueCount, deckLimit.maxReviewsPerDay) : dueCount,
    totalCards
  };
}

/**
 * Calculates aggregated Anki-style counts for all decks inside a folder.
 */
export function calculateFolderCounts(
  cards: StudyCard[],
  decks: Deck[],
  folderId: string,
  now = new Date()
): DeckCounts {
  const childDecks = decks.filter((d) => d.folderId === folderId);
  const childDeckIds = new Set(childDecks.map((d) => d.id));

  let newCount = 0;
  let learnCount = 0;
  let dueCount = 0;
  let totalCards = 0;

  for (const card of cards) {
    if (!card.deckId || !childDeckIds.has(card.deckId)) continue;
    totalCards++;

    const isActuallyNew =
      Boolean(card.isNew) &&
      (!card.fsrsCard.reps || card.fsrsCard.reps === 0) &&
      !card.fsrsCard.last_review;

    if (isActuallyNew) {
      newCount++;
    } else if (
      card.fsrsCard.state === State.Learning ||
      card.fsrsCard.state === State.Relearning
    ) {
      if (card.fsrsCard.due.getTime() <= now.getTime()) {
        learnCount++;
      }
    } else if (card.fsrsCard.due.getTime() <= now.getTime()) {
      dueCount++;
    }
  }

  return { newCount, learnCount, dueCount, totalCards };
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
 * Creates initial user study stats
 */
export function createInitialStudyStats(): UserStudyStats {
  const today = getTodayDateString();
  return {
    todayStats: {
      date: today,
      studySeconds: 0,
      reviewedCount: 0,
      correctCount: 0,
      againCount: 0
    },
    streakDays: 0,
    lastStudiedDate: today,
    totalCardsLearned: 0
  };
}

/**
 * Updates user study stats with newly studied seconds and card ratings.
 */
export function recordStudyActivity(
  stats: UserStudyStats,
  addedSeconds: number,
  rating?: number,
  now = new Date()
): UserStudyStats {
  const today = getTodayDateString(now);
  let currentToday = stats.todayStats;

  // New day check
  let streak = stats.streakDays;
  if (currentToday.date !== today) {
    // Check if yesterday was studied
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getTodayDateString(yesterday);

    if (stats.lastStudiedDate === yesterdayStr && stats.todayStats.reviewedCount > 0) {
      streak += 1;
    } else if (stats.lastStudiedDate !== today && stats.todayStats.reviewedCount === 0) {
      streak = 1;
    }

    currentToday = {
      date: today,
      studySeconds: 0,
      reviewedCount: 0,
      correctCount: 0,
      againCount: 0
    };
  }

  // Update seconds
  currentToday.studySeconds += addedSeconds;

  // Update ratings if a card was reviewed
  if (rating !== undefined) {
    currentToday.reviewedCount += 1;
    if (rating === 1) {
      currentToday.againCount += 1;
    } else {
      currentToday.correctCount += 1;
    }

    if (streak === 0) {
      streak = 1;
    }
  }

  return {
    ...stats,
    todayStats: currentToday,
    streakDays: streak,
    lastStudiedDate: today,
    totalCardsLearned:
      stats.totalCardsLearned + (rating !== undefined && rating > 1 ? 1 : 0)
  };
}
