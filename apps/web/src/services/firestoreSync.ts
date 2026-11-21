import {
  doc,
  setDoc,
  collection,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  Timestamp,
  writeBatch,
  serverTimestamp,
  waitForPendingWrites
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  type StudyCard,
  type Folder,
  type Deck,
  type UserStudyStats,
  type CardReviewLog,
  applyReviewLogsToCards,
  getTodayDateString,
  SEED_KANJI,
  SEED_WORDS,
  SEED_SENTENCES
} from '@raku/core';
import { db } from './firebase';

/**
 * Đồng bộ thông tin người dùng lên collection /users/{uid}
 */
export async function syncUserProfile(user: User): Promise<void> {
  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || null,
        isAnonymous: user.isAnonymous
      },
      { merge: true }
    );
    console.log(`✓ Đã đồng bộ tài khoản người dùng lên Firestore (/users/${user.uid})`);
  } catch (err) {
    console.warn(
      'Lưu thông tin người dùng lên Firestore thất bại (có thể do offline hoặc chưa thiết lập .env):',
      err
    );
  }
}

export type { OfflineReviewItem } from './userStorage';
export type { DeckSyncPrefs } from './userStorage';
export {
  getOfflineReviewQueue,
  getPendingSyncCount,
  enqueueOfflineReview,
  clearOfflineReviewQueue,
  removeOfflineReviewItems,
  clearUserDataFromBrowser,
  loadUserCards,
  saveUserCards,
  loadUserStudyStats,
  saveUserStudyStats,
  loadUserFolders,
  saveUserFolders,
  loadUserDecks,
  saveUserDecks,
  loadDeckSyncPrefs,
  saveDeckSyncPrefs,
  loadDailyNewWordGoal,
  saveDailyNewWordGoal,
  DAILY_NEW_WORD_GOAL_OPTIONS
} from './userStorage';
import {
  getOfflineReviewQueue,
  enqueueOfflineReview,
  removeOfflineReviewItems
} from './userStorage';

/**
 * Kiểm tra xem trên Cloud Firestore của user này có dữ liệu hay không
 */
export async function checkCloudDataStatus(userId: string): Promise<{
  hasCloudData: boolean;
}> {
  if (!userId || userId === 'local_device') {
    return { hasCloudData: false };
  }
  try {
    const [logsSnap, cardsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users', userId, 'reviewLogs'), limit(1))),
      getDocs(query(collection(db, 'users', userId, 'cards'), limit(1)))
    ]);
    return { hasCloudData: !logsSnap.empty || !cardsSnap.empty };
  } catch (err) {
    console.warn('Lỗi khi kiểm tra dữ liệu trên Cloud:', err);
    throw err;
  }
}

function sanitizeFirestoreValue(value: any): any {
  if (value === undefined) return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (Array.isArray(value)) {
    const cleaned: any[] = [];
    for (const item of value) {
      const next = sanitizeFirestoreValue(item);
      if (next !== undefined) cleaned.push(next);
    }
    return cleaned;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    // FieldValue (serverTimestamp, deleteField, etc.) or Timestamp — preserve as-is
    if (typeof value.isEqual === 'function' || value._methodName || typeof value.toMillis === 'function') {
      return value;
    }
    return sanitizeFirestoreData(value);
  }
  return value;
}

/**
 * Lọc bỏ mọi giá trị undefined, NaN, Infinity (kể cả bên trong mảng lồng nhau)
 * trước khi đẩy lên Firestore để tránh lỗi 'Unsupported field value: undefined/NaN'
 */
export function sanitizeFirestoreData<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const cleaned = sanitizeFirestoreValue(value);
    if (cleaned !== undefined) {
      result[key] = cleaned;
    }
  }
  return result as T;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Chuyển một giá trị số về số hợp lệ, trả về fallback nếu NaN/Infinity/undefined/null
 */
function safeNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Chuyển giá trị ngày thành chuỗi ISO hợp lệ, trả về null nếu không parse được
 */
function safeISOString(val: any): string | null {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Đẩy toàn bộ hàng đợi ngoại tuyến lên Firestore (khi có mạng trở lại)
 * Dùng writeBatch để đẩy hàng loạt cực nhanh (<0.5s) thay vì chạy vòng lặp tuần tự từng bản ghi
 */
export async function flushOfflineQueue(userId: string): Promise<number> {
  if ((typeof navigator !== 'undefined' && !navigator.onLine) || !userId || userId === 'local_device') return 0;
  const queue = getOfflineReviewQueue(userId);
  let syncedCount = 0;
  // 200 reviews produce at most 400 writes (card + log), below Firestore's 500 limit.
  const CHUNK_SIZE = 200;

  for (let i = 0; i < queue.length; i += CHUNK_SIZE) {
    const chunk = queue.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    const acknowledgedIds: string[] = [];
    const malformedIds: string[] = [];
    const validItems: typeof chunk = [];
    const latestReviewByCard = new Map<string, (typeof chunk)[number]>();
    for (const item of chunk) {
      const cardId = item?.card?.id;
      if (!item?.id || !cardId || typeof cardId !== 'string' || !cardId.trim()) {
        console.warn('[flushOfflineQueue] Bỏ qua bản ghi hỏng trong hàng đợi offline:', item?.id || '(missing id)');
        if (item?.id) malformedIds.push(item.id);
        continue;
      }
      validItems.push(item);
      latestReviewByCard.set(cardId, item);
      acknowledgedIds.push(item.id);
    }

    if (malformedIds.length > 0) {
      removeOfflineReviewItems(userId, malformedIds);
    }
    if (validItems.length === 0) continue;

    // A card may have several queued reviews; only its newest state needs writing.
    for (const [cardId, item] of latestReviewByCard) {
      const fsrs = item.card.fsrsCard;
      const cardRef = doc(db, 'users', userId, 'cards', cardId);
      batch.set(cardRef, sanitizeFirestoreData({
        id: cardId, refId: item.card.refId || cardId, type: item.card.type || 'word',
        due: safeISOString(fsrs?.due), stability: safeNumber(fsrs?.stability),
        difficulty: safeNumber(fsrs?.difficulty), elapsed_days: safeNumber(fsrs?.elapsed_days),
        scheduled_days: safeNumber(fsrs?.scheduled_days), reps: safeNumber(fsrs?.reps),
        lapses: safeNumber(fsrs?.lapses), state: safeNumber(fsrs?.state),
        last_review: safeISOString(fsrs?.last_review), firstLearnedAt: item.card.firstLearnedAt || undefined,
        learnedAt: item.card.learnedAt || (safeNumber(item.rating) > 1 ? item.reviewedAt : undefined),
        updatedAt: serverTimestamp()
      }), { merge: true });
    }

    // Keep every event for cross-device daily counts and history.
    for (const item of validItems) {
      const cardId = item.card.id;
      const fsrs = item.card.fsrsCard;
      // Stable ID and deterministic reviewedAt make retries idempotent on Firestore rules.
      const logRef = doc(db, 'users', userId, 'reviewLogs', encodeURIComponent(item.id));
      batch.set(logRef, sanitizeFirestoreData({
        cardId, rating: safeNumber(item.rating, 3), state: safeNumber(fsrs?.state),
        reviewedAt: item.reviewedAt || safeISOString(fsrs?.last_review) || '1970-01-01T00:00:00.000Z'
      }));
    }
    // Keep unconfirmed items in the queue, and preserve items added while syncing.
    await batch.commit();
    removeOfflineReviewItems(userId, acknowledgedIds);
    syncedCount += acknowledgedIds.length;
  }
  return syncedCount;
}

/**
 * Lưu tiến độ thẻ ôn tập FSRS và ghi nhật ký ôn tập vào Firestore.
 * Nếu đang ngoại tuyến hoặc kết nối mạng lỗi, tự động lưu vào hàng đợi offline.
 */
export async function saveCardProgress(userId: string, card: StudyCard, rating: number): Promise<{ success: boolean; queued: boolean }> {
  const review = { id: userId + '_' + card.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2), userId, card, rating, reviewedAt: new Date().toISOString() };
  if (typeof navigator !== 'undefined' && !navigator.onLine) { enqueueOfflineReview(review); return { success: true, queued: true }; }

  try {
    const batch = writeBatch(db);
    const cardRef = doc(db, 'users', userId, 'cards', card.id);
    batch.set(cardRef, sanitizeFirestoreData({
      id: card.id, refId: card.refId, type: card.type,
      due: safeISOString(card.fsrsCard.due), stability: safeNumber(card.fsrsCard.stability),
      difficulty: safeNumber(card.fsrsCard.difficulty), elapsed_days: safeNumber(card.fsrsCard.elapsed_days),
      scheduled_days: safeNumber(card.fsrsCard.scheduled_days), reps: safeNumber(card.fsrsCard.reps),
      lapses: safeNumber(card.fsrsCard.lapses), state: safeNumber(card.fsrsCard.state),
      last_review: safeISOString(card.fsrsCard.last_review), firstLearnedAt: card.firstLearnedAt || undefined,
      learnedAt: card.learnedAt || (rating > 1 ? review.reviewedAt : undefined),
      updatedAt: serverTimestamp()
    }), { merge: true });
    const logRef = doc(db, 'users', userId, 'reviewLogs', encodeURIComponent(review.id));
    batch.set(logRef, sanitizeFirestoreData({ cardId: card.id, rating, state: card.fsrsCard.state, reviewedAt: review.reviewedAt }));
    await batch.commit();
    return { success: true, queued: false };
  } catch (err) {
    console.warn('L?u ti?n ?? FSRS l?n Firestore th?t b?i, t? ??ng l?u v?o h?ng ??i offline:', err);
    enqueueOfflineReview(review);
    return { success: false, queued: true };
  }
}

/**
 * Xuất cơ sở dữ liệu N3 (Kanji, Từ vựng, Câu ví dụ) lên Cloud Firestore
 * Sử dụng writeBatch phân đoạn tối đa 450 bản ghi/lần (giới hạn Firestore: 500)
 */
export async function seedAllN3DataToFirestore(
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<{
  kanjiCount: number;
  wordsCount: number;
  sentencesCount: number;
}> {
  const BATCH_SIZE = 450;

  // 1. Xuất 609 chữ Kanji
  onProgress?.('Chữ Hán Kanji', 0, SEED_KANJI.length);
  for (let i = 0; i < SEED_KANJI.length; i += BATCH_SIZE) {
    const chunk = SEED_KANJI.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const k of chunk) {
      const ref = doc(db, 'kanji', k.char);
      batch.set(ref, k);
    }
    await batch.commit();
    onProgress?.('Chữ Hán Kanji', Math.min(i + BATCH_SIZE, SEED_KANJI.length), SEED_KANJI.length);
  }

  // 2. Xuất 880 từ vựng Mimikara
  onProgress?.('Từ vựng Mimikara N3', 0, SEED_WORDS.length);
  for (let i = 0; i < SEED_WORDS.length; i += BATCH_SIZE) {
    const chunk = SEED_WORDS.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const w of chunk) {
      const ref = doc(db, 'words', w.id);
      batch.set(ref, w);
    }
    await batch.commit();
    onProgress?.(
      'Từ vựng Mimikara N3',
      Math.min(i + BATCH_SIZE, SEED_WORDS.length),
      SEED_WORDS.length
    );
  }

  // 3. Xuất 880 câu ví dụ
  onProgress?.('Câu ví dụ minh họa', 0, SEED_SENTENCES.length);
  for (let i = 0; i < SEED_SENTENCES.length; i += BATCH_SIZE) {
    const chunk = SEED_SENTENCES.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const s of chunk) {
      const ref = doc(db, 'sentences', s.id);
      batch.set(ref, s);
    }
    await batch.commit();
    onProgress?.(
      'Câu ví dụ minh họa',
      Math.min(i + BATCH_SIZE, SEED_SENTENCES.length),
      SEED_SENTENCES.length
    );
  }

  return {
    kanjiCount: SEED_KANJI.length,
    wordsCount: SEED_WORDS.length,
    sentencesCount: SEED_SENTENCES.length
  };
}

function parseReviewDate(value: any): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value.seconds === 'number') {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function parseReviewLogs(
  snapshots: Array<{ forEach: (callback: (document: any) => void) => void }>
): CardReviewLog[] {
  const logs: CardReviewLog[] = [];
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    snapshot.forEach((document) => {
      if (seen.has(document.id)) return;
      seen.add(document.id);
      const data = document.data();
      const reviewedAt = parseReviewDate(data.reviewedAt);
      if (!data.cardId || !reviewedAt) return;
      logs.push({
        cardId: String(data.cardId),
        rating: safeNumber(data.rating, 3),
        state: data.state,
        reviewedAt
      });
    });
  }
  return logs;
}

function isUserStudyStats(value: any): value is UserStudyStats {
  return Boolean(
    value && typeof value === 'object' && value.todayStats &&
    typeof value.todayStats.date === 'string'
  );
}

function mergeStudyStats(
  remoteStats: unknown,
  localStats: UserStudyStats | undefined,
  today: string
): UserStudyStats {
  const candidates = [remoteStats, localStats].filter(isUserStudyStats);
  const activeCandidates = candidates.filter((stats) =>
    stats.streakDays > 0 ||
    stats.totalCardsLearned > 0 ||
    stats.todayStats.reviewedCount > 0
  );
  const latestDate = activeCandidates
    .map((stats) => stats.lastStudiedDate)
    .filter((date): date is string => typeof date === 'string')
    .sort()
    .at(-1) || '';
  const latestCandidates = activeCandidates.filter((stats) => stats.lastStudiedDate === latestDate);
  const todayCandidates = candidates.filter((stats) => stats.todayStats.date === today);

  return {
    streakDays: Math.max(0, ...latestCandidates.map((stats) => safeNumber(stats.streakDays))),
    lastStudiedDate: latestDate,
    totalCardsLearned: Math.max(0, ...candidates.map((stats) => safeNumber(stats.totalCardsLearned))),
    todayStats: {
      date: today,
      studySeconds: Math.max(0, ...todayCandidates.map((stats) => safeNumber(stats.todayStats.studySeconds))),
      reviewedCount: Math.max(0, ...todayCandidates.map((stats) => safeNumber(stats.todayStats.reviewedCount))),
      againCount: Math.max(0, ...todayCandidates.map((stats) => safeNumber(stats.todayStats.againCount))),
      correctCount: Math.max(0, ...todayCandidates.map((stats) => safeNumber(stats.todayStats.correctCount)))
    }
  };
}

export function folderDeckFingerprint(folders: Folder[], decks: Deck[]): string {
  const value = JSON.stringify({
    folders: folders.map((folder) => sanitizeFirestoreData(folder)),
    decks: decks.map((deck) => sanitizeFirestoreData(deck))
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

export function areStudyStatsEqual(left: UserStudyStats, right?: UserStudyStats): boolean {
  if (!right) return false;
  return left.streakDays === right.streakDays &&
    left.lastStudiedDate === right.lastStudiedDate &&
    left.totalCardsLearned === right.totalCardsLearned &&
    left.todayStats.date === right.todayStats.date &&
    left.todayStats.studySeconds === right.todayStats.studySeconds &&
    left.todayStats.reviewedCount === right.todayStats.reviewedCount &&
    left.todayStats.againCount === right.todayStats.againCount &&
    left.todayStats.correctCount === right.todayStats.correctCount;
}

function addDays(date: string, amount: number): string {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const [fromYear = 1970, fromMonth = 1, fromDay = 1] = from.split('-').map(Number);
  const [toYear = 1970, toMonth = 1, toDay = 1] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000
  );
}

function buildStudyStats(
  logs: CardReviewLog[],
  baseStats: UserStudyStats,
  learnedCardsCount: number,
  now: Date,
  includesFullHistory: boolean
): UserStudyStats {
  const today = getTodayDateString(now);
  const todayLogs = logs.filter((log) => getTodayDateString(log.reviewedAt) === today);
  const reviewDates = Array.from(new Set(logs.map((log) => getTodayDateString(log.reviewedAt)))).sort();
  let lastStudiedDate = baseStats.lastStudiedDate;
  let streakDays = baseStats.streakDays;

  if (includesFullHistory) {
    streakDays = 0;
    if (reviewDates.length > 0) {
      lastStudiedDate = reviewDates[reviewDates.length - 1]!;
      const dates = new Set(reviewDates);
      let cursor = dates.has(today) ? today : addDays(today, -1);
      streakDays = 0;
      while (dates.has(cursor)) {
        streakDays++;
        cursor = addDays(cursor, -1);
      }
    }
  } else {
    for (const date of reviewDates) {
      if (lastStudiedDate && date <= lastStudiedDate) continue;
      streakDays = lastStudiedDate && daysBetween(lastStudiedDate, date) === 1
        ? streakDays + 1
        : 1;
      lastStudiedDate = date;
    }
    if (!lastStudiedDate || daysBetween(lastStudiedDate, today) > 1) streakDays = 0;
  }

  const reviewedCount = todayLogs.length;
  const finalReviewedCount = Math.max(reviewedCount, baseStats.todayStats.reviewedCount);
  const uniqueLearnedFromHistory = includesFullHistory
    ? new Set(logs.filter((log) => log.rating > 1).map((log) => log.cardId)).size
    : 0;

  return {
    streakDays: Math.max(streakDays, finalReviewedCount > 0 ? 1 : 0),
    lastStudiedDate: lastStudiedDate || today,
    totalCardsLearned: Math.max(
      baseStats.totalCardsLearned,
      learnedCardsCount,
      uniqueLearnedFromHistory
    ),
    todayStats: {
      date: today,
      studySeconds: Math.max(
        baseStats.todayStats.studySeconds,
        reviewedCount > 0 ? reviewedCount * 15 : 0
      ),
      reviewedCount: finalReviewedCount,
      againCount: Math.max(baseStats.todayStats.againCount, todayLogs.filter((log) => log.rating === 1).length),
      correctCount: Math.max(baseStats.todayStats.correctCount, todayLogs.filter((log) => log.rating > 1).length)
    }
  };
}

/**
 * Pulls the current card snapshots and compact profile stats. Newer accounts only
 * read recent review events; legacy accounts without a profile summary are scanned
 * once so their existing streak and lifetime totals can be backfilled.
 */
export async function pullDataFromFirestore(
  userId: string,
  options: {
    existingStats?: UserStudyStats;
    currentCards?: StudyCard[];
    includeStructure?: boolean;
  } = {}
): Promise<{
  cards: Record<string, any>;
  folders?: Folder[];
  decks?: Deck[];
  stats: UserStudyStats;
  reviewLogsProcessed: number;
  statsNeedBackfill: boolean;
  remoteStats?: UserStudyStats;
  structureFingerprint?: string;
  legacyUpdatedCards?: StudyCard[];
}> {
  try {
    const includeStructure = options.includeStructure !== false;
    const [cardsSnapshot, userSnapshot, foldersSnapshot, decksSnapshot] = await Promise.all([
      getDocs(collection(db, 'users', userId, 'cards')),
      getDoc(doc(db, 'users', userId)),
      includeStructure ? getDocs(collection(db, 'users', userId, 'folders')) : Promise.resolve(null),
      includeStructure ? getDocs(collection(db, 'users', userId, 'decks')) : Promise.resolve(null)
    ]);

    const cards: Record<string, any> = {};
    cardsSnapshot.forEach((document) => {
      cards[document.id] = document.data();
    });

    const folders = foldersSnapshot ? foldersSnapshot.docs.map((document) => document.data() as Folder) : [];
    const decks = decksSnapshot ? decksSnapshot.docs.map((document) => document.data() as Deck) : [];
    const profile = userSnapshot.exists() ? userSnapshot.data() : undefined;
    const statsNeedBackfill = !isUserStudyStats(profile?.stats);
    const now = new Date();
    const today = getTodayDateString(now);
    const reviewLogsCollection = collection(db, 'users', userId, 'reviewLogs');
    let logSnapshots: Array<{ forEach: (callback: (document: any) => void) => void }>;

    if (statsNeedBackfill) {
      // One-time migration path for older accounts that only have reviewLogs.
      logSnapshots = [await getDocs(reviewLogsCollection)];
    } else {
      const yesterdayStart = new Date(now);
      yesterdayStart.setHours(0, 0, 0, 0);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const [stringTimestampLogs, dateTimestampLogs] = await Promise.all([
        getDocs(query(reviewLogsCollection, where('reviewedAt', '>=', yesterdayStart.toISOString()))),
        getDocs(query(
          reviewLogsCollection,
          where('reviewedAt', '>=', Timestamp.fromDate(yesterdayStart)),
          where('reviewedAt', '<=', Timestamp.fromDate(now))
        ))
      ]);
      logSnapshots = [stringTimestampLogs, dateTimestampLogs];
    }

    const reviewLogs = parseReviewLogs(logSnapshots);
    const learnedCardsCount = Object.values(cards).filter((card: any) =>
      Boolean(card.learnedAt)
    ).length;
    const baseStats = mergeStudyStats(profile?.stats, options.existingStats, today);
    const stats = buildStudyStats(
      reviewLogs,
      baseStats,
      learnedCardsCount,
      now,
      statsNeedBackfill
    );
    const legacyUpdatedCards = statsNeedBackfill && reviewLogs.length > 0 && options.currentCards
      ? applyReviewLogsToCards(options.currentCards, reviewLogs)
      : undefined;

    return {
      cards,
      folders: folders.length > 0 ? folders : undefined,
      decks: decks.length > 0 ? decks : undefined,
      stats,
      reviewLogsProcessed: reviewLogs.length,
      statsNeedBackfill,
      remoteStats: isUserStudyStats(profile?.stats) ? profile.stats : undefined,
      structureFingerprint: typeof profile?.structureFingerprint === 'string'
        ? profile.structureFingerprint
        : undefined,
      legacyUpdatedCards
    };
  } catch (err) {
    console.warn('Lỗi khi tải dữ liệu từ Firestore:', err);
    throw err;
  }
}

/** Merge the latest cloud FSRS snapshots into the local full card objects. */
export function mergeFirestoreCardProgress(
  cards: StudyCard[],
  cloudCards: Record<string, any>
): StudyCard[] {
  return cards.map((card) => {
    const cloud = cloudCards[card.id];
    if (!cloud) return card;

    const firstLearnedAt =
      (typeof cloud.firstLearnedAt === 'string' && cloud.firstLearnedAt.trim()) ||
      card.firstLearnedAt ||
      undefined;
    const learnedAt = cloud.learnedAt || card.learnedAt;

    const localLastReviewMs = card.fsrsCard.last_review instanceof Date && !isNaN(card.fsrsCard.last_review.getTime())
      ? card.fsrsCard.last_review.getTime()
      : 0;
    const cloudLastReview = parseReviewDate(cloud.last_review);
    const cloudLastReviewMs = cloudLastReview ? cloudLastReview.getTime() : 0;
    const localReps = safeNumber(card.fsrsCard.reps);
    const cloudReps = safeNumber(cloud.reps, localReps);

    // Keep local FSRS progress if it is strictly newer than the cloud snapshot
    const localIsNewer =
      (localLastReviewMs > 0 && localLastReviewMs > cloudLastReviewMs) ||
      (localLastReviewMs === cloudLastReviewMs && localReps > cloudReps);

    if (localIsNewer) {
      return {
        ...card,
        firstLearnedAt,
        learnedAt
      };
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

/**
 * Đồng bộ cấu trúc folders và decks lên Firestore
 */
export async function syncFoldersAndDecks(
  userId: string,
  folders: Folder[],
  decks: Deck[]
): Promise<void> {
  if (!userId || userId === 'local_device') return;
  try {
    const writes = [
      ...folders.map((folder) => ({ collectionName: 'folders', id: folder.id, data: sanitizeFirestoreData(folder) })),
      ...decks.map((deck) => ({ collectionName: 'decks', id: deck.id, data: sanitizeFirestoreData(deck) }))
    ];
    const CHUNK_SIZE = 450;
    for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      for (const write of writes.slice(i, i + CHUNK_SIZE)) {
        batch.set(doc(db, 'users', userId, write.collectionName, write.id), write.data, { merge: true });
      }
      await withTimeout(batch.commit(), 25000, 'Timeout sync folders/decks (25s)');
    }
    await setDoc(doc(db, 'users', userId), {
      structureFingerprint: folderDeckFingerprint(folders, decks)
    }, { merge: true });
    // Chờ SDK thực sự gửi lên server (an toàn không làm crash flow chính)
    try {
      await withTimeout(waitForPendingWrites(db), 15000, 'Timeout chờ ghi folders/decks lên server');
    } catch {}
    console.log('✓ Đã đồng bộ cấu trúc Thư mục và Deck lên Firestore');
  } catch (err) {
    console.warn('Không thể đồng bộ Thư mục & Deck lên Firestore:', err);
    throw err;
  }
}

/**
 * Đồng bộ chỉ số học tập hôm nay (streak, thời gian học) lên Firestore
 */
export async function syncUserStudyStats(
  userId: string,
  stats: UserStudyStats
): Promise<void> {
  if (!userId || userId === 'local_device') return;
  try {
    const userRef = doc(db, 'users', userId);
    const setPromise = setDoc(
      userRef,
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
    await withTimeout(setPromise, 25000, 'Timeout sync study stats (25s)');
    // Chờ SDK thực sự ghi lên server (an toàn không làm crash flow)
    try {
      await withTimeout(waitForPendingWrites(db), 15000, 'Timeout chờ ghi stats lên server');
    } catch {}
  } catch (err) {
    console.warn('Lỗi khi đồng bộ chỉ số học tập lên Firestore:', err);
    throw err;
  }
}

/**
 * Đẩy toàn bộ dữ liệu thẻ học, folders, decks và stats từ máy lên tạo lại trên Cloud (khi Cloud bị xóa/trống)
 */
export async function uploadEntireLocalStateToFirestore(
  userId: string,
  cards: StudyCard[],
  folders: Folder[],
  decks: Deck[],
  stats: UserStudyStats
): Promise<{ cardsSynced: number }> {
  if (!userId || userId === 'local_device') return { cardsSynced: 0 };

  // 1. Chỉ đẩy các thẻ đã học hoặc có lịch sử ôn tập để tối ưu hiệu năng
  const learnedCards = cards.filter(
    (c) => (c.fsrsCard?.reps ?? 0) > 0 || Boolean(c.fsrsCard?.last_review) || !c.isNew
  );

  console.log(`[Upload to Cloud] Đang đẩy ${learnedCards.length} thẻ đã học lên Firestore cho uid ${userId}...`);
  const CHUNK_SIZE = 450;
  let cardsSynced = 0;

  for (let i = 0; i < learnedCards.length; i += CHUNK_SIZE) {
    const chunk = learnedCards.slice(i, i + CHUNK_SIZE);

    // Tăng timeout lên 35s kèm 1 lần retry (tạo WriteBatch mới cho mỗi lần thử)
    let commitSuccess = false;
    let lastError: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const batch = writeBatch(db);
      for (const card of chunk) {
        const fsrs = card.fsrsCard;
        const cardRef = doc(db, 'users', userId, 'cards', card.id);
        const cardData = sanitizeFirestoreData({
          id: card.id,
          refId: card.refId,
          type: card.type,
          deckId: card.deckId,
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
        });
        batch.set(cardRef, cardData, { merge: true });
      }
      try {
        await withTimeout(batch.commit(), 35000, 'Timeout upload cards batch (35s)');
        commitSuccess = true;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[Upload to Cloud] Lần thử ${attempt} thất bại khi ghi chunk [${i} - ${i + chunk.length}]:`, err);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
    if (!commitSuccess) {
      throw lastError || new Error('Timeout upload cards batch');
    }
    cardsSynced += chunk.length;
  }

  // 2. Đẩy folders, decks, stats và flush hàng đợi theo thứ tự tuần tự để tránh nghẽn kết nối WebChannel trên mobile
  await syncFoldersAndDecks(userId, folders, decks);
  await syncUserStudyStats(userId, stats);
  await flushOfflineQueue(userId);

  return { cardsSynced };
}
