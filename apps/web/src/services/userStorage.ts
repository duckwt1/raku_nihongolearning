import type { StudyCard, Folder, Deck, UserStudyStats } from '@raku/core';
import {
  DEFAULT_FOLDERS,
  DEFAULT_DECKS,
  buildDefaultCards,
  createInitialStudyStats,
  recordStudyActivity
} from '@raku/core';

export interface OfflineReviewItem {
  id: string;
  userId: string;
  card: StudyCard;
  rating: number;
  reviewedAt: string;
}

/**
 * Sinh key lưu trữ cục bộ phân tách theo User ID (Namespaced Storage như Profile trong Anki)
 */
export function getUserStorageKey(baseKey: string, userId?: string | null): string {
  const ns = userId && userId !== 'local_device' ? `user_${userId}` : 'guest';
  return `raku_${baseKey}_${ns}`;
}

/**
 * Chuyển giao dữ liệu từ khóa cũ (legacy global keys) sang khóa namespaced
 * để đảm bảo người dùng cũ không bị mất dữ liệu đã học
 */
export function migrateLegacyDataIfPresent(userId?: string | null): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;

  const mapping: Array<[string, string]> = [
    ['raku_cards', 'cards'],
    ['raku_study_stats', 'study_stats'],
    ['raku_folders', 'folders'],
    ['raku_decks', 'decks'],
    ['raku_offline_reviews_queue', 'offline_queue']
  ];

  for (const [legacyKey, baseKey] of mapping) {
    const legacyVal = localStorage.getItem(legacyKey);
    const newKey = getUserStorageKey(baseKey, userId);

    if (legacyVal && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, legacyVal);
      // Xóa khóa cũ sau khi đã di chuyển thành công
      localStorage.removeItem(legacyKey);
    }
  }
}

/**
 * Tải danh sách thẻ học của user từ LocalStorage
 */
export function loadUserCards(userId?: string | null): StudyCard[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return buildDefaultCards();
  }
  migrateLegacyDataIfPresent(userId);

  const key = getUserStorageKey('cards', userId);
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed: StudyCard[] = JSON.parse(saved);
      return parsed
        .filter((c) => c.type !== 'kanji' && c.deckId !== 'deck_n3_kanji')
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
  } catch (err) {
    console.warn(`Lỗi khi nạp thẻ của user [${userId}]:`, err);
  }
  return buildDefaultCards();
}

/**
 * Lưu danh sách thẻ học của user vào LocalStorage
 */
export function saveUserCards(userId: string | null | undefined, cards: StudyCard[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const key = getUserStorageKey('cards', userId);
    localStorage.setItem(key, JSON.stringify(cards));
  } catch (err) {
    console.error(`Không thể lưu thẻ cho user [${userId}]:`, err);
  }
}

/**
 * Tải chỉ số học tập của user từ LocalStorage
 */
export function loadUserStudyStats(userId?: string | null): UserStudyStats {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return createInitialStudyStats();
  }
  migrateLegacyDataIfPresent(userId);

  const key = getUserStorageKey('study_stats', userId);
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return recordStudyActivity(JSON.parse(saved), 0);
    }
  } catch (err) {
    console.warn(`Lỗi khi nạp stats của user [${userId}]:`, err);
  }
  return createInitialStudyStats();
}

/**
 * Lưu chỉ số học tập của user vào LocalStorage
 */
export function saveUserStudyStats(userId: string | null | undefined, stats: UserStudyStats): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const key = getUserStorageKey('study_stats', userId);
    localStorage.setItem(key, JSON.stringify(stats));
  } catch (err) {
    console.error(`Không thể lưu stats cho user [${userId}]:`, err);
  }
}

/**
 * Tải thư mục của user từ LocalStorage
 */
export function loadUserFolders(userId?: string | null): Folder[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return DEFAULT_FOLDERS;
  }
  migrateLegacyDataIfPresent(userId);

  const key = getUserStorageKey('folders', userId);
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : DEFAULT_FOLDERS;
  } catch {
    return DEFAULT_FOLDERS;
  }
}

/**
 * Lưu thư mục của user vào LocalStorage
 */
export function saveUserFolders(userId: string | null | undefined, folders: Folder[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const key = getUserStorageKey('folders', userId);
    localStorage.setItem(key, JSON.stringify(folders));
  } catch {}
}

/**
 * Tải bộ thẻ decks của user từ LocalStorage
 */
export function loadUserDecks(userId?: string | null): Deck[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return DEFAULT_DECKS;
  }
  migrateLegacyDataIfPresent(userId);

  const key = getUserStorageKey('decks', userId);
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed: Deck[] = JSON.parse(saved);
      return parsed.filter((d) => d.id !== 'deck_n3_kanji');
    }
  } catch {}
  return DEFAULT_DECKS;
}

/**
 * Lưu bộ thẻ decks của user vào LocalStorage
 */
export function saveUserDecks(userId: string | null | undefined, decks: Deck[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const key = getUserStorageKey('decks', userId);
    localStorage.setItem(key, JSON.stringify(decks));
  } catch {}
}

/**
 * Lấy danh sách hàng đợi ôn tập chờ sync của user
 */
export function getOfflineReviewQueue(userId?: string | null): OfflineReviewItem[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  const key = getUserStorageKey('offline_queue', userId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    // Legacy fallback
    const legacy = localStorage.getItem('raku_offline_reviews_queue');
    if (legacy) {
      const parsed = JSON.parse(legacy);
      localStorage.setItem(key, legacy);
      localStorage.removeItem('raku_offline_reviews_queue');
      return parsed;
    }
  } catch {}
  return [];
}

/**
 * Đưa 1 lượt ôn tập vào hàng đợi của user
 */
export function enqueueOfflineReview(item: OfflineReviewItem, userId?: string | null): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const targetUid = userId || item.userId;
  const key = getUserStorageKey('offline_queue', targetUid);
  try {
    const queue = getOfflineReviewQueue(targetUid);
    queue.push(item);
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (err) {
    console.error('Không thể lưu hàng đợi offline:', err);
  }
}

/**
 * Lấy số lượng bản ghi chờ sync của user
 */
export function getPendingSyncCount(userId?: string | null): number {
  return getOfflineReviewQueue(userId).length;
}

/**
 * Xóa sạch hàng đợi ôn tập của user
 */
export function clearOfflineReviewQueue(userId?: string | null): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const key = getUserStorageKey('offline_queue', userId);
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** Remove only review events acknowledged by the server; preserve events added while syncing. */
export function removeOfflineReviewItems(userId: string, itemIds: string[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined' || itemIds.length === 0) return;
  const key = getUserStorageKey('offline_queue', userId);
  const acknowledged = new Set(itemIds);
  try {
    const latest = getOfflineReviewQueue(userId);
    const remaining = latest.filter((item) => !acknowledged.has(item.id));
    if (remaining.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(remaining));
  } catch (err) {
    console.warn('Không thể cập nhật hàng đợi sync:', err);
  }
}

/**
 * Xóa toàn bộ dữ liệu của một user khỏi trình duyệt (khi đăng xuất chọn dọn dẹp)
 */
export function clearUserDataFromBrowser(userId?: string | null): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const bases = ['cards', 'study_stats', 'folders', 'decks', 'offline_queue'];
  for (const b of bases) {
    localStorage.removeItem(getUserStorageKey(b, userId));
  }
}
