import { describe, expect, it } from 'vitest';
import { applyGrade, buildDefaultCards, Rating } from '@raku/core';
import {
  createMemoryStorage,
  createUserRepository,
  getUserStorageKey,
  mergeFirestoreCardProgress,
  sanitizeFirestoreData
} from './index.js';

describe('@raku/sync', () => {
  it('namespaces user storage keys consistently with web profile keys', () => {
    expect(getUserStorageKey('cards', null)).toBe('raku_cards_guest');
    expect(getUserStorageKey('cards', 'local_device')).toBe('raku_cards_guest');
    expect(getUserStorageKey('cards', 'uid_abc')).toBe('raku_cards_user_uid_abc');
  });

  it('persists and rehydrates StudyCard FSRS dates accurately across restarts', async () => {
    const repo = createUserRepository(createMemoryStorage());
    const defaults = buildDefaultCards();
    const first = defaults[0]!;
    const graded = applyGrade(first.fsrsCard, Rating.Good);
    const reviewedCard = {
      ...first,
      fsrsCard: graded.card,
      isNew: false,
      firstLearnedAt: '2026-11-22T09:00:00.000Z',
      learnedAt: '2026-11-22T09:00:00.000Z'
    };

    await repo.saveCards('uid_1', [reviewedCard]);
    const loaded = await repo.loadCards('uid_1');

    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.fsrsCard.due).toBeInstanceOf(Date);
    expect(loaded[0]!.fsrsCard.last_review).toBeInstanceOf(Date);
    expect(loaded[0]!.fsrsCard.reps).toBe(1);
    expect(loaded[0]!.isNew).toBe(false);
  });

  it('enqueues and selectively acknowledges offline review items', async () => {
    const repo = createUserRepository(createMemoryStorage());
    const card = buildDefaultCards()[0]!;

    await repo.enqueueOfflineReview(
      { id: 'rev_1', userId: 'u1', card, rating: Rating.Good, reviewedAt: '2026-11-22T10:00:00.000Z' },
      'u1'
    );
    await repo.enqueueOfflineReview(
      { id: 'rev_2', userId: 'u1', card, rating: Rating.Easy, reviewedAt: '2026-11-22T10:01:00.000Z' },
      'u1'
    );

    expect(await repo.getOfflineQueue('u1')).toHaveLength(2);
    await repo.removeOfflineReviewItems('u1', ['rev_1']);
    const remaining = await repo.getOfflineQueue('u1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('rev_2');
  });

  it('strips undefined and NaN values before writing to Firestore', () => {
    const cleaned = sanitizeFirestoreData({
      ok: 'value',
      undef: undefined,
      badNum: Number.NaN,
      nested: { a: 1, b: undefined, arr: [1, undefined, Number.POSITIVE_INFINITY] }
    });
    expect(cleaned).toEqual({
      ok: 'value',
      badNum: 0,
      nested: { a: 1, arr: [1, 0] }
    });
  });

  it('preserves newer local FSRS progress when merging older cloud snapshots', () => {
    const card = buildDefaultCards()[0]!;
    const localCard = {
      ...card,
      isNew: false,
      fsrsCard: {
        ...card.fsrsCard,
        reps: 4,
        last_review: new Date('2026-11-22T12:00:00.000Z')
      }
    };

    const merged = mergeFirestoreCardProgress([localCard], {
      [card.id]: {
        reps: 2,
        last_review: '2026-11-20T12:00:00.000Z',
        due: '2026-11-25T12:00:00.000Z'
      }
    });
    expect(merged[0]!.fsrsCard.reps).toBe(4);
  });
});
