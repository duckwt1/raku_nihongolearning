import { describe, it, expect } from 'vitest';
import { mergeCommunityDecksIntoLocalState, type CommunityDeckPayload } from './communitySync';
import { createNewCard, type Deck, type StudyCard } from '@raku/core';

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck_existing',
    folderId: null,
    name: 'Existing Local Deck',
    cardType: 'word',
    cardIds: ['c_1'],
    newCardsPerDay: 20,
    maxReviewsPerDay: 50,
    isDefault: false,
    origin: 'owned',
    visibility: 'private',
    ...overrides
  };
}

function makePayload(overrides: Partial<CommunityDeckPayload> = {}): CommunityDeckPayload {
  return {
    docId: 'deck_existing',
    id: 'deck_existing',
    authorUid: 'uid_author',
    authorName: 'Author',
    deck: makeDeck({
      name: 'Community Deck (Updated)',
      origin: 'owned',
      visibility: 'community',
      authorUid: 'uid_author'
    }),
    folder: { id: 'folder_shared', name: 'Shared folder', parentId: null },
    cards: [
      {
        id: 'c_1',
        type: 'word',
        refId: 'w_1',
        word: {
          id: 'w_1',
          surface: 'surface-updated',
          readings: ['reading'],
          meaningVi: 'updated meaning'
        }
      },
      {
        id: 'c_2',
        type: 'word',
        refId: 'w_2',
        word: {
          id: 'w_2',
          surface: 'surface-new',
          readings: ['reading-new'],
          meaningVi: 'new meaning'
        }
      }
    ],
    ...overrides
  };
}

function makeExistingCard(): StudyCard {
  return {
    id: 'c_1',
    type: 'word',
    refId: 'w_1',
    deckId: 'deck_existing',
    word: {
      id: 'w_1',
      surface: 'surface-old',
      readings: ['reading'],
      meaningVi: 'old meaning',
      pos: '名詞',
      hanVietBreakdown: [],
      kanji: [],
      exampleIds: [],
      tags: []
    },
    fsrsCard: {
      ...createNewCard(),
      reps: 5,
      stability: 10.5,
      difficulty: 4.2
    },
    isNew: false,
    isDue: true
  };
}

describe('Community Deck Syncing', () => {
  it('merges a new community deck, its folder and cards without overwriting FSRS progress', () => {
    const result = mergeCommunityDecksIntoLocalState(
      [],
      [],
      [],
      [makePayload()]
    );

    expect(result.updatedFolders.some((f) => f.id === 'folder_shared')).toBe(true);
    const deck = result.updatedDecks.find((d) => d.id === 'deck_existing');
    expect(deck?.origin).toBe('community');
    expect(deck?.visibility).toBe('community');
    expect(deck?.communityDocId).toBe('deck_existing');
    expect(deck?.isDefault).toBe(false);
    expect(result.newDecksCount).toBe(1);
    expect(result.newCardsCount).toBe(2);
  });

  it('updates metadata and word content of an existing community deck while keeping FSRS progress', () => {
    const localDeck = makeDeck({ origin: 'community', visibility: 'community' });
    const result = mergeCommunityDecksIntoLocalState(
      [localDeck],
      [],
      [makeExistingCard()],
      [makePayload()]
    );

    const deck = result.updatedDecks.find((d) => d.id === 'deck_existing');
    expect(deck?.name).toBe('Community Deck (Updated)');

    const c1 = result.updatedCards.find((c) => c.id === 'c_1');
    expect(c1?.fsrsCard.reps).toBe(5);
    expect(c1?.fsrsCard.stability).toBe(10.5);
    expect(c1?.word?.meaningVi).toBe('updated meaning');

    const c2 = result.updatedCards.find((c) => c.id === 'c_2');
    expect(c2).toBeDefined();
    expect(c2?.isNew).toBe(true);
    expect(result.newCardsCount).toBe(1);
    expect(result.newDecksCount).toBe(0);
  });

  it('never overwrites a deck owned by the current user', () => {
    const localDeck = makeDeck({ origin: 'owned', visibility: 'private', name: 'My deck' });
    const result = mergeCommunityDecksIntoLocalState(
      [localDeck],
      [],
      [],
      [makePayload({ authorUid: 'uid_other' })],
      { currentUid: 'uid_me' }
    );

    const deck = result.updatedDecks.find((d) => d.id === 'deck_existing');
    expect(deck?.name).toBe('My deck');
    expect(deck?.visibility).toBe('private');
    expect(result.newCardsCount).toBe(0);
  });

  it('does not re-add a deck the user has deleted / removed from library', () => {
    const result = mergeCommunityDecksIntoLocalState(
      [],
      [],
      [],
      [makePayload()],
      { hiddenDeckIds: new Set(['deck_existing']) }
    );

    expect(result.updatedDecks).toHaveLength(0);
    expect(result.newDecksCount).toBe(0);
  });

  it('does not re-create a folder the user has deleted', () => {
    const result = mergeCommunityDecksIntoLocalState(
      [],
      [],
      [],
      [makePayload()],
      { hiddenFolderIds: new Set(['folder_shared']) }
    );

    expect(result.updatedFolders).toHaveLength(0);
    expect(result.newDecksCount).toBe(1);
  });

  it('restores a deck published by the current user as an owned deck', () => {
    const payload = makePayload({ authorUid: 'uid_me' });
    const result = mergeCommunityDecksIntoLocalState([], [], [], [payload], {
      currentUid: 'uid_me'
    });

    const deck = result.updatedDecks.find((d) => d.id === 'deck_existing');
    expect(deck?.origin).toBe('owned');
    expect(deck?.visibility).toBe('community');
  });
});
