import type { Deck } from '../models/schemas.js';

/**
 * Kiểm tra deck có thuộc sở hữu của người dùng hiện tại hay không.
 * - Deck nội dung có sẵn (builtin) không thuộc quyền xoá của người dùng.
 * - Deck tải từ cộng đồng thuộc về tác giả ghi trong authorUid.
 * - Deck tạo trên máy (kể cả dữ liệu cũ chưa có authorUid) thuộc người dùng hiện tại.
 */
export function isDeckOwner(
  deck: Pick<Deck, 'origin' | 'authorUid'>,
  currentUid?: string | null
): boolean {
  if (deck.authorUid && deck.authorUid !== 'anonymous') {
    return Boolean(currentUid) && deck.authorUid === currentUid;
  }
  return deck.origin !== 'community';
}

/** Chỉ chủ sở hữu mới được xoá deck; deck builtin không xoá được. */
export function canDeleteDeck(
  deck: Pick<Deck, 'origin' | 'authorUid' | 'isDefault'>,
  currentUid?: string | null
): boolean {
  if (deck.isDefault || deck.origin === 'builtin') return false;
  return isDeckOwner(deck, currentUid);
}
