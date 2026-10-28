import { describe, expect, it } from 'vitest';
import { canDeleteDeck, isDeckOwner } from './deckOwnership.js';

describe('deck ownership', () => {
  it('treats decks created by the current user as owned', () => {
    const deck = { origin: 'owned' as const, authorUid: 'uid_me' };
    expect(isDeckOwner(deck, 'uid_me')).toBe(true);
    expect(canDeleteDeck({ ...deck, isDefault: false }, 'uid_me')).toBe(true);
  });

  it('allows legacy / guest decks without authorUid', () => {
    const deck = { origin: 'owned' as const, authorUid: undefined };
    expect(isDeckOwner(deck, undefined)).toBe(true);
    expect(isDeckOwner(deck, 'uid_me')).toBe(true);
    expect(isDeckOwner({ origin: 'owned' as const, authorUid: 'anonymous' }, 'uid_me')).toBe(
      true
    );
  });

  it('does not allow deleting a community deck owned by another user', () => {
    const deck = { origin: 'community' as const, authorUid: 'uid_other' };
    expect(isDeckOwner(deck, 'uid_me')).toBe(false);
    expect(canDeleteDeck({ ...deck, isDefault: false }, 'uid_me')).toBe(false);
  });

  it('does not allow deleting a community deck without owner info', () => {
    const deck = { origin: 'community' as const, authorUid: undefined };
    expect(isDeckOwner(deck, 'uid_me')).toBe(false);
  });

  it('allows the author to delete their own community deck', () => {
    const deck = { origin: 'community' as const, authorUid: 'uid_me' };
    expect(isDeckOwner(deck, 'uid_me')).toBe(true);
    expect(canDeleteDeck({ ...deck, isDefault: false }, 'uid_me')).toBe(true);
  });

  it('never allows deleting builtin/default decks', () => {
    expect(
      canDeleteDeck({ origin: 'builtin', authorUid: undefined, isDefault: true }, 'uid_me')
    ).toBe(false);
    expect(
      canDeleteDeck(
        { origin: 'owned', authorUid: 'uid_me', isDefault: true },
        'uid_me'
      )
    ).toBe(false);
  });
});
