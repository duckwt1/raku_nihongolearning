import { describe, expect, it } from 'vitest';
import type { Deck, Folder } from '../models/schemas.js';
import {
  LEGACY_CUSTOM_FOLDER_ID,
  USER_DECKS_FOLDER_ID,
  migrateDecks,
  migrateFolders
} from './deckMigration.js';

function makeDeck(overrides: Partial<Deck> & Pick<Deck, 'id'>): Deck {
  return {
    folderId: null,
    name: 'Deck',
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

describe('legacy deck/folder migration', () => {
  it('replaces the legacy "Kho Cá Nhân & AI" folder with "Bộ thẻ của tôi"', () => {
    const folders: Folder[] = [
      { id: 'folder_jlpt_n3', name: 'JLPT N3', parentId: null },
      { id: LEGACY_CUSTOM_FOLDER_ID, name: 'Kho Cá Nhân & AI', parentId: null }
    ];

    const migrated = migrateFolders(folders);
    expect(migrated.some((f) => f.id === LEGACY_CUSTOM_FOLDER_ID)).toBe(false);
    expect(migrated.some((f) => f.id === USER_DECKS_FOLDER_ID)).toBe(true);
    expect(migrated.find((f) => f.id === 'folder_jlpt_n3')?.isDefault).toBe(true);
  });

  it('moves decks out of the legacy folder and marks builtin decks private', () => {
    const decks = migrateDecks(
      [
        makeDeck({ id: 'deck_old', folderId: LEGACY_CUSTOM_FOLDER_ID }),
        makeDeck({
          id: 'deck_n3_words',
          folderId: 'folder_jlpt_n3',
          isDefault: true,
          origin: 'builtin',
          visibility: 'community'
        })
      ],
      'uid_me'
    );

    expect(decks[0]?.folderId).toBe(USER_DECKS_FOLDER_ID);
    expect(decks[1]?.origin).toBe('builtin');
    expect(decks[1]?.visibility).toBe('private');
  });

  it('marks decks authored by another user as community decks', () => {
    const [deck] = migrateDecks(
      [
        makeDeck({
          id: 'deck_shared',
          authorUid: 'uid_other',
          visibility: 'community',
          origin: undefined as unknown as 'owned'
        })
      ],
      'uid_me'
    );

    expect(deck?.origin).toBe('community');
    expect(deck?.visibility).toBe('community');
    expect(deck?.communityDocId).toBe('deck_shared');
  });

  it('turns the legacy import deck into a normal owned deck', () => {
    const [deck] = migrateDecks([
      makeDeck({
        id: 'deck_custom_import',
        folderId: LEGACY_CUSTOM_FOLDER_ID,
        isDefault: true,
        origin: 'builtin'
      })
    ]);

    expect(deck?.isDefault).toBe(false);
    expect(deck?.origin).toBe('owned');
    expect(deck?.folderId).toBe(USER_DECKS_FOLDER_ID);
  });

  it('defaults visibility to private for legacy decks without the field', () => {
    const [deck] = migrateDecks([
      makeDeck({
        id: 'deck_legacy',
        visibility: undefined as unknown as 'private'
      })
    ]);

    expect(deck?.visibility).toBe('private');
    expect(deck?.origin).toBe('owned');
  });
});
