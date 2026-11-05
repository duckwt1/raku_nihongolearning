import { describe, it, expect } from 'vitest';
import { mergeFirestoreCardProgress } from './firestoreSync';
import { createNewCard, getDailyNewWordCounts, getTodayDateString, type StudyCard, type Word } from '@raku/core';

function makeWord(id: string, surface: string, reading: string, meaningVi: string): Word {
  return {
    id,
    surface,
    readings: [reading],
    meaningVi,
    kanji: [],
    hanVietBreakdown: [],
    exampleIds: [],
    tags: []
  };
}

describe('mergeFirestoreCardProgress', () => {
  it('merges firstLearnedAt from cloud snapshot into local cards', () => {
    const today = getTodayDateString();
    const localCards: StudyCard[] = [
      {
        id: 'c_word_w_1',
        type: 'word',
        refId: 'w_1',
        word: makeWord('w_1', '猫', 'ねこ', 'con mèo'),
        fsrsCard: createNewCard(),
        isNew: true,
        isDue: false
      },
      {
        id: 'c_word_w_2',
        type: 'word',
        refId: 'w_2',
        word: makeWord('w_2', '犬', 'いぬ', 'con chó'),
        fsrsCard: createNewCard(),
        isNew: true,
        isDue: false
      }
    ];

    const cloudCards = {
      c_word_w_1: {
        firstLearnedAt: `${today}T08:00:00.000Z`,
        learnedAt: `${today}T08:05:00.000Z`,
        reps: 2, // User reviewed twice (e.g. hit Again, then Good)
        state: 1,
        last_review: `${today}T08:05:00.000Z`
      },
      c_word_w_2: {
        firstLearnedAt: `${today}T08:10:00.000Z`,
        learnedAt: `${today}T08:10:00.000Z`,
        reps: 1,
        state: 2,
        last_review: `${today}T08:10:00.000Z`
      }
    };

    const merged = mergeFirestoreCardProgress(localCards, cloudCards);

    expect(merged[0]?.firstLearnedAt).toBe(`${today}T08:00:00.000Z`);
    expect(merged[1]?.firstLearnedAt).toBe(`${today}T08:10:00.000Z`);

    // Verify getDailyNewWordCounts counts BOTH cards (reps=2 and reps=1)
    const counts = getDailyNewWordCounts(merged);
    expect(counts.get(today)).toBe(2);
  });

  it('preserves existing local firstLearnedAt if cloud does not have one', () => {
    const localCards: StudyCard[] = [
      {
        id: 'c_word_w_1',
        type: 'word',
        refId: 'w_1',
        firstLearnedAt: '2026-11-01T10:00:00.000Z',
        fsrsCard: createNewCard(),
        isNew: false,
        isDue: false
      }
    ];

    const cloudCards = {
      c_word_w_1: {
        reps: 3,
        state: 2
      }
    };

    const merged = mergeFirestoreCardProgress(localCards, cloudCards);
    expect(merged[0]?.firstLearnedAt).toBe('2026-11-01T10:00:00.000Z');
  });
});
