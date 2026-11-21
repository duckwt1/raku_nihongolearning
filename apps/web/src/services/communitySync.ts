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
  /** Id document Firestore (mặc định trùng deck.id với dữ liệu cũ) */
  docId?: string;
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
        list.push({ ...data, docId: d.id });
      }
    });
    return list;
  } catch (err) {
    console.warn('Không thể tải bộ thẻ cộng đồng từ Firestore (có thể đang offline):', err);
    return [];
  }
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

export interface CommunityMergeOptions {
  /** Id deck người dùng đã xoá / bỏ khỏi thư viện - không merge lại */
  hiddenDeckIds?: ReadonlySet<string>;
  /** Id folder người dùng đã xoá - không tạo lại */
  hiddenFolderIds?: ReadonlySet<string>;
  /** Uid hiện tại, dùng để nhận biết deck do chính người dùng publish */
  currentUid?: string | null;
}

/**
 * Tự động gộp các bộ thẻ cộng đồng vào bộ thẻ trên máy của người dùng.
 * Đảm bảo:
 * 1. Không ghi đè tiến độ học FSRS cá nhân của người dùng.
 * 2. Không ghi đè deck do người dùng sở hữu (origin: 'owned' / 'builtin').
 * 3. Không thêm lại deck/folder người dùng vừa xoá.
 * 4. Cập nhật nội dung từ vựng / ví dụ mới nhất từ tác giả.
 */
export function mergeCommunityDecksIntoLocalState(
  localDecks: Deck[],
  localFolders: Folder[],
  localCards: StudyCard[],
  communityPayloads: CommunityDeckPayload[],
  options: CommunityMergeOptions = {}
): {
  updatedDecks: Deck[];
  updatedFolders: Folder[];
  updatedCards: StudyCard[];
  newDecksCount: number;
  newCardsCount: number;
  hasChanges: boolean;
} {
  const hiddenDeckIds = options.hiddenDeckIds ?? new Set<string>();
  const hiddenFolderIds = options.hiddenFolderIds ?? new Set<string>();
  const currentUid = options.currentUid ?? null;

  const deckMap = new Map<string, Deck>(localDecks.map((d) => [d.id, d]));
  const folderMap = new Map<string, Folder>(localFolders.map((f) => [f.id, f]));
  const cardMap = new Map<string, StudyCard>(localCards.map((c) => [c.id, c]));

  let newDecksCount = 0;
  let newCardsCount = 0;
  let hasChanges = false;

  for (const item of communityPayloads) {
    const { deck, folder, cards } = item;
    const docId = item.docId || deck.id;

    // Người dùng đã xoá / bỏ deck này khỏi thư viện
    if (hiddenDeckIds.has(docId) || hiddenDeckIds.has(deck.id)) continue;

    const isSelfAuthored =
      Boolean(currentUid) &&
      (item.authorUid === currentUid || deck.authorUid === currentUid);

    const existingDeck = deckMap.get(deck.id);

    // Không bao giờ ghi đè deck người dùng tự tạo hoặc nội dung builtin.
    // Deck tự publish bởi chính người dùng được xem là owned và giữ nguyên bản local.
    if (existingDeck && (existingDeck.origin !== 'community' || isSelfAuthored)) {
      continue;
    }

    // 1. Thêm Folder nếu có và chưa bị người dùng xoá
    if (folder && !hiddenFolderIds.has(folder.id) && !folderMap.has(folder.id)) {
      folderMap.set(folder.id, { ...folder, isDefault: false });
      hasChanges = true;
    }

    // 2. Thêm hoặc cập nhật Deck
    if (!existingDeck) {
      deckMap.set(deck.id, {
        ...deck,
        origin: isSelfAuthored ? 'owned' : 'community',
        visibility: 'community',
        communityDocId: docId,
        sourceDeckId: deck.id,
        isDefault: false
      });
      newDecksCount++;
      hasChanges = true;
    } else {
      // Chỉ cập nhật metadata của deck đã tải từ cộng đồng, giữ nguyên FSRS của người dùng
      const nextDescription = deck.description || existingDeck.description;
      const nextAuthorName = deck.authorName || existingDeck.authorName;
      if (
        existingDeck.name !== deck.name ||
        existingDeck.description !== nextDescription ||
        existingDeck.communityDocId !== docId ||
        existingDeck.authorName !== nextAuthorName
      ) {
        hasChanges = true;
      }
      deckMap.set(deck.id, {
        ...existingDeck,
        name: deck.name,
        description: nextDescription,
        visibility: 'community',
        communityDocId: docId,
        authorName: nextAuthorName
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
        hasChanges = true;
      } else {
        // Bảo vệ chống ghi đè chéo deck (ngăn deck cộng đồng chiếm quyền sửa thẻ builtin/private khác)
        if (existingCard.deckId !== deck.id) continue;

        const prevWord = existingCard.word;
        const nextWord = {
          id: prevWord?.id || remoteCard.word.id,
          surface: remoteCard.word.surface,
          readings: remoteCard.word.readings || prevWord?.readings || [remoteCard.word.surface],
          meaningVi: remoteCard.word.meaningVi,
          pos: remoteCard.word.pos || prevWord?.pos || '名詞',
          hanVietBreakdown: remoteCard.word.hanVietBreakdown || prevWord?.hanVietBreakdown || [],
          kanji: remoteCard.word.kanji || prevWord?.kanji || [],
          exampleJp: remoteCard.word.exampleJp || prevWord?.exampleJp,
          exampleVi: remoteCard.word.exampleVi || prevWord?.exampleVi,
          exampleIds: prevWord?.exampleIds || remoteCard.word.exampleIds || [],
          tags: prevWord?.tags || remoteCard.word.tags || ['community']
        };

        if (
          !prevWord ||
          prevWord.surface !== nextWord.surface ||
          prevWord.meaningVi !== nextWord.meaningVi ||
          prevWord.exampleJp !== nextWord.exampleJp ||
          prevWord.exampleVi !== nextWord.exampleVi ||
          JSON.stringify(prevWord.readings) !== JSON.stringify(nextWord.readings)
        ) {
          hasChanges = true;
        }

        // Clone thẻ thay vì mutate tại chỗ để giữ bất biến React state
        cardMap.set(remoteCard.id, {
          ...existingCard,
          word: nextWord
        });
      }
    }
  }

  return {
    updatedDecks: Array.from(deckMap.values()),
    updatedFolders: Array.from(folderMap.values()),
    updatedCards: Array.from(cardMap.values()),
    newDecksCount,
    newCardsCount,
    hasChanges
  };
}
