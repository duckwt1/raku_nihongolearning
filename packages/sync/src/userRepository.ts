import {
  ConversationSessionSchema,
  DEFAULT_DECKS,
  DEFAULT_FOLDERS,
  KanjiSchema,
  SentenceAttemptRecordSchema,
  buildDefaultCards,
  createInitialStudyStats,
  getTodayDateString,
  migrateDecks,
  migrateFolders,
  type ConversationSession,
  type Deck,
  type Folder,
  type Kanji,
  type SentenceAttemptRecord,
  type StudyCard,
  type UserStudyStats
} from '@raku/core';
import { getUserStorageKey, type AsyncKeyValueStorage } from './storageAdapter.js';

export const MAX_LOCAL_CONVERSATION_SESSIONS = 30;
export const MAX_LOCAL_SENTENCE_HISTORY = 400;
const MAX_HIDDEN_IDS = 500;

export interface DeckSyncPrefs {
  hiddenDeckIds: string[];
  hiddenFolderIds: string[];
}

export interface OfflineReviewItem {
  id: string;
  userId: string;
  card: StudyCard;
  rating: number;
  reviewedAt: string;
}

export const DAILY_NEW_WORD_GOAL_OPTIONS = [10, 15, 20] as const;

/**
 * Restores Date instances for FSRS scheduling fields after JSON deserialization.
 */
export function hydrateStudyCards(rawCards: StudyCard[]): StudyCard[] {
  return rawCards
    .filter(
      (c) =>
        c.type !== 'kanji' &&
        c.type !== 'grammar' &&
        c.deckId !== 'deck_n3_kanji' &&
        c.deckId !== 'deck_n3_grammar'
    )
    .map((c) => {
      const reps = c.fsrsCard?.reps ?? 0;
      const hasReviewed = reps > 0 || Boolean(c.fsrsCard?.last_review);
      const isActuallyNew =
        !hasReviewed &&
        (c.isNew ?? true) &&
        (c.fsrsCard?.state === 0 || c.fsrsCard?.state === undefined);
      const dueDate = c.fsrsCard?.due ? new Date(c.fsrsCard.due) : new Date();

      return {
        ...c,
        isNew: isActuallyNew,
        isDue: !isActuallyNew && dueDate.getTime() <= Date.now(),
        fsrsCard: {
          ...c.fsrsCard,
          due: dueDate,
          last_review: c.fsrsCard?.last_review ? new Date(c.fsrsCard.last_review) : undefined
        }
      };
    });
}

export function normalizeStudyStats(parsed: Partial<UserStudyStats>): UserStudyStats {
  const today = getTodayDateString();
  const base = createInitialStudyStats();
  const todayStats =
    parsed.todayStats?.date === today
      ? {
          date: today,
          studySeconds: Number(parsed.todayStats.studySeconds) || 0,
          reviewedCount: Number(parsed.todayStats.reviewedCount) || 0,
          correctCount: Number(parsed.todayStats.correctCount) || 0,
          againCount: Number(parsed.todayStats.againCount) || 0
        }
      : base.todayStats;

  return {
    streakDays: Number(parsed.streakDays) || 0,
    lastStudiedDate: typeof parsed.lastStudiedDate === 'string' ? parsed.lastStudiedDate : '',
    totalCardsLearned: Number(parsed.totalCardsLearned) || 0,
    todayStats
  };
}

export interface UserRepository {
  loadCards(userId?: string | null): Promise<StudyCard[]>;
  saveCards(userId: string | null | undefined, cards: StudyCard[]): Promise<void>;
  loadStudyStats(userId?: string | null): Promise<UserStudyStats>;
  saveStudyStats(userId: string | null | undefined, stats: UserStudyStats): Promise<void>;
  loadFolders(userId?: string | null): Promise<Folder[]>;
  saveFolders(userId: string | null | undefined, folders: Folder[]): Promise<void>;
  loadDecks(userId?: string | null): Promise<Deck[]>;
  saveDecks(userId: string | null | undefined, decks: Deck[]): Promise<void>;
  getOfflineQueue(userId?: string | null): Promise<OfflineReviewItem[]>;
  enqueueOfflineReview(item: OfflineReviewItem, userId?: string | null): Promise<void>;
  removeOfflineReviewItems(userId: string, itemIds: string[]): Promise<void>;
  clearOfflineQueue(userId?: string | null): Promise<void>;
  loadDailyNewWordGoal(userId?: string | null): Promise<number>;
  saveDailyNewWordGoal(userId: string | null | undefined, goal: number): Promise<void>;
  loadConversationSessions(userId?: string | null): Promise<ConversationSession[]>;
  saveConversationSessions(
    userId: string | null | undefined,
    sessions: ConversationSession[]
  ): Promise<void>;
  loadSentenceHistory(userId?: string | null): Promise<SentenceAttemptRecord[]>;
  saveSentenceHistory(
    userId: string | null | undefined,
    attempts: SentenceAttemptRecord[]
  ): Promise<void>;
  loadDeckSyncPrefs(userId?: string | null): Promise<DeckSyncPrefs>;
  saveDeckSyncPrefs(userId: string | null | undefined, prefs: DeckSyncPrefs): Promise<void>;
  loadSyncedBundleHashes(userId?: string | null): Promise<Record<string, string>>;
  saveSyncedBundleHashes(
    userId: string | null | undefined,
    hashes: Record<string, string>
  ): Promise<void>;
  loadCustomKanji(userId?: string | null): Promise<Kanji[]>;
  saveCustomKanji(userId: string | null | undefined, kanji: Kanji[]): Promise<void>;
  loadSyncedCustomKanjiHash(userId?: string | null): Promise<string>;
  saveSyncedCustomKanjiHash(userId: string | null | undefined, hash: string): Promise<void>;
  clearUserData(userId?: string | null): Promise<void>;
}

/**
 * Platform-agnostic offline-first repository backed by AsyncStorage (mobile) or localStorage (web).
 */
export function createUserRepository(storage: AsyncKeyValueStorage): UserRepository {
  return {
    async loadCards(userId) {
      try {
        const saved = await storage.getItem(getUserStorageKey('cards', userId));
        if (saved) {
          return hydrateStudyCards(JSON.parse(saved) as StudyCard[]);
        }
      } catch {
        // Fallback to default seed cards if storage is corrupted
      }
      return buildDefaultCards();
    },

    async saveCards(userId, cards) {
      await storage.setItem(getUserStorageKey('cards', userId), JSON.stringify(cards));
    },

    async loadStudyStats(userId) {
      try {
        const saved = await storage.getItem(getUserStorageKey('study_stats', userId));
        if (saved) {
          return normalizeStudyStats(JSON.parse(saved) as Partial<UserStudyStats>);
        }
      } catch {
        // Fallback to clean stats
      }
      return createInitialStudyStats();
    },

    async saveStudyStats(userId, stats) {
      await storage.setItem(getUserStorageKey('study_stats', userId), JSON.stringify(stats));
    },

    async loadFolders(userId) {
      try {
        const saved = await storage.getItem(getUserStorageKey('folders', userId));
        return saved ? migrateFolders(JSON.parse(saved) as Folder[]) : migrateFolders(DEFAULT_FOLDERS);
      } catch {
        return migrateFolders(DEFAULT_FOLDERS);
      }
    },

    async saveFolders(userId, folders) {
      await storage.setItem(getUserStorageKey('folders', userId), JSON.stringify(folders));
    },

    async loadDecks(userId) {
      try {
        const saved = await storage.getItem(getUserStorageKey('decks', userId));
        if (saved) {
          const parsed = JSON.parse(saved) as Deck[];
          return migrateDecks(
            parsed.filter((d) => d.id !== 'deck_n3_kanji' && d.id !== 'deck_n3_grammar'),
            userId
          );
        }
      } catch {
        // Fallback to default decks
      }
      return migrateDecks(DEFAULT_DECKS, userId);
    },

    async saveDecks(userId, decks) {
      await storage.setItem(getUserStorageKey('decks', userId), JSON.stringify(decks));
    },

    async getOfflineQueue(userId) {
      try {
        const raw = await storage.getItem(getUserStorageKey('offline_queue', userId));
        return raw ? (JSON.parse(raw) as OfflineReviewItem[]) : [];
      } catch {
        return [];
      }
    },

    async enqueueOfflineReview(item, userId) {
      const targetUid = userId || item.userId;
      const key = getUserStorageKey('offline_queue', targetUid);
      const queue = await this.getOfflineQueue(targetUid);
      queue.push(item);
      await storage.setItem(key, JSON.stringify(queue));
    },

    async removeOfflineReviewItems(userId, itemIds) {
      if (itemIds.length === 0) return;
      const key = getUserStorageKey('offline_queue', userId);
      const acknowledged = new Set(itemIds);
      const latest = await this.getOfflineQueue(userId);
      const remaining = latest.filter((item) => !acknowledged.has(item.id));
      if (remaining.length === 0) {
        await storage.removeItem(key);
      } else {
        await storage.setItem(key, JSON.stringify(remaining));
      }
    },

    async clearOfflineQueue(userId) {
      await storage.removeItem(getUserStorageKey('offline_queue', userId));
    },

    async loadDailyNewWordGoal(userId) {
      try {
        const raw = await storage.getItem(getUserStorageKey('daily_new_word_goal', userId));
        const parsed = Number(raw);
        return DAILY_NEW_WORD_GOAL_OPTIONS.includes(parsed as 10 | 15 | 20) ? parsed : 10;
      } catch {
        return 10;
      }
    },

    async saveDailyNewWordGoal(userId, goal) {
      if (!DAILY_NEW_WORD_GOAL_OPTIONS.includes(goal as 10 | 15 | 20)) return;
      await storage.setItem(getUserStorageKey('daily_new_word_goal', userId), String(goal));
    },

    async loadConversationSessions(userId) {
      try {
        const raw = await storage.getItem(getUserStorageKey('conversation_sessions', userId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const valid: ConversationSession[] = [];
        for (const item of parsed) {
          const check = ConversationSessionSchema.safeParse(item);
          if (check.success) valid.push(check.data);
        }
        return valid
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, MAX_LOCAL_CONVERSATION_SESSIONS);
      } catch {
        return [];
      }
    },

    async saveConversationSessions(userId, sessions) {
      const trimmed = [...sessions]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_LOCAL_CONVERSATION_SESSIONS);
      await storage.setItem(
        getUserStorageKey('conversation_sessions', userId),
        JSON.stringify(trimmed)
      );
    },

    async loadSentenceHistory(userId) {
      try {
        const raw = await storage.getItem(getUserStorageKey('sentence_history', userId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const valid: SentenceAttemptRecord[] = [];
        for (const item of parsed) {
          const check = SentenceAttemptRecordSchema.safeParse(item);
          if (check.success) valid.push(check.data);
        }
        return valid
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, MAX_LOCAL_SENTENCE_HISTORY);
      } catch {
        return [];
      }
    },

    async saveSentenceHistory(userId, attempts) {
      const trimmed = [...attempts]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_LOCAL_SENTENCE_HISTORY);
      await storage.setItem(getUserStorageKey('sentence_history', userId), JSON.stringify(trimmed));
    },

    async loadDeckSyncPrefs(userId) {
      try {
        const raw = await storage.getItem(getUserStorageKey('deck_sync_prefs', userId));
        if (!raw) return { hiddenDeckIds: [], hiddenFolderIds: [] };
        const parsed = JSON.parse(raw) as Partial<DeckSyncPrefs>;
        return {
          hiddenDeckIds: Array.isArray(parsed.hiddenDeckIds) ? parsed.hiddenDeckIds : [],
          hiddenFolderIds: Array.isArray(parsed.hiddenFolderIds) ? parsed.hiddenFolderIds : []
        };
      } catch {
        return { hiddenDeckIds: [], hiddenFolderIds: [] };
      }
    },

    async saveDeckSyncPrefs(userId, prefs) {
      await storage.setItem(
        getUserStorageKey('deck_sync_prefs', userId),
        JSON.stringify({
          hiddenDeckIds: prefs.hiddenDeckIds.slice(-MAX_HIDDEN_IDS),
          hiddenFolderIds: prefs.hiddenFolderIds.slice(-MAX_HIDDEN_IDS)
        })
      );
    },

    async loadSyncedBundleHashes(userId) {
      try {
        const raw = await storage.getItem(getUserStorageKey('deck_bundle_hashes', userId));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const clean: Record<string, string> = {};
        for (const [key, val] of Object.entries(parsed)) {
          if (typeof val === 'string') clean[key] = val;
        }
        return clean;
      } catch {
        return {};
      }
    },

    async saveSyncedBundleHashes(userId, hashes) {
      await storage.setItem(
        getUserStorageKey('deck_bundle_hashes', userId),
        JSON.stringify(hashes)
      );
    },

    async loadCustomKanji(userId) {
      try {
        const raw = await storage.getItem(getUserStorageKey('custom_kanji', userId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const valid: Kanji[] = [];
        for (const item of parsed) {
          const check = KanjiSchema.safeParse(item);
          if (check.success) valid.push(check.data);
        }
        return valid;
      } catch {
        return [];
      }
    },

    async saveCustomKanji(userId, kanji) {
      await storage.setItem(getUserStorageKey('custom_kanji', userId), JSON.stringify(kanji));
    },

    async loadSyncedCustomKanjiHash(userId) {
      try {
        return (await storage.getItem(getUserStorageKey('custom_kanji_hash', userId))) || '';
      } catch {
        return '';
      }
    },

    async saveSyncedCustomKanjiHash(userId, hash) {
      await storage.setItem(getUserStorageKey('custom_kanji_hash', userId), hash);
    },

    async clearUserData(userId) {
      const bases = [
        'cards',
        'study_stats',
        'folders',
        'decks',
        'offline_queue',
        'deck_sync_prefs',
        'deck_bundle_hashes',
        'custom_kanji',
        'custom_kanji_hash',
        'grammar_exercises',
        'grammar_practice_stats',
        'daily_new_word_goal',
        'conversation_sessions',
        'sentence_history'
      ];
      await Promise.all(bases.map((base) => storage.removeItem(getUserStorageKey(base, userId))));
    }
  };
}
