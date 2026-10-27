import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  createNewCard,
  type Deck,
  type Folder,
  type StudyCard
} from '@raku/core';
import { db } from './firebase';
import { sanitizeFirestoreData } from './firestoreSync';

export interface CommunityDeckPayload {
  id: string;
  deck: Deck;
  folder?: Folder;
  cards: Array<{
    id: string;
    type: 'word' | 'kanji' | 'grammar' | 'custom' | 'mixed';
    refId: string;
    word?: {
      id: string;
      surface: string;
      readings: string[];
      meaningVi: string;
      pos?: string;
      hanVietBreakdown?: string[];
      kanji?: string[];
      exampleJp?: string;
      exampleVi?: string;
      exampleIds?: string[];
      tags?: string[];
    };
  }>;
  authorName?: string;
  authorUid?: string;
  updatedAt?: string;
}

/**
 * Tải toàn bộ danh sách các bộ thẻ cộng đồng từ Firestore
 */
export async function fetchCommunityDecks(): Promise<CommunityDeckPayload[]> {
  try {
    const snap = await getDocs(collection(db, 'communityDecks'));
    const list: CommunityDeckPayload[] = [];
    snap.forEach((d) => {
      const data = d.data() as CommunityDeckPayload;
      if (data && data.deck && data.cards) {
        list.push(data);
      }
    });
    return list;
  } catch (err) {
    console.warn('Không thể tải bộ thẻ cộng đồng từ Firestore (có thể đang offline):', err);
    return [];
  }
}

/**
 * Chia sẻ / Đăng tải một bộ thẻ lên Cloud Firestore làm Community Deck
 */
export async function publishDeckToCommunity(
  deck: Deck,
  folder: Folder | undefined,
  cardsInDeck: StudyCard[],
  user: User | null
): Promise<{ success: boolean; cardsCount: number }> {
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
      authorName: user?.displayName || user?.email?.split('@')[0] || 'Thành viên',
      authorUid: user?.uid || 'anonymous',
      updatedAt: new Date().toISOString()
    };

    const payload: CommunityDeckPayload = {
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

    if (folder) {
      await setDoc(doc(db, 'communityFolders', folder.id), sanitizeFirestoreData(folder), { merge: true });
    }

    return { success: true, cardsCount: cleanCards.length };
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

/**
 * Tự động gộp các bộ thẻ cộng đồng vào bộ thẻ trên máy của người dùng.
 * Đảm bảo:
 * 1. Không ghi đè tiến độ học FSRS cá nhân của người dùng.
 * 2. Cập nhật nội dung từ vựng / ví dụ mới nhất từ tác giả.
 * 3. Tự động thêm các thẻ mới trong bộ nếu tác giả vừa bổ sung.
 */
export function mergeCommunityDecksIntoLocalState(
  localDecks: Deck[],
  localFolders: Folder[],
  localCards: StudyCard[],
  communityPayloads: CommunityDeckPayload[]
): {
  updatedDecks: Deck[];
  updatedFolders: Folder[];
  updatedCards: StudyCard[];
  newDecksCount: number;
  newCardsCount: number;
} {
  const deckMap = new Map<string, Deck>(localDecks.map((d) => [d.id, d]));
  const folderMap = new Map<string, Folder>(localFolders.map((f) => [f.id, f]));
  const cardMap = new Map<string, StudyCard>(localCards.map((c) => [c.id, c]));

  let newDecksCount = 0;
  let newCardsCount = 0;

  for (const item of communityPayloads) {
    const { deck, folder, cards } = item;

    // 1. Thêm hoặc cập nhật Folder nếu có
    if (folder && !folderMap.has(folder.id)) {
      folderMap.set(folder.id, folder);
    }

    // 2. Thêm hoặc cập nhật Deck
    if (!deckMap.has(deck.id)) {
      deckMap.set(deck.id, {
        ...deck,
        visibility: 'community'
      });
      newDecksCount++;
    } else {
      // Cập nhật thông tin mô tả, tên bộ thẻ mới nhất nếu tác giả có sửa
      const existing = deckMap.get(deck.id)!;
      deckMap.set(deck.id, {
        ...existing,
        name: deck.name,
        description: deck.description || existing.description,
        visibility: 'community',
        authorName: deck.authorName || existing.authorName
      });
    }

    // 3. Gộp các Cards
    for (const remoteCard of cards) {
      if (!remoteCard.word) continue;

      const existingCard = cardMap.get(remoteCard.id);
      if (!existingCard) {
        // Thẻ mới chưa có trên máy -> tạo mới với FSRS card ban đầu
        const newLocalCard: StudyCard = {
          id: remoteCard.id,
          type: (remoteCard.type as any) || 'word',
          refId: remoteCard.refId || remoteCard.id,
          deckId: deck.id,
          word: {
            id: remoteCard.word.id,
            surface: remoteCard.word.surface,
            readings: remoteCard.word.readings || [remoteCard.word.surface],
            meaningVi: remoteCard.word.meaningVi,
            pos: remoteCard.word.pos || '名詞',
            hanVietBreakdown: remoteCard.word.hanVietBreakdown || [],
            kanji: remoteCard.word.kanji || [],
            exampleJp: remoteCard.word.exampleJp,
            exampleVi: remoteCard.word.exampleVi,
            exampleIds: remoteCard.word.exampleIds || [],
            tags: remoteCard.word.tags || ['community']
          },
          fsrsCard: createNewCard(),
          isNew: true,
          isDue: false
        };
        cardMap.set(remoteCard.id, newLocalCard);
        newCardsCount++;
      } else {
        // Thẻ đã có -> cập nhật nội dung từ vựng nhưng giữ nguyên tiến độ FSRS của cá nhân
        existingCard.word = {
          ...existingCard.word!,
          surface: remoteCard.word.surface,
          readings: remoteCard.word.readings || existingCard.word!.readings,
          meaningVi: remoteCard.word.meaningVi,
          pos: remoteCard.word.pos || existingCard.word!.pos,
          hanVietBreakdown: remoteCard.word.hanVietBreakdown || existingCard.word!.hanVietBreakdown,
          kanji: remoteCard.word.kanji || existingCard.word!.kanji,
          exampleJp: remoteCard.word.exampleJp || existingCard.word!.exampleJp,
          exampleVi: remoteCard.word.exampleVi || existingCard.word!.exampleVi
        };
      }
    }
  }

  return {
    updatedDecks: Array.from(deckMap.values()),
    updatedFolders: Array.from(folderMap.values()),
    updatedCards: Array.from(cardMap.values()),
    newDecksCount,
    newCardsCount
  };
}
