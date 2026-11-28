import { describe, expect, it } from 'vitest';
import {
  BUILTIN_CONVERSATION_SCENARIOS,
  applyGrade,
  buildDefaultCards,
  Rating,
  type ConversationSession,
  type SentenceAttemptRecord
} from '@raku/core';
import {
  createMemoryStorage,
  createUserRepository,
  getUserStorageKey,
  mergeConversationSessions,
  mergeFirestoreCardProgress,
  mergeSentenceHistory,
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

  it('appends cloud-only custom word cards during mergeFirestoreCardProgress', () => {
    const localCards = buildDefaultCards().slice(0, 1);
    const merged = mergeFirestoreCardProgress(localCards, {
      c_word_conv_1: {
        id: 'c_word_conv_1',
        refId: 'w_conv_1',
        type: 'word',
        deckId: 'deck_conv',
        word: {
          id: 'w_conv_1',
          surface: '確認',
          readings: ['かくにん'],
          meaningVi: 'xác nhận',
          kanji: ['確', '認'],
          hanVietBreakdown: ['XÁC', 'NHẬN'],
          exampleIds: [],
          tags: ['custom', 'conversation']
        },
        reps: 1,
        due: '2026-11-26T10:00:00.000Z',
        last_review: '2026-11-25T10:00:00.000Z',
        state: 2
      }
    });

    expect(merged).toHaveLength(2);
    const added = merged.find((c) => c.id === 'c_word_conv_1');
    expect(added?.word?.surface).toBe('確認');
    expect(added?.deckId).toBe('deck_conv');
    expect(added?.fsrsCard.reps).toBe(1);
  });

  it('persists, merges, and clears conversation sessions & sentence history', async () => {
    const repo = createUserRepository(createMemoryStorage());
    const scenario = BUILTIN_CONVERSATION_SCENARIOS[0]!;
    const s1: ConversationSession = {
      id: 'sess_1',
      scenarioId: scenario.id,
      scenario,
      targetWords: [],
      messages: [
        {
          id: 'm_0',
          role: 'assistant',
          textJp: scenario.starterJp,
          createdAt: '2026-11-25T09:00:00.000Z'
        }
      ],
      completedMissionIds: [],
      usedTargetWords: [],
      status: 'active',
      startedAt: '2026-11-25T09:00:00.000Z',
      updatedAt: '2026-11-25T09:05:00.000Z'
    };
    const s1Newer: ConversationSession = {
      ...s1,
      status: 'completed',
      updatedAt: '2026-11-25T09:10:00.000Z'
    };

    const mergedSessions = mergeConversationSessions([s1], [s1Newer]);
    expect(mergedSessions).toHaveLength(1);
    expect(mergedSessions[0]!.status).toBe('completed');

    await repo.saveConversationSessions('u_hist', mergedSessions);
    expect(await repo.loadConversationSessions('u_hist')).toHaveLength(1);

    const attempt: SentenceAttemptRecord = {
      id: 'att_1',
      mode: 'word_builder',
      jlpt: 'N3',
      politeness: 'polite',
      promptText: 'Đặt câu với 確認',
      targetWords: [{ surface: '確認', reading: 'かくにん', meaningVi: 'xác nhận' }],
      userSentence: '資料を確認しました。',
      feedback: {
        isAcceptable: true,
        overallScore: 95,
        scores: { grammar: 5, naturalness: 5, politenessFit: 5 },
        correctedJp: '資料を確認しました。',
        naturalJp: '資料を確認しました。',
        readingJp: 'しりょうをかくにんしました。',
        explanationVi: 'Câu hoàn toàn tự nhiên.',
        issues: [],
        suggestedPhrases: []
      },
      createdAt: '2026-11-25T10:00:00.000Z'
    };

    const mergedHistory = mergeSentenceHistory([attempt], [attempt]);
    expect(mergedHistory).toHaveLength(1);
    await repo.saveSentenceHistory('u_hist', mergedHistory);
    expect(await repo.loadSentenceHistory('u_hist')).toHaveLength(1);

    await repo.clearUserData('u_hist');
    expect(await repo.loadConversationSessions('u_hist')).toHaveLength(0);
    expect(await repo.loadSentenceHistory('u_hist')).toHaveLength(0);
  });
});
