import { collection, getDocs, type Firestore } from 'firebase/firestore';
import {
  createNewCard,
  type Deck,
  type Folder,
  type StudyCard
} from '@raku/core';

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

export interface CommunityMergeOptions {
  /** Id deck người dùng đã xoá / bỏ khỏi thư viện - không merge lại */
  hiddenDeckIds?: ReadonlySet<string>;
  /** Id folder người dùng đã xoá - không tạo lại */
  hiddenFolderIds?: ReadonlySet<string>;
  /** Uid hiện tại, dùng để nhận biết deck do chính người dùng publish */
  currentUid?: string | null;
}

/**
 * Tải toàn bộ danh sách các bộ thẻ cộng đồng từ Firestore (1 read / community deck).
 */
export async function fetchCommunityDecksFromDb(db: Firestore): Promise<CommunityDeckPayload[]> {
  try {
    const snap = await getDocs(collection(db, 'communityDecks'));
    const list: CommunityDeckPayload[] = [];
    snap.forEach((d) => {
      const data = d.data() as CommunityDeckPayload;
      if (data && data.deck && Array.isArray(data.cards)) {
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
 * Tự động gộp các bộ thẻ cộng đồng vào bộ thẻ trên máy của người dùng (dùng chung Web & Mobile).
 * Đảm bảo:
 * 1. Không ghi đè tiến độ học FSRS cá nhân của người dùng.
 * 2. Không ghi đè deck do người dùng sở hữu (origin: 'owned' / 'builtin') trừ trường hợp
 *    chính người dùng đang có deck trống (0 thẻ) trên thiết bị khác và cần khôi phục từ communityDecks.
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
    const localCardsInThisDeck = existingDeck
      ? localCards.filter((c) => c.deckId === deck.id).length
      : 0;

    // Nếu người dùng đã có deck owned cục bộ (và không bị rỗng trên thiết bị mới), không ghi đè.
    // Trường hợp đặc biệt: deck tự publish bởi chính user nhưng đang có 0 thẻ cục bộ
    // (ví dụ mới sync metadata từ thiết bị khác sang) -> vẫn nạp thẻ từ communityDecks!
    const shouldHydrateEmptySelfDeck =
      Boolean(existingDeck) &&
      isSelfAuthored &&
      existingDeck?.visibility === 'community' &&
      localCardsInThisDeck === 0 &&
      cards.length > 0;

    if (
      existingDeck &&
      !shouldHydrateEmptySelfDeck &&
      (existingDeck.origin !== 'community' || isSelfAuthored)
    ) {
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
    } else if (!shouldHydrateEmptySelfDeck) {
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
        const readings = Array.isArray(remoteCard.word.readings)
          ? remoteCard.word.readings.filter(Boolean)
          : [];
        const newLocalCard: StudyCard = {
          id: remoteCard.id,
          type: (remoteCard.type as StudyCard['type']) || 'word',
          refId: remoteCard.refId || remoteCard.id,
          deckId: deck.id,
          word: {
            id: remoteCard.word.id,
            surface: remoteCard.word.surface,
            readings: readings.length > 0 ? readings : [remoteCard.word.surface],
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
        const readings = Array.isArray(remoteCard.word.readings)
          ? remoteCard.word.readings.filter(Boolean)
          : [];
        const nextWord = {
          id: prevWord?.id || remoteCard.word.id,
          surface: remoteCard.word.surface,
          readings:
            readings.length > 0 ? readings : prevWord?.readings || [remoteCard.word.surface],
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
