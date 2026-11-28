import {
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  type Deck,
  type Folder,
  type StudyCard
} from '@raku/core';
import {
  fetchCommunityDecksFromDb,
  mergeCommunityDecksIntoLocalState,
  type CommunityDeckPayload,
  type CommunityMergeOptions
} from '@raku/sync';
import { db } from './firebase';
import { sanitizeFirestoreData } from './firestoreSync';

export type { CommunityDeckPayload, CommunityMergeOptions };
export { mergeCommunityDecksIntoLocalState };

/**
 * Tải toàn bộ danh sách các bộ thẻ cộng đồng từ Firestore
 */
export async function fetchCommunityDecks(): Promise<CommunityDeckPayload[]> {
  return fetchCommunityDecksFromDb(db);
}

/**
 * Chia sẻ một bộ thẻ lên Cloud Firestore làm Community Deck.
 * Chỉ chủ sở hữu deck mới được chia sẻ; document id giữ nguyên là deck.id
 * để tương thích với dữ liệu đã publish trước đây.
 */
export async function publishDeckToCommunity(
  deck: Deck,
  folder: Folder | undefined,
  cardsInDeck: StudyCard[],
  user: User | null
): Promise<{ success: boolean; cardsCount: number; docId: string }> {
  if (!user) {
    throw new Error('Bạn cần đăng nhập trước khi chia sẻ bộ thẻ lên cộng đồng.');
  }
  if (deck.origin === 'community') {
    throw new Error('Không thể chia sẻ lại một bộ thẻ tải từ cộng đồng.');
  }

  try {
    const cleanCards = cardsInDeck.map((c) => ({
      id: c.id,
      type: c.type || 'word',
      refId: c.refId || c.id,
      word: c.word
        ? {
            id: c.word.id,
            surface: c.word.surface,
            readings: c.word.readings || [c.word.surface],
            meaningVi: c.word.meaningVi,
            pos: c.word.pos,
            hanVietBreakdown: c.word.hanVietBreakdown || [],
            kanji: c.word.kanji || [],
            exampleJp: c.word.exampleJp,
            exampleVi: c.word.exampleVi,
            exampleIds: c.word.exampleIds || [],
            tags: c.word.tags || []
          }
        : undefined
    }));

    const communityDeckObj: Deck = {
      ...deck,
      visibility: 'community',
      authorName: user.displayName || user.email?.split('@')[0] || 'Thành viên',
      authorUid: user.uid,
      communityDocId: deck.id,
      updatedAt: new Date().toISOString()
    };

    const payload: CommunityDeckPayload = {
      docId: deck.id,
      id: deck.id,
      deck: communityDeckObj,
      folder: folder ? { ...folder } : undefined,
      cards: cleanCards,
      authorName: communityDeckObj.authorName,
      authorUid: communityDeckObj.authorUid,
      updatedAt: communityDeckObj.updatedAt
    };

    await setDoc(doc(db, 'communityDecks', deck.id), sanitizeFirestoreData({
      ...payload,
      syncedAt: serverTimestamp()
    }), { merge: true });

    return { success: true, cardsCount: cleanCards.length, docId: deck.id };
  } catch (err) {
    console.error('Lỗi khi chia sẻ bộ thẻ lên cộng đồng:', err);
    throw err;
  }
}

/**
 * Gỡ bộ thẻ khỏi danh sách cộng đồng (chuyển về chỉ dùng private)
 */
export async function unpublishDeckFromCommunity(deckId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'communityDecks', deckId));
    return true;
  } catch (err) {
    console.error('Lỗi khi gỡ bộ thẻ cộng đồng:', err);
    throw err;
  }
}
