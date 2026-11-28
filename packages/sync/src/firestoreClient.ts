import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import {
  ConversationSessionSchema,
  GrammarExerciseSchema,
  GrammarLevelSchema,
  GrammarSchema,
  SentenceAttemptRecordSchema,
  WORDS_BY_ID,
  WordSchema,
  createNewCard,
  getTodayDateString,
  migrateDecks,
  migrateFolders,
  type ConversationSession,
  type Deck,
  type Folder,
  type Grammar,
  type GrammarExercise,
  type GrammarLevel,
  type JlptLevel,
  type Kanji,
  type SentenceAttemptRecord,
  type StudyCard,
  type UserStudyStats
} from '@raku/core';
import {
  MAX_LOCAL_CONVERSATION_SESSIONS,
  MAX_LOCAL_SENTENCE_HISTORY,
  type OfflineReviewItem,
  type UserRepository
} from './userRepository.js';
import {
  computeDeckCardsHash,
  getDeckBundleDocId,
  isCustomBundleCard,
  isOwnedCustomDeck,
  mergeDeckBundleCardsIntoLocal,
  normalizePackedWord,
  packDeckCards,
  splitIntoBundleChunks,
  type DeckBundleChunkDoc,
  type PackedDeckCard
} from './deckBundles.js';
import {
  fetchCommunityDecksFromDb,
  mergeCommunityDecksIntoLocalState
} from './communityDecks.js';
import {
  pullCustomKanjiBundleWithDb,
  syncCustomKanjiBundleWithDb
} from './customKanji.js';

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
 * Merges cloud FSRS card snapshots into local cards while preserving strictly newer local progress
 * and appending cloud-only custom word cards (e.g. saved from Sentence Studio / AI Roleplay).
 */
export function mergeFirestoreCardProgress(
  cards: StudyCard[],
  cloudCards: Record<string, Record<string, unknown>>
): StudyCard[] {
  const existingIds = new Set<string>();
  const merged = cards.map((card) => {
    existingIds.add(card.id);
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

  // Append custom word cards present in cloud that don't exist locally yet
  for (const [cardId, cloud] of Object.entries(cloudCards)) {
    if (existingIds.has(cardId) || !cloud || typeof cloud !== 'object') continue;
    const parsedWord = WordSchema.safeParse(cloud.word);
    const wordData = parsedWord.success
      ? parsedWord.data
      : normalizePackedWord(cloud.word, typeof cloud.refId === 'string' && cloud.refId ? cloud.refId : cardId);
    if (!wordData) continue;

    const baseCard = createNewCard();
    const due = parseReviewDate(cloud.due) || baseCard.due;
    const lastReview = parseReviewDate(cloud.last_review);
    const reps = safeNumber(cloud.reps, 0);
    const state = safeNumber(cloud.state, 0);
    const isNew = reps === 0 && !lastReview && state === 0;

    merged.push({
      id: cardId,
      type: 'word',
      refId: typeof cloud.refId === 'string' && cloud.refId ? cloud.refId : wordData.id,
      deckId: typeof cloud.deckId === 'string' && cloud.deckId ? cloud.deckId : undefined,
      word: wordData,
      firstLearnedAt:
        typeof cloud.firstLearnedAt === 'string' && cloud.firstLearnedAt.trim()
          ? cloud.firstLearnedAt
          : undefined,
      learnedAt:
        typeof cloud.learnedAt === 'string' && cloud.learnedAt.trim()
          ? cloud.learnedAt
          : undefined,
      fsrsCard: {
        ...baseCard,
        due,
        stability: safeNumber(cloud.stability, baseCard.stability),
        difficulty: safeNumber(cloud.difficulty, baseCard.difficulty),
        elapsed_days: safeNumber(cloud.elapsed_days, baseCard.elapsed_days),
        scheduled_days: safeNumber(cloud.scheduled_days, baseCard.scheduled_days),
        reps,
        lapses: safeNumber(cloud.lapses, 0),
        state,
        last_review: lastReview
      },
      isNew,
      isDue: !isNew && due.getTime() <= Date.now()
    });
  }

  return merged;
}

export function mergeConversationSessions(
  local: ConversationSession[],
  cloud: ConversationSession[]
): ConversationSession[] {
  const byId = new Map<string, ConversationSession>();
  for (const item of [...local, ...cloud]) {
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_LOCAL_CONVERSATION_SESSIONS);
}

export function mergeSentenceHistory(
  local: SentenceAttemptRecord[],
  cloud: SentenceAttemptRecord[]
): SentenceAttemptRecord[] {
  const byId = new Map<string, SentenceAttemptRecord>();
  for (const item of [...local, ...cloud]) {
    const existing = byId.get(item.id);
    if (!existing || item.createdAt > existing.createdAt) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_LOCAL_SENTENCE_HISTORY);
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
  customKanji?: Kanji[];
  stats: UserStudyStats;
  cloudCardCount: number;
  bundlesFetchedCount: number;
  communityNewDecksCount: number;
}

export interface PullDecksAndBundlesResult {
  cards: StudyCard[];
  folders: Folder[];
  decks: Deck[];
  bundlesFetchedCount: number;
  communityNewDecksCount: number;
  hasChanges: boolean;
}

export interface SyncDirtyDeckBundlesResult {
  updatedDecks: Deck[];
  syncedDeckIds: string[];
  writesCount: number;
  hashes: Record<string, string>;
}

export interface PullDeckBundlesResult {
  cards: StudyCard[];
  fetchedDeckCount: number;
  readsCount: number;
  hashes: Record<string, string>;
}

export function folderDeckFingerprint(folders: Folder[], decks: Deck[]): string {
  const value = JSON.stringify({
    folders: folders.map((folder) => sanitizeFirestoreData(folder as unknown as Record<string, unknown>)),
    decks: decks.map((deck) => sanitizeFirestoreData(deck as unknown as Record<string, unknown>))
  });
  let hashA = 2166136261;
  let hashB = 5381;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    hashA = Math.imul(hashA ^ code, 16777619);
    hashB = Math.imul(hashB, 33) ^ code;
  }
  return `${(hashA >>> 0).toString(36)}-${(hashB >>> 0).toString(36)}`;
}

export function mergeFoldersById(
  localFolders: Folder[],
  remoteFolders: Folder[],
  hiddenFolderIds: ReadonlySet<string> = new Set()
): Folder[] {
  const map = new Map<string, Folder>();
  for (const folder of localFolders) {
    if (!hiddenFolderIds.has(folder.id)) {
      map.set(folder.id, folder);
    }
  }
  for (const remote of remoteFolders) {
    if (hiddenFolderIds.has(remote.id)) continue;
    const local = map.get(remote.id);
    if (!local) {
      map.set(remote.id, remote);
    } else if ((remote.updatedAt || '') >= (local.updatedAt || '')) {
      map.set(remote.id, { ...local, ...remote });
    }
  }
  return migrateFolders(Array.from(map.values()));
}

export function mergeDecksById(
  localDecks: Deck[],
  remoteDecks: Deck[],
  userId?: string | null,
  hiddenDeckIds: ReadonlySet<string> = new Set()
): Deck[] {
  const map = new Map<string, Deck>();
  for (const deck of localDecks) {
    if (!hiddenDeckIds.has(deck.id)) {
      map.set(deck.id, deck);
    }
  }
  for (const remote of remoteDecks) {
    if (remote.id === 'deck_n3_grammar' || remote.id === 'deck_n3_kanji') continue;
    if (hiddenDeckIds.has(remote.id)) continue;
    const local = map.get(remote.id);
    if (!local) {
      map.set(remote.id, remote);
    } else {
      const remoteNewer = (remote.updatedAt || '') >= (local.updatedAt || '');
      const merged: Deck = remoteNewer
        ? {
            ...local,
            ...remote,
            cardsHash: remote.cardsHash || local.cardsHash,
            bundleChunkCount: remote.bundleChunkCount ?? local.bundleChunkCount,
            cardCount: remote.cardCount ?? local.cardCount
          }
        : {
            ...remote,
            ...local,
            cardsHash: local.cardsHash || remote.cardsHash,
            bundleChunkCount: local.bundleChunkCount ?? remote.bundleChunkCount,
            cardCount: local.cardCount ?? remote.cardCount
          };
      map.set(remote.id, merged);
    }
  }
  return migrateDecks(Array.from(map.values()), userId);
}

/**
 * Writes packed deck card bundles to `/users/{uid}/deckBundles/{bundleId}` ONLY for
 * owned custom decks whose `cardsHash` changed since last sync (0 writes for unchanged decks).
 */
export async function syncDirtyDeckBundlesWithDb(
  db: Firestore,
  userId: string,
  decks: Deck[],
  cards: StudyCard[],
  options: {
    syncedHashes?: Record<string, string>;
    forceDeckIds?: ReadonlySet<string>;
  } = {}
): Promise<SyncDirtyDeckBundlesResult> {
  const nextHashes: Record<string, string> = { ...(options.syncedHashes || {}) };
  if (!userId || userId === 'local_device') {
    return { updatedDecks: decks, syncedDeckIds: [], writesCount: 0, hashes: nextHashes };
  }

  const cardsByDeck = new Map<string, StudyCard[]>();
  for (const card of cards) {
    if (!card.deckId) continue;
    const list = cardsByDeck.get(card.deckId);
    if (list) list.push(card);
    else cardsByDeck.set(card.deckId, [card]);
  }

  const nowIso = new Date().toISOString();
  const updatedDecks: Deck[] = [];
  const syncedDeckIds: string[] = [];
  let writesCount = 0;

  interface BundleOp {
    kind: 'set' | 'delete';
    bundleId: string;
    data?: Record<string, unknown>;
  }
  const pendingOps: BundleOp[] = [];

  for (const deck of decks) {
    if (!isOwnedCustomDeck(deck)) {
      updatedDecks.push(deck);
      continue;
    }

    const deckCards = cardsByDeck.get(deck.id) || [];
    const packed = packDeckCards(deckCards);
    const nextHash = computeDeckCardsHash(packed);
    const chunks = splitIntoBundleChunks(deck.id, packed, nextHash, nowIso);
    const prevHash = nextHashes[deck.id] || '';
    const force = Boolean(options.forceDeckIds?.has(deck.id));

    const updatedDeck: Deck = {
      ...deck,
      cardsHash: nextHash || undefined,
      bundleChunkCount: chunks.length > 0 ? chunks.length : undefined,
      cardCount: packed.length
    };
    updatedDecks.push(updatedDeck);

    if (!force && nextHash === prevHash) {
      continue;
    }

    const prevChunkCount = Math.max(deck.bundleChunkCount || 0, prevHash ? 1 : 0);

    if (chunks.length === 0) {
      if (prevChunkCount > 0) {
        for (let idx = 0; idx < prevChunkCount; idx++) {
          pendingOps.push({ kind: 'delete', bundleId: getDeckBundleDocId(deck.id, idx) });
        }
      }
      delete nextHashes[deck.id];
      syncedDeckIds.push(deck.id);
    } else {
      for (const chunk of chunks) {
        pendingOps.push({
          kind: 'set',
          bundleId: chunk.bundleId,
          data: sanitizeFirestoreData(chunk.data as unknown as Record<string, unknown>)
        });
      }
      if (prevChunkCount > chunks.length) {
        for (let idx = chunks.length; idx < prevChunkCount; idx++) {
          pendingOps.push({ kind: 'delete', bundleId: getDeckBundleDocId(deck.id, idx) });
        }
      }
      nextHashes[deck.id] = nextHash;
      syncedDeckIds.push(deck.id);
    }
  }

  const BATCH_LIMIT = 450;
  for (let i = 0; i < pendingOps.length; i += BATCH_LIMIT) {
    const slice = pendingOps.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const op of slice) {
      const ref = doc(db, 'users', userId, 'deckBundles', op.bundleId);
      if (op.kind === 'set' && op.data) {
        batch.set(ref, op.data);
      } else {
        batch.delete(ref);
      }
    }
    await batch.commit();
    writesCount += slice.length;
  }

  return {
    updatedDecks,
    syncedDeckIds,
    writesCount,
    hashes: nextHashes
  };
}

/**
 * Atomically writes a single owned custom deck's metadata + packed card bundle
 * (typically 2 Firestore writes total, regardless of whether the deck has 5 or 500 words).
 */
export async function syncSingleDeckBundleWithDb(
  db: Firestore,
  userId: string,
  deck: Deck,
  cardsInDeck: StudyCard[],
  syncedHashes: Record<string, string> = {},
  folder?: Folder
): Promise<{
  updatedDeck: Deck;
  writesCount: number;
  hashes: Record<string, string>;
}> {
  const nextHashes: Record<string, string> = { ...syncedHashes };
  if (!userId || userId === 'local_device' || !isOwnedCustomDeck(deck)) {
    return { updatedDeck: deck, writesCount: 0, hashes: nextHashes };
  }

  const nowIso = new Date().toISOString();
  const packed = packDeckCards(cardsInDeck);
  const nextHash = computeDeckCardsHash(packed);
  const chunks = splitIntoBundleChunks(deck.id, packed, nextHash, nowIso);
  const prevChunkCount = Math.max(deck.bundleChunkCount || 0, nextHashes[deck.id] ? 1 : 0);

  const updatedDeck: Deck = {
    ...deck,
    cardsHash: nextHash || undefined,
    bundleChunkCount: chunks.length > 0 ? chunks.length : undefined,
    cardCount: packed.length,
    updatedAt: nowIso
  };

  const batch = writeBatch(db);
  let writesCount = 0;

  if (folder) {
    batch.set(
      doc(db, 'users', userId, 'folders', folder.id),
      sanitizeFirestoreData(folder as unknown as Record<string, unknown>),
      { merge: true }
    );
    writesCount++;
  }

  batch.set(
    doc(db, 'users', userId, 'decks', deck.id),
    sanitizeFirestoreData(updatedDeck as unknown as Record<string, unknown>),
    { merge: true }
  );
  writesCount++;

  if (chunks.length === 0) {
    for (let idx = 0; idx < prevChunkCount; idx++) {
      batch.delete(doc(db, 'users', userId, 'deckBundles', getDeckBundleDocId(deck.id, idx)));
      writesCount++;
    }
    delete nextHashes[deck.id];
  } else {
    for (const chunk of chunks) {
      batch.set(
        doc(db, 'users', userId, 'deckBundles', chunk.bundleId),
        sanitizeFirestoreData(chunk.data as unknown as Record<string, unknown>)
      );
      writesCount++;
    }
    if (prevChunkCount > chunks.length) {
      for (let idx = chunks.length; idx < prevChunkCount; idx++) {
        batch.delete(doc(db, 'users', userId, 'deckBundles', getDeckBundleDocId(deck.id, idx)));
        writesCount++;
      }
    }
    nextHashes[deck.id] = nextHash;
  }

  await batch.commit();
  return { updatedDeck, writesCount, hashes: nextHashes };
}

/**
 * Deletes a custom deck doc and all its bundle chunks in 1 atomic writeBatch.
 */
export async function deleteDeckFromCloudWithDb(
  db: Firestore,
  userId: string,
  deckId: string,
  chunkCount = 1
): Promise<void> {
  if (!userId || userId === 'local_device' || !deckId) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', userId, 'decks', deckId));
  const safeChunks = Math.max(1, Math.min(chunkCount, 20));
  for (let idx = 0; idx < safeChunks; idx++) {
    batch.delete(doc(db, 'users', userId, 'deckBundles', getDeckBundleDocId(deckId, idx)));
  }
  await batch.commit();
}

/**
 * Pulls packed deck bundles ONLY for decks whose remote `cardsHash` differs from the
 * locally synced hash (or when the device currently has 0 local cards for that deck).
 * Unchanged decks incur ZERO Firestore reads.
 */
export async function pullDeckBundlesWithDb(
  db: Firestore,
  userId: string,
  remoteDecks: Deck[],
  currentCards: StudyCard[],
  syncedHashes: Record<string, string> = {}
): Promise<PullDeckBundlesResult> {
  const nextHashes: Record<string, string> = { ...syncedHashes };
  if (!userId || userId === 'local_device' || remoteDecks.length === 0) {
    return { cards: currentCards, fetchedDeckCount: 0, readsCount: 0, hashes: nextHashes };
  }

  const localCustomCountByDeck = new Map<string, number>();
  for (const card of currentCards) {
    if (!card.deckId || !isCustomBundleCard(card)) continue;
    localCustomCountByDeck.set(card.deckId, (localCustomCountByDeck.get(card.deckId) || 0) + 1);
  }

  const decksToFetch = remoteDecks.filter((deck) => {
    if (!isOwnedCustomDeck(deck)) return false;
    const remoteHash = typeof deck.cardsHash === 'string' ? deck.cardsHash : '';
    const localCount = localCustomCountByDeck.get(deck.id) || 0;
    if (!remoteHash) {
      // Legacy deck without cardsHash yet: skip bundle read if local already has cards
      return localCount === 0 && (deck.cardCount === undefined || deck.cardCount > 0);
    }
    const localSyncedHash = nextHashes[deck.id] || '';
    const hashMatches = localSyncedHash === remoteHash;
    const expectedNonEmpty = deck.cardCount === undefined || deck.cardCount > 0;
    return !hashMatches || (expectedNonEmpty && localCount === 0);
  });

  if (decksToFetch.length === 0) {
    return { cards: currentCards, fetchedDeckCount: 0, readsCount: 0, hashes: nextHashes };
  }

  let mergedCards = currentCards;
  let fetchedDeckCount = 0;
  let readsCount = 0;

  await Promise.all(
    decksToFetch.map(async (deck) => {
      const chunkCount = Math.max(1, Math.min(deck.bundleChunkCount || 1, 20));
      const chunkSnaps = await Promise.all(
        Array.from({ length: chunkCount }, (_, idx) =>
          getDoc(doc(db, 'users', userId, 'deckBundles', getDeckBundleDocId(deck.id, idx)))
        )
      );
      readsCount += chunkSnaps.length;

      const packedCards: PackedDeckCard[] = [];
      let foundAnyChunk = false;
      let resolvedHash = deck.cardsHash || '';

      for (const snap of chunkSnaps) {
        if (!snap.exists()) continue;
        foundAnyChunk = true;
        const data = snap.data() as Partial<DeckBundleChunkDoc>;
        if (!resolvedHash && typeof data.cardsHash === 'string') {
          resolvedHash = data.cardsHash;
        }
        if (Array.isArray(data.cards)) {
          packedCards.push(...(data.cards as PackedDeckCard[]));
        }
      }

      if (!foundAnyChunk) return;

      const res = mergeDeckBundleCardsIntoLocal(mergedCards, deck.id, packedCards, {
        authoritative: Boolean(deck.cardsHash)
      });
      mergedCards = res.cards;
      fetchedDeckCount++;
      if (resolvedHash) {
        nextHashes[deck.id] = resolvedHash;
      }
    })
  );

  return {
    cards: mergedCards,
    fetchedDeckCount,
    readsCount,
    hashes: nextHashes
  };
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
          const isCustomWord =
            item.card.type === 'word' &&
            Boolean(item.card.word) &&
            !WORDS_BY_ID.has(item.card.refId);
          batch.set(
            cardRef,
            sanitizeFirestoreData({
              id: cardId,
              refId: item.card.refId || cardId,
              type: item.card.type || 'word',
              deckId: item.card.deckId,
              ...(isCustomWord && item.card.word ? { word: item.card.word } : {}),
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
      await setDoc(
        doc(db, 'users', userId),
        { structureFingerprint: folderDeckFingerprint(folders, decks) },
        { merge: true }
      );
    },

    async syncDirtyDeckBundles(
      userId: string,
      decks: Deck[],
      cards: StudyCard[],
      forceDeckIds?: ReadonlySet<string>
    ): Promise<SyncDirtyDeckBundlesResult> {
      const syncedHashes = await repository.loadSyncedBundleHashes(userId);
      const res = await syncDirtyDeckBundlesWithDb(db, userId, decks, cards, {
        syncedHashes,
        forceDeckIds
      });
      await repository.saveSyncedBundleHashes(userId, res.hashes);
      return res;
    },

    async syncSingleDeckBundle(
      userId: string,
      deck: Deck,
      cardsInDeck: StudyCard[],
      folder?: Folder
    ): Promise<Deck> {
      const syncedHashes = await repository.loadSyncedBundleHashes(userId);
      const res = await syncSingleDeckBundleWithDb(db, userId, deck, cardsInDeck, syncedHashes, folder);
      await repository.saveSyncedBundleHashes(userId, res.hashes);
      return res.updatedDeck;
    },

    async deleteDeckFromCloud(userId: string, deckId: string, chunkCount = 1): Promise<void> {
      await deleteDeckFromCloudWithDb(db, userId, deckId, chunkCount);
      const syncedHashes = await repository.loadSyncedBundleHashes(userId);
      if (deckId in syncedHashes) {
        delete syncedHashes[deckId];
        await repository.saveSyncedBundleHashes(userId, syncedHashes);
      }
    },

    async syncCustomKanjiBundle(userId: string, customKanji: Kanji[]): Promise<boolean> {
      const lastHash = await repository.loadSyncedCustomKanjiHash(userId);
      const res = await syncCustomKanjiBundleWithDb(db, userId, customKanji, lastHash);
      if (res.synced && res.hash) {
        await repository.saveSyncedCustomKanjiHash(userId, res.hash);
      }
      return res.synced;
    },

    async pullCustomKanjiBundle(
      userId: string,
      localKanji: Kanji[],
      remoteHash?: string
    ): Promise<{ list: Kanji[]; fetched: boolean; addedCount: number }> {
      const lastHash = await repository.loadSyncedCustomKanjiHash(userId);
      const res = await pullCustomKanjiBundleWithDb(db, userId, localKanji, remoteHash, lastHash);
      if (res.fetched && res.hash) {
        await repository.saveSyncedCustomKanjiHash(userId, res.hash);
      }
      return { list: res.list, fetched: res.fetched, addedCount: res.addedCount };
    },

    async pullDecksAndBundlesOnly(
      userId: string,
      currentFolders: Folder[],
      currentDecks: Deck[],
      currentCards: StudyCard[]
    ): Promise<PullDecksAndBundlesResult> {
      const [foldersSnap, decksSnap, syncPrefs, syncedHashes, communityPayloads] =
        await Promise.all([
          getDocs(collection(db, 'users', userId, 'folders')),
          getDocs(collection(db, 'users', userId, 'decks')),
          repository.loadDeckSyncPrefs(userId),
          repository.loadSyncedBundleHashes(userId),
          fetchCommunityDecksFromDb(db).catch(() => [])
        ]);

      const hiddenDeckIds = new Set(syncPrefs.hiddenDeckIds);
      const hiddenFolderIds = new Set(syncPrefs.hiddenFolderIds);

      const remoteFolders = foldersSnap.docs.map((item) => item.data() as Folder);
      const remoteDecks = decksSnap.docs
        .map((item) => item.data() as Deck)
        .filter((d) => d.id !== 'deck_n3_grammar' && d.id !== 'deck_n3_kanji');

      const mergedFolders =
        remoteFolders.length > 0
          ? mergeFoldersById(currentFolders, remoteFolders, hiddenFolderIds)
          : currentFolders;
      const mergedDecks =
        remoteDecks.length > 0
          ? mergeDecksById(currentDecks, remoteDecks, userId, hiddenDeckIds)
          : currentDecks;

      const bundleRes = await pullDeckBundlesWithDb(
        db,
        userId,
        mergedDecks,
        currentCards,
        syncedHashes
      );
      if (bundleRes.fetchedDeckCount > 0) {
        await repository.saveSyncedBundleHashes(userId, bundleRes.hashes);
      }

      const communityRes =
        communityPayloads.length > 0
          ? mergeCommunityDecksIntoLocalState(
              mergedDecks,
              mergedFolders,
              bundleRes.cards,
              communityPayloads,
              { hiddenDeckIds, hiddenFolderIds, currentUid: userId }
            )
          : {
              updatedDecks: mergedDecks,
              updatedFolders: mergedFolders,
              updatedCards: bundleRes.cards,
              newDecksCount: 0,
              newCardsCount: 0,
              hasChanges: false
            };

      const structureChanged =
        folderDeckFingerprint(currentFolders, currentDecks) !==
        folderDeckFingerprint(communityRes.updatedFolders, communityRes.updatedDecks);

      return {
        cards: communityRes.updatedCards,
        folders: communityRes.updatedFolders,
        decks: communityRes.updatedDecks,
        bundlesFetchedCount: bundleRes.fetchedDeckCount,
        communityNewDecksCount: communityRes.newDecksCount,
        hasChanges:
          structureChanged || bundleRes.fetchedDeckCount > 0 || communityRes.hasChanges
      };
    },

    async pullFromCloud(
      userId: string,
      currentCards: StudyCard[],
      existingStats: UserStudyStats,
      currentStructure?: { folders: Folder[]; decks: Deck[] }
    ): Promise<PullCloudResult> {
      const [cardsSnap, userSnap, foldersSnap, decksSnap, syncPrefs, syncedHashes, communityPayloads] =
        await Promise.all([
          getDocs(collection(db, 'users', userId, 'cards')),
          getDoc(doc(db, 'users', userId)),
          getDocs(collection(db, 'users', userId, 'folders')),
          getDocs(collection(db, 'users', userId, 'decks')),
          repository.loadDeckSyncPrefs(userId),
          repository.loadSyncedBundleHashes(userId),
          fetchCommunityDecksFromDb(db).catch(() => [])
        ]);

      const cloudCards: Record<string, Record<string, unknown>> = {};
      cardsSnap.forEach((item) => {
        cloudCards[item.id] = item.data() as Record<string, unknown>;
      });

      const hiddenDeckIds = new Set(syncPrefs.hiddenDeckIds);
      const hiddenFolderIds = new Set(syncPrefs.hiddenFolderIds);

      const remoteFolders = foldersSnap.docs.map((item) => item.data() as Folder);
      const remoteDecks = decksSnap.docs
        .map((item) => item.data() as Deck)
        .filter((d) => d.id !== 'deck_n3_grammar' && d.id !== 'deck_n3_kanji');

      const baseFolders = currentStructure?.folders || [];
      const baseDecks = currentStructure?.decks || [];

      const resolvedFolders =
        remoteFolders.length > 0
          ? baseFolders.length > 0
            ? mergeFoldersById(baseFolders, remoteFolders, hiddenFolderIds)
            : migrateFolders(remoteFolders)
          : baseFolders.length > 0
            ? baseFolders
            : undefined;

      const resolvedDecks =
        remoteDecks.length > 0
          ? baseDecks.length > 0
            ? mergeDecksById(baseDecks, remoteDecks, userId, hiddenDeckIds)
            : migrateDecks(remoteDecks, userId)
          : baseDecks.length > 0
            ? baseDecks
            : undefined;

      // 1. Pull packed custom deck bundles (ONLY decks whose cardsHash changed -> 0 reads if unchanged)
      const bundleRes = await pullDeckBundlesWithDb(
        db,
        userId,
        resolvedDecks || [],
        currentCards,
        syncedHashes
      );
      if (bundleRes.fetchedDeckCount > 0) {
        await repository.saveSyncedBundleHashes(userId, bundleRes.hashes);
      }

      // 2. Merge community decks so Mobile & Web stay in parity for shared decks
      const communityRes =
        communityPayloads.length > 0
          ? mergeCommunityDecksIntoLocalState(
              resolvedDecks || [],
              resolvedFolders || [],
              bundleRes.cards,
              communityPayloads,
              { hiddenDeckIds, hiddenFolderIds, currentUid: userId }
            )
          : {
              updatedDecks: resolvedDecks || [],
              updatedFolders: resolvedFolders || [],
              updatedCards: bundleRes.cards,
              newDecksCount: 0,
              newCardsCount: 0,
              hasChanges: false
            };

      // 3. Apply FSRS progress snapshots from /users/{uid}/cards on top of restored vocabulary
      const mergedCards = mergeFirestoreCardProgress(communityRes.updatedCards, cloudCards);

      const profileData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : undefined;
      const remoteKanjiHash =
        typeof profileData?.customKanjiHash === 'string' ? profileData.customKanjiHash : '';
      let mergedCustomKanji: Kanji[] | undefined;
      if (remoteKanjiHash) {
        const [localCustomKanji, lastKanjiHash] = await Promise.all([
          repository.loadCustomKanji(userId),
          repository.loadSyncedCustomKanjiHash(userId)
        ]);
        const kanjiRes = await pullCustomKanjiBundleWithDb(
          db,
          userId,
          localCustomKanji,
          remoteKanjiHash,
          lastKanjiHash
        );
        if (kanjiRes.fetched) {
          await repository.saveSyncedCustomKanjiHash(userId, kanjiRes.hash);
          mergedCustomKanji = kanjiRes.list;
        }
      }

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
        folders: communityRes.updatedFolders.length > 0 ? communityRes.updatedFolders : resolvedFolders,
        decks: communityRes.updatedDecks.length > 0 ? communityRes.updatedDecks : resolvedDecks,
        customKanji: mergedCustomKanji,
        stats: mergedStats,
        cloudCardCount: Object.keys(cloudCards).length,
        bundlesFetchedCount: bundleRes.fetchedDeckCount,
        communityNewDecksCount: communityRes.newDecksCount
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
    },

    async upsertCustomCardToCloud(userId: string, card: StudyCard): Promise<void> {
      if (!userId || userId === 'local_device' || !card.word) return;
      const fsrs = card.fsrsCard;
      await setDoc(
        doc(db, 'users', userId, 'cards', card.id),
        sanitizeFirestoreData({
          id: card.id,
          refId: card.refId || card.id,
          type: card.type || 'word',
          deckId: card.deckId,
          word: card.word,
          due: safeISOString(fsrs?.due),
          stability: safeNumber(fsrs?.stability),
          difficulty: safeNumber(fsrs?.difficulty),
          elapsed_days: safeNumber(fsrs?.elapsed_days),
          scheduled_days: safeNumber(fsrs?.scheduled_days),
          reps: safeNumber(fsrs?.reps),
          lapses: safeNumber(fsrs?.lapses),
          state: safeNumber(fsrs?.state),
          last_review: safeISOString(fsrs?.last_review),
          firstLearnedAt: card.firstLearnedAt || undefined,
          learnedAt: card.learnedAt || undefined,
          updatedAt: serverTimestamp()
        }),
        { merge: true }
      );
    },

    async upsertConversationSessionToCloud(
      userId: string,
      session: ConversationSession
    ): Promise<void> {
      if (!userId || userId === 'local_device') return;
      const bounded: ConversationSession = {
        ...session,
        messages: session.messages.slice(-60)
      };
      await setDoc(
        doc(db, 'users', userId, 'conversationSessions', bounded.id),
        sanitizeFirestoreData(bounded as unknown as Record<string, unknown>),
        { merge: true }
      );
    },

    async deleteConversationSessionFromCloud(userId: string, sessionId: string): Promise<void> {
      if (!userId || userId === 'local_device') return;
      await deleteDoc(doc(db, 'users', userId, 'conversationSessions', sessionId));
    },

    async pullConversationSessionsFromCloud(userId: string): Promise<ConversationSession[]> {
      if (!userId || userId === 'local_device') return [];
      const snap = await getDocs(
        query(
          collection(db, 'users', userId, 'conversationSessions'),
          orderBy('updatedAt', 'desc'),
          limit(MAX_LOCAL_CONVERSATION_SESSIONS)
        )
      );
      const list: ConversationSession[] = [];
      snap.forEach((item) => {
        const parsed = ConversationSessionSchema.safeParse({ ...item.data(), id: item.id });
        if (parsed.success) list.push(parsed.data);
      });
      return list;
    },

    async upsertSentenceAttemptToCloud(
      userId: string,
      attempt: SentenceAttemptRecord
    ): Promise<void> {
      if (!userId || userId === 'local_device') return;
      const bounded: SentenceAttemptRecord = {
        ...attempt,
        userSentence: attempt.userSentence.slice(0, 1000)
      };
      await setDoc(
        doc(db, 'users', userId, 'sentenceHistory', bounded.id),
        sanitizeFirestoreData(bounded as unknown as Record<string, unknown>),
        { merge: true }
      );
    },

    async pullSentenceHistoryFromCloud(userId: string): Promise<SentenceAttemptRecord[]> {
      if (!userId || userId === 'local_device') return [];
      const snap = await getDocs(
        query(
          collection(db, 'users', userId, 'sentenceHistory'),
          orderBy('createdAt', 'desc'),
          limit(MAX_LOCAL_SENTENCE_HISTORY)
        )
      );
      const list: SentenceAttemptRecord[] = [];
      snap.forEach((item) => {
        const parsed = SentenceAttemptRecordSchema.safeParse({ ...item.data(), id: item.id });
        if (parsed.success) list.push(parsed.data);
      });
      return list;
    }
  };
}
