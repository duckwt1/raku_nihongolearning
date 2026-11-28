import { describe, expect, it } from 'vitest';
import {
  applyGrade,
  buildDefaultCards,
  createNewCard,
  Rating,
  type Deck,
  type StudyCard
} from '@raku/core';
import {
  DECK_BUNDLE_CHUNK_SIZE,
  computeCustomKanjiHash,
  computeDeckCardsHash,
  getDeckBundleDocId,
  isCustomBundleCard,
  isOwnedCustomDeck,
  mergeCommunityDecksIntoLocalState,
  mergeCustomKanjiLists,
  mergeDeckBundleCardsIntoLocal,
  mergeDecksById,
  packDeckCards,
  splitIntoBundleChunks
} from './index.js';

function makeCustomCard(id: string, deckId: string, surface: string, meaningVi: string): StudyCard {
  return {
    id,
    type: 'word',
    refId: `w_${id}`,
    deckId,
    word: {
      id: `w_${id}`,
      surface,
      readings: [surface],
      meaningVi,
      pos: '名詞',
      kanji: [],
      hanVietBreakdown: [],
      exampleIds: [],
      tags: ['import']
    },
    fsrsCard: createNewCard(),
    isNew: true,
    isDue: false
  };
}

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck_custom_1',
    folderId: null,
    name: 'My Custom Deck',
    cardType: 'word',
    cardIds: [],
    newCardsPerDay: 20,
    maxReviewsPerDay: 50,
    isDefault: false,
    origin: 'owned',
    visibility: 'private',
    ...overrides
  };
}

describe('deckBundles', () => {
  it('excludes built-in N3 seed words and non-owned decks from bundles', () => {
    const defaultCards = buildDefaultCards().slice(0, 3);
    expect(defaultCards.every((c) => !isCustomBundleCard(c))).toBe(true);
    expect(packDeckCards(defaultCards)).toHaveLength(0);

    expect(isOwnedCustomDeck(makeDeck({ origin: 'owned', isDefault: false }))).toBe(true);
    expect(isOwnedCustomDeck(makeDeck({ id: 'deck_n3_words', origin: 'builtin', isDefault: true }))).toBe(false);
    expect(isOwnedCustomDeck(makeDeck({ origin: 'community', visibility: 'community' }))).toBe(false);
  });

  it('produces identical deterministic hashes regardless of input order and changes on edits', () => {
    const c1 = makeCustomCard('c_1', 'd_1', '荷物', 'hành lý');
    const c2 = makeCustomCard('c_2', 'd_1', '預かる', 'nhận giữ');

    const hashA = computeDeckCardsHash(packDeckCards([c1, c2]));
    const hashB = computeDeckCardsHash(packDeckCards([c2, c1]));
    expect(hashA).toBeTruthy();
    expect(hashA).toBe(hashB);

    const c2Edited = makeCustomCard('c_2', 'd_1', '預かる', 'trông giữ đồ');
    const hashEdited = computeDeckCardsHash(packDeckCards([c1, c2Edited]));
    expect(hashEdited).not.toBe(hashA);
    expect(computeDeckCardsHash([])).toBe('');
  });

  it('splits large decks safely into chunks of <= DECK_BUNDLE_CHUNK_SIZE', () => {
    const cards = Array.from({ length: DECK_BUNDLE_CHUNK_SIZE * 2 + 50 }, (_, idx) =>
      makeCustomCard(`c_${String(idx).padStart(4, '0')}`, 'deck_big', `単語${idx}`, `nghĩa ${idx}`)
    );
    const packed = packDeckCards(cards);
    const hash = computeDeckCardsHash(packed);
    const chunks = splitIntoBundleChunks('deck_big', packed, hash);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.bundleId).toBe(getDeckBundleDocId('deck_big', 0));
    expect(chunks[0]?.data.cards).toHaveLength(DECK_BUNDLE_CHUNK_SIZE);
    expect(chunks[1]?.bundleId).toBe('deck_big__p1');
    expect(chunks[1]?.data.cards).toHaveLength(DECK_BUNDLE_CHUNK_SIZE);
    expect(chunks[2]?.bundleId).toBe('deck_big__p2');
    expect(chunks[2]?.data.cards).toHaveLength(50);
    expect(chunks.every((ch) => ch.data.chunkCount === 3 && ch.data.cardsHash === hash)).toBe(true);
  });

  it('merges bundle cards into local state while preserving FSRS progress and honoring authoritative deletes', () => {
    const base = makeCustomCard('c_1', 'deck_1', '確認', 'xác nhận');
    const graded = applyGrade(base.fsrsCard, Rating.Good);
    const reviewedLocal: StudyCard = {
      ...base,
      fsrsCard: graded.card,
      isNew: false,
      firstLearnedAt: '2026-11-20T10:00:00.000Z',
      learnedAt: '2026-11-20T10:00:00.000Z'
    };
    const deletedOnOtherDevice = makeCustomCard('c_old', 'deck_1', '古い', 'cũ');
    const otherDeckCard = makeCustomCard('c_other', 'deck_2', '別', 'khác');

    const incomingPacked = packDeckCards([
      makeCustomCard('c_1', 'deck_1', '確認', 'xác nhận (cập nhật)'),
      makeCustomCard('c_new', 'deck_1', '準備', 'chuẩn bị')
    ]);

    const res = mergeDeckBundleCardsIntoLocal(
      [reviewedLocal, deletedOnOtherDevice, otherDeckCard],
      'deck_1',
      incomingPacked,
      { authoritative: true }
    );

    expect(res.addedCount).toBe(1);
    expect(res.updatedCount).toBe(1);
    expect(res.removedCount).toBe(1);
    expect(res.hasChanges).toBe(true);

    const c1 = res.cards.find((c) => c.id === 'c_1');
    expect(c1?.word?.meaningVi).toBe('xác nhận (cập nhật)');
    expect(c1?.fsrsCard.reps).toBe(1);
    expect(c1?.isNew).toBe(false);
    expect(c1?.firstLearnedAt).toBe('2026-11-20T10:00:00.000Z');

    expect(res.cards.find((c) => c.id === 'c_new')?.word?.surface).toBe('準備');
    expect(res.cards.find((c) => c.id === 'c_old')).toBeUndefined();
    expect(res.cards.find((c) => c.id === 'c_other')).toBeDefined();
  });

  it('hydrates an empty self-authored community deck on a second device (Mobile)', () => {
    const emptyOwnedDeck = makeDeck({
      id: 'deck_shared_1',
      origin: 'owned',
      visibility: 'community',
      authorUid: 'uid_me'
    });
    const res = mergeCommunityDecksIntoLocalState(
      [emptyOwnedDeck],
      [],
      [],
      [
        {
          docId: 'deck_shared_1',
          id: 'deck_shared_1',
          authorUid: 'uid_me',
          deck: emptyOwnedDeck,
          cards: [
            {
              id: 'c_s1',
              type: 'word',
              refId: 'w_s1',
              word: { id: 'w_s1', surface: '約束', readings: ['やくそく'], meaningVi: 'lời hứa' }
            }
          ]
        }
      ],
      { currentUid: 'uid_me' }
    );

    expect(res.newCardsCount).toBe(1);
    expect(res.updatedCards.find((c) => c.id === 'c_s1')?.word?.surface).toBe('約束');
  });

  it('merges decks bidirectionally while respecting tombstones and preserving cardsHash', () => {
    const local = [
      makeDeck({ id: 'deck_mobile_only', name: 'Mobile Deck', updatedAt: '2026-11-28T10:00:00.000Z' }),
      makeDeck({ id: 'deck_shared', name: 'Old Name', updatedAt: '2026-11-27T10:00:00.000Z' })
    ];
    const remote = [
      makeDeck({
        id: 'deck_shared',
        name: 'New Name',
        cardsHash: 'hash-v2',
        cardCount: 25,
        updatedAt: '2026-11-28T11:00:00.000Z'
      }),
      makeDeck({ id: 'deck_deleted_locally', name: 'Deleted' })
    ];

    const merged = mergeDecksById(local, remote, 'uid_1', new Set(['deck_deleted_locally']));
    expect(merged.map((d) => d.id)).toEqual(['deck_mobile_only', 'deck_shared']);
    expect(merged.find((d) => d.id === 'deck_shared')?.cardsHash).toBe('hash-v2');
    expect(merged.find((d) => d.id === 'deck_shared')?.name).toBe('New Name');
  });

  it('hashes and merges custom AI Kanji deterministically without overriding SEED_KANJI', () => {
    const k1 = {
      char: '鞄',
      hanViet: ['BÀO'],
      onyomi: ['ホウ'],
      kunyomi: ['かばん'],
      meaningVi: 'cặp sách, túi xách',
      lookalikes: ['抱'],
      radicals: ['革'],
      source: 'ai' as const
    };
    const k2 = {
      char: '曖',
      hanViet: ['ÁI'],
      onyomi: ['アイ'],
      kunyomi: [],
      meaningVi: 'mơ hồ, không rõ ràng',
      lookalikes: ['愛'],
      radicals: ['日'],
      source: 'ai' as const
    };

    const hA = computeCustomKanjiHash([k1, k2]);
    const hB = computeCustomKanjiHash([k2, k1]);
    expect(hA).toBeTruthy();
    expect(hA).toBe(hB);

    const merged = mergeCustomKanjiLists([k1], [k2]);
    expect(merged.addedCount).toBe(1);
    expect(merged.list.map((k) => k.char)).toEqual(['曖', '鞄']);
  });
});
