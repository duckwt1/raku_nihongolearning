import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import {
  GrammarExerciseSchema,
  GrammarLevelSchema,
  GrammarSchema,
  getTodayDateString,
  migrateDecks,
  migrateFolders,
  type Deck,
  type Folder,
  type Grammar,
  type GrammarExercise,
  type GrammarLevel,
  type JlptLevel,
  type StudyCard,
  type UserStudyStats
} from '@raku/core';
import type { OfflineReviewItem, UserRepository } from './userRepository.js';

export const JLPT_LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

function safeNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function safeISOString(val: unknown): string | null {
  if (!val) return null;
  try {
    const d = new Date(val as string | number | Date);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function parseReviewDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof (value as { seconds: unknown }).seconds === 'number') {
    const date = new Date((value as { seconds: number }).seconds * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function sanitizeFirestoreValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (Array.isArray(value)) {
    const cleaned: unknown[] = [];
    for (const item of value) {
      const next = sanitizeFirestoreValue(item);
      if (next !== undefined) cleaned.push(next);
    }
    return cleaned;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const rec = value as Record<string, unknown>;
    if (typeof rec.isEqual === 'function' || '_methodName' in rec || typeof rec.toMillis === 'function') {
      return value;
    }
    return sanitizeFirestoreData(rec);
  }
  return value;
}

/**
 * Strips undefined/NaN/Infinity before writing to Firestore.
 */
export function sanitizeFirestoreData<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const cleaned = sanitizeFirestoreValue(value);
    if (cleaned !== undefined) {
      result[key] = cleaned;
    }
  }
  return result as T;
}

/**
 * Merges cloud FSRS card snapshots into local cards while preserving strictly newer local progress.
 */
export function mergeFirestoreCardProgress(
  cards: StudyCard[],
  cloudCards: Record<string, Record<string, unknown>>
): StudyCard[] {
  return cards.map((card) => {
    const cloud = cloudCards[card.id];
    if (!cloud) return card;

    const firstLearnedAt =
      (typeof cloud.firstLearnedAt === 'string' && cloud.firstLearnedAt.trim()) ||
      card.firstLearnedAt ||
      undefined;
    const learnedAt =
      (typeof cloud.learnedAt === 'string' && cloud.learnedAt.trim()) || card.learnedAt;

    const localLastReviewMs =
      card.fsrsCard.last_review instanceof Date && !Number.isNaN(card.fsrsCard.last_review.getTime())
        ? card.fsrsCard.last_review.getTime()
        : 0;
    const cloudLastReview = parseReviewDate(cloud.last_review);
    const cloudLastReviewMs = cloudLastReview ? cloudLastReview.getTime() : 0;
    const localReps = safeNumber(card.fsrsCard.reps);
    const cloudReps = safeNumber(cloud.reps, localReps);

    const localIsNewer =
      (localLastReviewMs > 0 && localLastReviewMs > cloudLastReviewMs) ||
      (localLastReviewMs === cloudLastReviewMs && localReps > cloudReps);

    if (localIsNewer) {
      return { ...card, firstLearnedAt, learnedAt };
    }

    const due = parseReviewDate(cloud.due) || card.fsrsCard.due;
    const fsrsCard = {
      ...card.fsrsCard,
      due,
      stability: safeNumber(cloud.stability, card.fsrsCard.stability),
      difficulty: safeNumber(cloud.difficulty, card.fsrsCard.difficulty),
      elapsed_days: safeNumber(cloud.elapsed_days, card.fsrsCard.elapsed_days),
      scheduled_days: safeNumber(cloud.scheduled_days, card.fsrsCard.scheduled_days),
      reps: cloudReps,
      lapses: safeNumber(cloud.lapses, card.fsrsCard.lapses),
      state: safeNumber(cloud.state, card.fsrsCard.state),
      last_review: cloudLastReview || card.fsrsCard.last_review
    };
    const isNew = fsrsCard.reps === 0 && !fsrsCard.last_review && fsrsCard.state === 0;

    return {
      ...card,
      firstLearnedAt,
      learnedAt,
      fsrsCard,
      isNew,
      isDue: !isNew && due.getTime() <= Date.now()
    };
  });
}

export interface SyncProfileInput {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  isAnonymous?: boolean;
}

export interface PullCloudResult {
  cards: StudyCard[];
  folders?: Folder[];
  decks?: Deck[];
  stats: UserStudyStats;
  cloudCardCount: number;
}

/**
 * Shared Firestore sync client compatible with apps/web's exact Firestore schema.
 */
export function createFirestoreSyncClient(deps: { db: Firestore; repository: UserRepository }) {
  const { db, repository } = deps;

  return {
    async syncUserProfile(user: SyncProfileInput): Promise<void> {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          email: user.email || null,
          displayName: user.displayName || null,
          isAnonymous: Boolean(user.isAnonymous)
        },
        { merge: true }
      );
    },

    async flushOfflineQueue(userId: string): Promise<number> {
      if (!userId || userId === 'local_device') return 0;
      const queue = await repository.getOfflineQueue(userId);
      if (queue.length === 0) return 0;

      let syncedCount = 0;
      const CHUNK_SIZE = 200;

      for (let i = 0; i < queue.length; i += CHUNK_SIZE) {
        const chunk = queue.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        const acknowledgedIds: string[] = [];
        const latestByCard = new Map<string, OfflineReviewItem>();

        for (const item of chunk) {
          const cardId = item?.card?.id;
          if (!item?.id || !cardId) continue;
          latestByCard.set(cardId, item);
          acknowledgedIds.push(item.id);
        }

        if (acknowledgedIds.length === 0) continue;

        for (const [cardId, item] of latestByCard) {
          const fsrs = item.card.fsrsCard;
          const cardRef = doc(db, 'users', userId, 'cards', cardId);
          batch.set(
            cardRef,
            sanitizeFirestoreData({
              id: cardId,
              refId: item.card.refId || cardId,
              type: item.card.type || 'word',
              deckId: item.card.deckId,
              due: safeISOString(fsrs?.due),
              stability: safeNumber(fsrs?.stability),
              difficulty: safeNumber(fsrs?.difficulty),
              elapsed_days: safeNumber(fsrs?.elapsed_days),
              scheduled_days: safeNumber(fsrs?.scheduled_days),
              reps: safeNumber(fsrs?.reps),
              lapses: safeNumber(fsrs?.lapses),
              state: safeNumber(fsrs?.state),
              last_review: safeISOString(fsrs?.last_review),
              firstLearnedAt: item.card.firstLearnedAt || undefined,
              learnedAt:
                item.card.learnedAt || (safeNumber(item.rating) > 1 ? item.reviewedAt : undefined),
              updatedAt: serverTimestamp()
            }),
            { merge: true }
          );
        }

        for (const item of chunk) {
          if (!item?.id || !item?.card?.id) continue;
          const logRef = doc(db, 'users', userId, 'reviewLogs', encodeURIComponent(item.id));
          batch.set(
            logRef,
            sanitizeFirestoreData({
              cardId: item.card.id,
              rating: safeNumber(item.rating, 3),
              state: safeNumber(item.card.fsrsCard?.state),
              reviewedAt:
                item.reviewedAt ||
                safeISOString(item.card.fsrsCard?.last_review) ||
                new Date().toISOString()
            })
          );
        }

        await batch.commit();
        await repository.removeOfflineReviewItems(userId, acknowledgedIds);
        syncedCount += acknowledgedIds.length;
      }

      return syncedCount;
    },

    async syncStudyStats(userId: string, stats: UserStudyStats): Promise<void> {
      if (!userId || userId === 'local_device') return;
      await setDoc(
        doc(db, 'users', userId),
        sanitizeFirestoreData({
          stats: {
            streakDays: stats.streakDays,
            lastStudiedDate: stats.lastStudiedDate,
            totalCardsLearned: stats.totalCardsLearned,
            todayStats: stats.todayStats
          }
        }),
        { merge: true }
      );
    },

    async syncFoldersAndDecks(userId: string, folders: Folder[], decks: Deck[]): Promise<void> {
      if (!userId || userId === 'local_device') return;
      const writes = [
        ...folders.map((folder) => ({
          collectionName: 'folders' as const,
          id: folder.id,
          data: sanitizeFirestoreData(folder as unknown as Record<string, unknown>)
        })),
        ...decks.map((deck) => ({
          collectionName: 'decks' as const,
          id: deck.id,
          data: sanitizeFirestoreData(deck as unknown as Record<string, unknown>)
        }))
      ];
      const CHUNK_SIZE = 450;
      for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        for (const write of writes.slice(i, i + CHUNK_SIZE)) {
          batch.set(doc(db, 'users', userId, write.collectionName, write.id), write.data, {
            merge: true
          });
        }
        await batch.commit();
      }
    },

    async pullFromCloud(
      userId: string,
      currentCards: StudyCard[],
      existingStats: UserStudyStats
    ): Promise<PullCloudResult> {
      const [cardsSnap, userSnap, foldersSnap, decksSnap] = await Promise.all([
        getDocs(collection(db, 'users', userId, 'cards')),
        getDoc(doc(db, 'users', userId)),
        getDocs(collection(db, 'users', userId, 'folders')),
        getDocs(collection(db, 'users', userId, 'decks'))
      ]);

      const cloudCards: Record<string, Record<string, unknown>> = {};
      cardsSnap.forEach((item) => {
        cloudCards[item.id] = item.data() as Record<string, unknown>;
      });

      const mergedCards = mergeFirestoreCardProgress(currentCards, cloudCards);
      const remoteFolders = foldersSnap.docs.map((item) => item.data() as Folder);
      const remoteDecks = decksSnap.docs
        .map((item) => item.data() as Deck)
        .filter((d) => d.id !== 'deck_n3_grammar' && d.id !== 'deck_n3_kanji');

      const profileData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : undefined;
      const remoteStats = profileData?.stats as UserStudyStats | undefined;
      const today = getTodayDateString();
      const mergedStats: UserStudyStats = remoteStats
        ? {
            streakDays: Math.max(remoteStats.streakDays || 0, existingStats.streakDays || 0),
            lastStudiedDate:
              (remoteStats.lastStudiedDate || '') >= (existingStats.lastStudiedDate || '')
                ? remoteStats.lastStudiedDate || existingStats.lastStudiedDate
                : existingStats.lastStudiedDate,
            totalCardsLearned: Math.max(
              remoteStats.totalCardsLearned || 0,
              existingStats.totalCardsLearned || 0
            ),
            todayStats:
              remoteStats.todayStats?.date === today && existingStats.todayStats?.date === today
                ? {
                    date: today,
                    studySeconds: Math.max(
                      remoteStats.todayStats.studySeconds || 0,
                      existingStats.todayStats.studySeconds || 0
                    ),
                    reviewedCount: Math.max(
                      remoteStats.todayStats.reviewedCount || 0,
                      existingStats.todayStats.reviewedCount || 0
                    ),
                    correctCount: Math.max(
                      remoteStats.todayStats.correctCount || 0,
                      existingStats.todayStats.correctCount || 0
                    ),
                    againCount: Math.max(
                      remoteStats.todayStats.againCount || 0,
                      existingStats.todayStats.againCount || 0
                    )
                  }
                : remoteStats.todayStats?.date === today
                  ? remoteStats.todayStats
                  : existingStats.todayStats
          }
        : existingStats;

      return {
        cards: mergedCards,
        folders: remoteFolders.length > 0 ? migrateFolders(remoteFolders) : undefined,
        decks: remoteDecks.length > 0 ? migrateDecks(remoteDecks, userId) : undefined,
        stats: mergedStats,
        cloudCardCount: Object.keys(cloudCards).length
      };
    },

    async fetchGrammarLevels(): Promise<GrammarLevel[]> {
      const snap = await getDocs(collection(db, 'grammarLevels'));
      const found: GrammarLevel[] = [];
      snap.forEach((item) => {
        const parsed = GrammarLevelSchema.safeParse({ ...item.data(), level: item.id });
        if (parsed.success) found.push(parsed.data);
      });
      return JLPT_LEVELS.map(
        (level) =>
          found.find((entry) => entry.level === level) || {
            level,
            name: `JLPT ${level}`,
            pointCount: 0,
            contentVersion: 1
          }
      );
    },

    async fetchGrammarPoints(level: JlptLevel): Promise<Grammar[]> {
      const snap = await getDocs(
        query(collection(db, 'grammarPoints'), where('jlpt', '==', level))
      );
      const list: Grammar[] = [];
      snap.forEach((item) => {
        const parsed = GrammarSchema.safeParse({ ...item.data(), id: item.id });
        if (parsed.success) list.push(parsed.data);
      });
      return list.sort((a, b) => (a.lesson || 0) - (b.lesson || 0) || a.pattern.localeCompare(b.pattern));
    },

    async fetchGrammarExercises(level: JlptLevel, grammarId?: string): Promise<GrammarExercise[]> {
      const constraints = [where('jlpt', '==', level)];
      if (grammarId) {
        constraints.push(where('grammarId', '==', grammarId));
      }
      const snap = await getDocs(query(collection(db, 'grammarExercises'), ...constraints));
      const list: GrammarExercise[] = [];
      snap.forEach((item) => {
        const parsed = GrammarExerciseSchema.safeParse({ ...item.data(), id: item.id });
        if (parsed.success) list.push(parsed.data);
      });
      return list;
    }
  };
}
