import {
  doc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  writeBatch,
  serverTimestamp
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

export interface OfflineReviewItem {
  id: string;
  userId: string;
  card: StudyCard;
  rating: number;
  reviewedAt: string;
}

const OFFLINE_QUEUE_KEY = 'raku_offline_reviews_queue';

/**
 * Lấy danh sách các lượt ôn tập đang chờ đồng bộ từ LocalStorage
 */
export function getOfflineReviewQueue(): OfflineReviewItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Lấy số lượng bản ghi đang chờ đồng bộ lên Firestore
 */
export function getPendingSyncCount(): number {
  return getOfflineReviewQueue().length;
}

/**
 * Đưa 1 lượt ôn tập vào hàng đợi ngoại tuyến
 */
export function enqueueOfflineReview(item: OfflineReviewItem): void {
  try {
    const queue = getOfflineReviewQueue();
    queue.push(item);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Không thể lưu hàng đợi offline:', err);
  }
}

/**
 * Xóa sạch hàng đợi ngoại tuyến khi đã đẩy thành công
 */
export function clearOfflineReviewQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {}
}

/**
 * Đẩy toàn bộ hàng đợi ngoại tuyến lên Firestore (khi có mạng trở lại)
 */
export async function flushOfflineQueue(userId: string): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 0;
  }
  const queue = getOfflineReviewQueue();
  if (queue.length === 0) return 0;

  console.log(`[Offline Sync] Đang đẩy ${queue.length} lượt ôn tập ngoại tuyến lên Firestore...`);

  let syncedCount = 0;
  const remainingQueue: OfflineReviewItem[] = [];

  for (const item of queue) {
    try {
      const targetUid = item.userId || userId;
      // 1. Cập nhật thẻ
      const cardRef = doc(db, 'users', targetUid, 'cards', item.card.id);
      await setDoc(
        cardRef,
        {
          id: item.card.id,
          refId: item.card.refId,
          type: item.card.type,
          due: item.card.fsrsCard.due ? new Date(item.card.fsrsCard.due).toISOString() : null,
          stability: item.card.fsrsCard.stability,
          difficulty: item.card.fsrsCard.difficulty,
          elapsed_days: item.card.fsrsCard.elapsed_days,
          scheduled_days: item.card.fsrsCard.scheduled_days,
          reps: item.card.fsrsCard.reps,
          lapses: item.card.fsrsCard.lapses,
          state: item.card.fsrsCard.state,
          last_review: item.card.fsrsCard.last_review
            ? new Date(item.card.fsrsCard.last_review).toISOString()
            : null,
          firstLearnedAt: item.card.firstLearnedAt || null,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      // 2. Ghi nhật ký ôn tập
      const logsCol = collection(db, 'users', targetUid, 'reviewLogs');
      await addDoc(logsCol, {
        cardId: item.card.id,
        rating: item.rating,
        state: item.card.fsrsCard.state,
        reviewedAt: item.reviewedAt || new Date().toISOString()
      });

      syncedCount++;
    } catch (err) {
      console.warn('Lỗi khi đẩy 1 mục trong hàng đợi offline:', err);
      remainingQueue.push(item);
    }
  }

  if (remainingQueue.length === 0) {
    clearOfflineReviewQueue();
  } else {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    } catch {}
  }

  console.log(`✓ [Offline Sync] Đã đồng bộ xong ${syncedCount} lượt ôn tập lên Firestore.`);
  return syncedCount;
}

/**
 * Lưu tiến độ thẻ ôn tập FSRS và ghi nhật ký ôn tập vào Firestore.
 * Nếu đang ngoại tuyến hoặc kết nối mạng lỗi, tự động lưu vào hàng đợi offline.
 */
export async function saveCardProgress(
  userId: string,
  card: StudyCard,
  rating: number
): Promise<{ success: boolean; queued: boolean }> {
  // Nếu máy đang Offline, đưa ngay vào hàng đợi cục bộ
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineReview({
      id: `${card.id}_${Date.now()}`,
      userId,
      card,
      rating,
      reviewedAt: new Date().toISOString()
    });
    return { success: true, queued: true };
  }

  try {
    // 1. Cập nhật trạng thái thẻ FSRS tại /users/{uid}/cards/{cardId}
    const cardRef = doc(db, 'users', userId, 'cards', card.id);
    await setDoc(
      cardRef,
      {
        id: card.id,
        refId: card.refId,
        type: card.type,
        due: card.fsrsCard.due ? new Date(card.fsrsCard.due).toISOString() : null,
        stability: card.fsrsCard.stability,
        difficulty: card.fsrsCard.difficulty,
        elapsed_days: card.fsrsCard.elapsed_days,
        scheduled_days: card.fsrsCard.scheduled_days,
        reps: card.fsrsCard.reps,
        lapses: card.fsrsCard.lapses,
        state: card.fsrsCard.state,
        last_review: card.fsrsCard.last_review
          ? new Date(card.fsrsCard.last_review).toISOString()
          : null,
        firstLearnedAt: card.firstLearnedAt || null,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    // 2. Ghi thêm vào nhật ký /users/{uid}/reviewLogs/{logId} (Luật Firestore: append-only)
    const logsCol = collection(db, 'users', userId, 'reviewLogs');
    await addDoc(logsCol, {
      cardId: card.id,
      rating,
      state: card.fsrsCard.state,
      reviewedAt: serverTimestamp()
    });

    return { success: true, queued: false };
  } catch (err) {
    console.warn('Lưu tiến độ FSRS lên Firestore thất bại, tự động lưu vào hàng đợi offline:', err);
    enqueueOfflineReview({
      id: `${card.id}_${Date.now()}`,
      userId,
      card,
      rating,
      reviewedAt: new Date().toISOString()
    });
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
    return { updatedCards: currentCards, logsCount: 0 };
  }
}

/**
 * Tải toàn bộ tiến độ thẻ, nhật ký reviewLogs và cấu trúc Deck từ Firestore về máy
 */
export async function pullDataFromFirestore(userId: string): Promise<{
  cards: Record<string, any>;
  folders?: Folder[];
  decks?: Deck[];
  reviewLogsCount: number;
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

    // 4. Đếm số lượng reviewLogs
    const logsSnapshot = await getDocs(collection(db, 'users', userId, 'reviewLogs'));

    return {
      cards: cardsMap,
      folders: folders.length > 0 ? folders : undefined,
      decks: decks.length > 0 ? decks : undefined,
      reviewLogsCount: logsSnapshot.size
    };
  } catch (err) {
    console.warn('Lỗi khi tải dữ liệu từ Firestore:', err);
    return { cards: {}, reviewLogsCount: 0 };
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
  try {
    const batch = writeBatch(db);
    for (const f of folders) {
      const ref = doc(db, 'users', userId, 'folders', f.id);
      batch.set(ref, f, { merge: true });
    }
    for (const d of decks) {
      const ref = doc(db, 'users', userId, 'decks', d.id);
      batch.set(ref, d, { merge: true });
    }
    await batch.commit();
    console.log('✓ Đã đồng bộ cấu trúc Thư mục và Deck lên Firestore');
  } catch (err) {
    console.warn('Không thể đồng bộ Thư mục & Deck lên Firestore:', err);
  }
}

/**
 * Đồng bộ chỉ số học tập hôm nay (streak, thời gian học) lên Firestore
 */
export async function syncUserStudyStats(
  userId: string,
  stats: UserStudyStats
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(
      userRef,
      {
        stats: {
          streakDays: stats.streakDays,
          lastStudiedDate: stats.lastStudiedDate,
          totalCardsLearned: stats.totalCardsLearned,
          todayStats: stats.todayStats
        }
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Lỗi khi đồng bộ chỉ số học tập lên Firestore:', err);
  }
}
