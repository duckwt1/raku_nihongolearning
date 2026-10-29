import type { Deck, Folder } from '../models/schemas.js';

/**
 * Thư mục mặc định mới chứa các bộ thẻ do người dùng tự tạo.
 * Thư mục cũ "Kho Cá Nhân & AI" (folder_custom) được thay bằng thư mục này.
 */
export const USER_DECKS_FOLDER_ID = 'folder_my_decks';
export const LEGACY_CUSTOM_FOLDER_ID = 'folder_custom';

const BUILTIN_DECK_IDS = new Set(['deck_n3_words']);
const BUILTIN_FOLDER_IDS = new Set(['folder_jlpt_n3']);

/**
 * Chuẩn hoá dữ liệu deck đã lưu trên máy:
 * - Thêm `origin` / `visibility` cho dữ liệu cũ (trước đây visibility có thể bị thiếu).
 * - Đánh dấu deck N3 là nội dung có sẵn (builtin) và không tự chia sẻ.
 * - Chuyển deck khỏi thư mục "Kho Cá Nhân & AI" sang "Bộ thẻ của tôi".
 * - Deck được tải từ cộng đồng (authorUid khác user hiện tại) được đánh dấu `community`.
 */
export function migrateDecks(decks: Deck[], currentUid?: string | null): Deck[] {
  return decks.map((deck) => {
    const next: Deck = { ...deck };

    if (next.folderId === LEGACY_CUSTOM_FOLDER_ID) {
      next.folderId = USER_DECKS_FOLDER_ID;
    }

    if (!next.origin) {
      if (BUILTIN_DECK_IDS.has(next.id)) {
        next.origin = 'builtin';
      } else if (
        next.authorUid &&
        next.authorUid !== 'anonymous' &&
        next.authorUid !== currentUid
      ) {
        next.origin = 'community';
      } else {
        next.origin = 'owned';
      }
    }

    if (next.origin === 'builtin') {
      // Nội dung có sẵn luôn ở chế độ riêng tư, không đẩy lên communityDecks.
      next.isDefault = true;
      next.visibility = 'private';
    } else if (next.origin === 'community') {
      next.visibility = 'community';
      if (!next.communityDocId) next.communityDocId = next.id;
    }

    if (!next.visibility) {
      next.visibility = 'private';
    }

    if (next.id === 'deck_custom_import') {
      // Deck import cũ của hệ thống trở thành deck do người dùng sở hữu.
      next.isDefault = false;
      if (next.origin === 'builtin') next.origin = 'owned';
    }

    return next;
  });
}

/**
 * Chuẩn hoá folder đã lưu trên máy:
 * - Bỏ thư mục "Kho Cá Nhân & AI" (folder_custom).
 * - Tạo "Bộ thẻ của tôi" nếu người dùng từng có deck trong folder_custom.
 * - Đánh dấu JLPT N3 là folder có sẵn (không xoá được).
 */
export function migrateFolders(folders: Folder[]): Folder[] {
  const result: Folder[] = [];
  let needsUserDecksFolder = false;

  for (const folder of folders) {
    if (folder.id === LEGACY_CUSTOM_FOLDER_ID) {
      needsUserDecksFolder = true;
      continue;
    }

    const next: Folder = { ...folder };
    if (BUILTIN_FOLDER_IDS.has(next.id)) {
      next.isDefault = true;
    }
    result.push(next);
  }

  if (
    needsUserDecksFolder &&
    !result.some((folder) => folder.id === USER_DECKS_FOLDER_ID)
  ) {
    result.push({
      id: USER_DECKS_FOLDER_ID,
      name: 'Bộ thẻ của tôi',
      description: 'Các bộ thẻ do bạn tự tạo và nhập vào',
      color: '#8b5cf6',
      parentId: null,
      isDefault: false,
      createdAt: new Date().toISOString()
    });
  }

  return result;
}
