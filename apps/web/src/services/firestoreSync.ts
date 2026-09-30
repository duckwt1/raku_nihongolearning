import {
  doc,
  setDoc,
  collection,
  getDocs,
  limit,
  query,
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
  SEED_GRAMMAR,
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
  saveUserDecks
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

/**
 * Lọc bỏ mọi giá trị undefined, NaN, Infinity trước khi đẩy lên Firestore
 * để tránh lỗi 'Unsupported field value: undefined/NaN'
 */
export function sanitizeFirestoreData<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) {
      // NaN, Infinity, -Infinity → thay bằng 0 để Firestore không reject
      result[key] = 0;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // Kiểm tra nếu là FieldValue (serverTimestamp) thì giữ nguyên, không đệ quy
      if (typeof value.isEqual === 'function' || value._methodName) {
        result[key] = value;
      } else {
        result[key] = sanitizeFirestoreData(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result as T;
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
  const CHUNK_SIZE = 40;

  for (let i = 0; i < queue.length; i += CHUNK_SIZE) {
    const chunk = queue.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    const acknowledgedIds: string[] = [];
    for (const item of chunk) {
      const cardId = item.card?.id;
      if (!item.id || !cardId || typeof cardId !== 'string' || !cardId.trim()) throw new Error('Invalid queued review item: ' + (item.id || '(missing id)'));
      const fsrs = item.card.fsrsCard;
      const cardRef = doc(db, 'users', userId, 'cards', cardId);
      batch.set(cardRef, sanitizeFirestoreData({
        id: cardId, refId: item.card.refId || cardId, type: item.card.type || 'word',
        due: safeISOString(fsrs?.due), stability: safeNumber(fsrs?.stability),
        difficulty: safeNumber(fsrs?.difficulty), elapsed_days: safeNumber(fsrs?.elapsed_days),
        scheduled_days: safeNumber(fsrs?.scheduled_days), reps: safeNumber(fsrs?.reps),
        lapses: safeNumber(fsrs?.lapses), state: safeNumber(fsrs?.state),
        last_review: safeISOString(fsrs?.last_review), firstLearnedAt: item.card.firstLearnedAt || null,
        updatedAt: serverTimestamp()
      }), { merge: true });
      // Stable ID makes retries idempotent instead of creating duplicate review logs.
      const logRef = doc(db, 'users', userId, 'reviewLogs', encodeURIComponent(item.id));
      batch.set(logRef, sanitizeFirestoreData({
        cardId, rating: safeNumber(item.rating, 3), state: safeNumber(fsrs?.state),
        reviewedAt: item.reviewedAt || new Date().toISOString()
      }));
      acknowledgedIds.push(item.id);
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
      last_review: safeISOString(card.fsrsCard.last_review), firstLearnedAt: card.firstLearnedAt || null,
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
 * Xuất toàn bộ cơ sở dữ liệu N3 (Kanji, Từ vựng, Ngữ pháp, Câu ví dụ) lên Cloud Firestore
 * Sử dụng writeBatch phân đoạn tối đa 450 bản ghi/lần (giới hạn Firestore: 500)
 */
export async function seedAllN3DataToFirestore(
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<{
  kanjiCount: number;
  wordsCount: number;
  grammarCount: number;
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

  // 3. Xuất 97 mẫu ngữ pháp N3
  onProgress?.('Ngữ pháp N3', 0, SEED_GRAMMAR.length);
  for (let i = 0; i < SEED_GRAMMAR.length; i += BATCH_SIZE) {
    const chunk = SEED_GRAMMAR.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const g of chunk) {
      const ref = doc(db, 'grammar', g.id);
      batch.set(ref, g);
    }
    await batch.commit();
    onProgress?.('Ngữ pháp N3', Math.min(i + BATCH_SIZE, SEED_GRAMMAR.length), SEED_GRAMMAR.length);
  }

  // 4. Xuất 880 câu ví dụ
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
    grammarCount: SEED_GRAMMAR.length,
    sentencesCount: SEED_SENTENCES.length
  };
}

/**
 * Tải danh sách reviewLogs từ Firestore và tái hiện lại trạng thái thẻ qua FSRS kèm chỉ số học tập hôm nay
 */
export async function loadAndApplyFirestoreReviewLogs(
  userId: string,
  currentCards: StudyCard[],
  existingStats?: UserStudyStats
): Promise<{
  updatedCards: StudyCard[];
  logsCount: number;
  stats?: UserStudyStats;
}> {
  try {
    const logsSnapshot = await getDocs(collection(db, 'users', userId, 'reviewLogs'));
    const reviewLogs: CardReviewLog[] = [];

    logsSnapshot.forEach((d) => {
      const data = d.data();
      if (!data.cardId) return;

      let reviewedAt = new Date();
      if (data.reviewedAt) {
        if (typeof data.reviewedAt.toDate === 'function') {
          reviewedAt = data.reviewedAt.toDate();
        } else if (typeof data.reviewedAt === 'string') {
          reviewedAt = new Date(data.reviewedAt);
        } else if (data.reviewedAt.seconds) {
          reviewedAt = new Date(data.reviewedAt.seconds * 1000);
        }
      }

      reviewLogs.push({
        cardId: String(data.cardId),
        rating: Number(data.rating || 3),
        state: data.state,
        reviewedAt
      });
    });

    // Tính toán lại thống kê học tập hôm nay trực tiếp từ nhật ký reviewLogs (Source of Truth)
    const now = new Date();
    const todayStr = getTodayDateString(now);

    const todayLogs = reviewLogs.filter(
      (l) => getTodayDateString(l.reviewedAt) === todayStr
    );

    const uniqueDates = Array.from(
      new Set(reviewLogs.map((l) => getTodayDateString(l.reviewedAt)))
    ).sort();

    let calculatedStreak = 0;
    if (uniqueDates.length > 0) {
      let checkDate = new Date(now);
      if (!uniqueDates.includes(todayStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
      }
      while (true) {
        const dStr = getTodayDateString(checkDate);
        if (uniqueDates.includes(dStr)) {
          calculatedStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    const todayReviewedCount = todayLogs.length;
    const todayAgainCount = todayLogs.filter((l) => l.rating === 1).length;
    const todayCorrectCount = todayLogs.filter((l) => l.rating > 1).length;

    let studySeconds = 0;
    if (existingStats?.todayStats?.date === todayStr && existingStats.todayStats.studySeconds > 0) {
      studySeconds = existingStats.todayStats.studySeconds;
    } else if (todayReviewedCount > 0) {
      studySeconds = todayReviewedCount * 15; // Ước tính 15s mỗi lượt lật thẻ
    }

    const finalReviewedCount = Math.max(
      todayReviewedCount,
      existingStats?.todayStats?.date === todayStr ? existingStats.todayStats.reviewedCount : 0
    );

    const uniqueLearnedCards = new Set(
      reviewLogs.filter((l) => l.rating > 1).map((l) => l.cardId)
    ).size;

    const reconstructedStats: UserStudyStats = {
      streakDays: Math.max(calculatedStreak, finalReviewedCount > 0 ? 1 : 0),
      lastStudiedDate: uniqueDates[uniqueDates.length - 1] || todayStr,
      totalCardsLearned: Math.max(existingStats?.totalCardsLearned || 0, uniqueLearnedCards),
      todayStats: {
        date: todayStr,
        studySeconds,
        reviewedCount: finalReviewedCount,
        againCount: Math.max(existingStats?.todayStats?.againCount || 0, todayAgainCount),
        correctCount: Math.max(existingStats?.todayStats?.correctCount || 0, todayCorrectCount)
      }
    };

    if (reviewLogs.length === 0) {
      return {
        updatedCards: currentCards,
        logsCount: 0,
        stats: reconstructedStats
      };
    }

    const updatedCards = applyReviewLogsToCards(currentCards, reviewLogs);
    console.log(
      `✓ Đã áp dụng thành công ${reviewLogs.length} reviewLogs từ Firestore vào thuật toán FSRS. Thống kê hôm nay: ${finalReviewedCount} thẻ ôn.`
    );
    return { updatedCards, logsCount: reviewLogs.length, stats: reconstructedStats };
  } catch (err) {
    console.warn('Lỗi khi nạp reviewLogs từ Firestore:', err);
    throw err;
  }
}

/**
 * Tải toàn bộ tiến độ thẻ, nhật ký reviewLogs và cấu trúc Deck từ Firestore về máy
 */
export async function pullDataFromFirestore(userId: string): Promise<{
  cards: Record<string, any>;
  folders?: Folder[];
  decks?: Deck[];
}> {
  const cardsMap: Record<string, any> = {};

  try {
    // 1. Tải danh sách thẻ ôn tập
    const cardsSnapshot = await getDocs(collection(db, 'users', userId, 'cards'));
    cardsSnapshot.forEach((d) => {
      cardsMap[d.id] = d.data();
    });

    // 2. Tải folders nếu có
    const foldersSnapshot = await getDocs(collection(db, 'users', userId, 'folders'));
    const folders: Folder[] = [];
    foldersSnapshot.forEach((d) => {
      folders.push(d.data() as Folder);
    });

    // 3. Tải decks nếu có
    const decksSnapshot = await getDocs(collection(db, 'users', userId, 'decks'));
    const decks: Deck[] = [];
    decksSnapshot.forEach((d) => {
      decks.push(d.data() as Deck);
    });

    return {
      cards: cardsMap,
      folders: folders.length > 0 ? folders : undefined,
      decks: decks.length > 0 ? decks : undefined
    };
  } catch (err) {
    console.warn('Lỗi khi tải dữ liệu từ Firestore:', err);
    throw err;
  }
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
    const batch = writeBatch(db);
    for (const f of folders) {
      const ref = doc(db, 'users', userId, 'folders', f.id);
      batch.set(ref, sanitizeFirestoreData(f), { merge: true });
    }
    for (const d of decks) {
      const ref = doc(db, 'users', userId, 'decks', d.id);
      batch.set(ref, sanitizeFirestoreData(d), { merge: true });
    }
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout sync folders/decks (25s)')), 25000)
    );
    await Promise.race([batch.commit(), timeoutPromise]);
    // Chờ SDK thực sự gửi lên server (an toàn không làm crash flow chính)
    try {
      await Promise.race([
        waitForPendingWrites(db),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout chờ ghi folders/decks lên server')), 15000)
        )
      ]);
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
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout sync study stats (25s)')), 25000)
    );
    await Promise.race([setPromise, timeoutPromise]);
    // Chờ SDK thực sự ghi lên server (an toàn không làm crash flow)
    try {
      await Promise.race([
        waitForPendingWrites(db),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout chờ ghi stats lên server')), 15000)
        )
      ]);
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
  const CHUNK_SIZE = 40;
  let cardsSynced = 0;

  for (let i = 0; i < learnedCards.length; i += CHUNK_SIZE) {
    const chunk = learnedCards.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const card of chunk) {
      const fsrs = card.fsrsCard;
      const cardRef = doc(db, 'users', userId, 'cards', card.id);
      const cardData = sanitizeFirestoreData({
        id: card.id,
        refId: card.refId,
        type: card.type,
        deckId: card.deckId,
        due: fsrs?.due ? new Date(fsrs.due).toISOString() : null,
        stability: fsrs?.stability ?? 0,
        difficulty: fsrs?.difficulty ?? 0,
        elapsed_days: fsrs?.elapsed_days ?? 0,
        scheduled_days: fsrs?.scheduled_days ?? 0,
        reps: fsrs?.reps ?? 0,
        lapses: fsrs?.lapses ?? 0,
        state: fsrs?.state ?? 0,
        last_review: fsrs?.last_review ? new Date(fsrs.last_review).toISOString() : null,
        firstLearnedAt: card.firstLearnedAt || null,
        updatedAt: serverTimestamp()
      });
      batch.set(cardRef, cardData, { merge: true });
    }

    // Tăng timeout lên 35s kèm 1 lần retry nếu gặp sự cố mạng chập chờn
    let commitSuccess = false;
    let lastError: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const commitTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout upload cards batch (35s)')), 35000)
        );
        await Promise.race([batch.commit(), commitTimeout]);
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
