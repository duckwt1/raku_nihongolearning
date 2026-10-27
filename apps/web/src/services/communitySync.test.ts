import { describe, it, expect } from 'vitest';
import { mergeCommunityDecksIntoLocalState, type CommunityDeckPayload } from './communitySync';
import { createNewCard, type Deck, type StudyCard } from '@raku/core';

describe('Community Deck Syncing', () => {
  it('merges new community decks, folders, and cards without overwriting existing FSRS progress', () => {
    const existingDeck: Deck = {
      id: 'deck_existing',
      folderId: null,
      name: 'Existing Local Deck',
      cardType: 'word',
      cardIds: ['c_1'],
      newCardsPerDay: 20,
      maxReviewsPerDay: 50,
      isDefault: true,
      visibility: 'community'
    };

    const existingCard: StudyCard = {
      id: 'c_1',
      type: 'word',
      refId: 'w_1',
      deckId: 'deck_existing',
      word: {
        id: 'w_1',
        surface: 'うっかり',
        readings: ['うっかり'],
        meaningVi: 'lơ đãng (old text)',
        pos: '副詞',
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

    const communityPayloads: CommunityDeckPayload[] = [
      {
        id: 'deck_existing',
        deck: {
          id: 'deck_existing',
          folderId: 'folder_n3_custom',
          name: 'N3 Phó từ nâng cao (Updated)',
          cardType: 'word',
          cardIds: ['c_1', 'c_2'],
          newCardsPerDay: 20,
          maxReviewsPerDay: 50,
          isDefault: false,
          visibility: 'community'
        },
        folder: {
          id: 'folder_n3_custom',
          name: 'Phó từ N3',
          parentId: null
        },
        cards: [
          {
            id: 'c_1',
            type: 'word',
            refId: 'w_1',
            word: {
              id: 'w_1',
              surface: 'うっかり',
              readings: ['うっかり'],
              meaningVi: 'sơ ý; lơ đãng (updated meaning)',
              exampleJp: 'うっかり財布を忘れました。',
              exampleVi: 'Tôi đã sơ ý quên ví.'
            }
          },
          {
            id: 'c_2',
            type: 'word',
            refId: 'w_2',
            word: {
              id: 'w_2',
              surface: 'すっかり',
              readings: ['すっかり'],
              meaningVi: 'hoàn toàn; hết sạch',
              exampleJp: '宿題はすっかり終わりました。',
              exampleVi: 'Bài tập đã hoàn thành hết.'
            }
          }
        ]
      }
    ];

    const result = mergeCommunityDecksIntoLocalState(
      [existingDeck],
      [],
      [existingCard],
      communityPayloads
    );

    // Folder added
    expect(result.updatedFolders.some((f) => f.id === 'folder_n3_custom')).toBe(true);

    // Deck name updated
    const updatedDeck = result.updatedDecks.find((d) => d.id === 'deck_existing');
    expect(updatedDeck?.name).toBe('N3 Phó từ nâng cao (Updated)');

    // Card 1 retained its personal FSRS study progress!
    const c1 = result.updatedCards.find((c) => c.id === 'c_1');
    expect(c1?.fsrsCard.reps).toBe(5);
    expect(c1?.fsrsCard.stability).toBe(10.5);
    expect(c1?.word?.meaningVi).toBe('sơ ý; lơ đãng (updated meaning)');
    expect(c1?.word?.exampleJp).toBe('うっかり財布を忘れました。');

    // Card 2 was added as a new card
    const c2 = result.updatedCards.find((c) => c.id === 'c_2');
    expect(c2).toBeDefined();
    expect(c2?.isNew).toBe(true);
    expect(c2?.word?.surface).toBe('すっかり');
    expect(result.newCardsCount).toBe(1);
  });
});
