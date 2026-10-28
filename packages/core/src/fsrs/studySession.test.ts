import { describe, expect, it } from 'vitest';
import {
  buildReviewQueue,
  applyReviewLogsToCards,
  countNewItemsLearnedToday,
  getTodayDateString,
  type StudyCard
} from './studySession.js';
import { createNewCard } from './scheduler.js';

describe('buildReviewQueue', () => {
  const dummyWord = {
    id: 'w1',
    surface: '預かる',
    readings: ['あずかる'],
    meaningVi: 'nhận giữ',
    kanji: ['預'],
    hanVietBreakdown: ['DỰ'],
    exampleIds: [],
    tags: []
  };

  it('correctly prioritizes due cards over new cards', () => {
    const now = new Date('2026-05-01T12:00:00Z');
    const past = new Date('2026-05-01T08:00:00Z');

    const dueCard1: StudyCard = {
      id: 'c1',
      type: 'word',
      refId: 'w1',
      word: { ...dummyWord, id: 'w1', surface: 'due_1' },
      fsrsCard: { ...createNewCard(past), due: past },
      isNew: false,
      isDue: true
    };

    const newCard1: StudyCard = {
      id: 'c2',
      type: 'word',
      refId: 'w2',
      word: { ...dummyWord, id: 'w2', surface: 'new_1' },
      fsrsCard: createNewCard(now),
      isNew: true,
      isDue: false
    };

    const session = buildReviewQueue([newCard1, dueCard1], 10, 50, now);
    expect(session.totalCards).toBe(2);
    // Due cards must be first in queue
    expect(session.queue[0]?.word?.surface).toBe('due_1');
    expect(session.queue[1]?.word?.surface).toBe('new_1');
  });

  it('filters out cards already studied and scheduled for future, selecting the next unlearned cards', () => {
    const now = new Date('2026-05-01T12:00:00Z');
    const tomorrow = new Date('2026-05-02T12:00:00Z');

    // Card 1: already learned and scheduled for tomorrow
    const studiedCard1: StudyCard = {
      id: 'c1',
      type: 'word',
      refId: 'w1',
      word: { ...dummyWord, id: 'w1', surface: 'studied_1' },
      fsrsCard: {
        ...createNewCard(now),
        due: tomorrow,
        reps: 1,
        last_review: now
      },
      isNew: false,
      isDue: false
    };

    // Card 2: next unlearned card
    const unlearnedCard2: StudyCard = {
      id: 'c2',
      type: 'word',
      refId: 'w2',
      word: { ...dummyWord, id: 'w2', surface: 'unlearned_2' },
      fsrsCard: createNewCard(now),
      isNew: true,
      isDue: false
    };

    // When building queue with extraNewCards = 1 (to bypass daily quota for studied card)
    const session = buildReviewQueue([studiedCard1, unlearnedCard2], 1, 50, now, 1);
    expect(session.queue.length).toBe(1);
    // The studied card must NOT be in queue; only the next unlearned card should be chosen!
    expect(session.queue[0]?.word?.surface).toBe('unlearned_2');
  });

  it('re-queues studied card only when its due date arrives', () => {
    const past = new Date('2026-05-01T12:00:00Z');
    const futureDue = new Date('2026-05-03T12:00:00Z');
    const laterTime = new Date('2026-05-04T12:00:00Z');

    const card: StudyCard = {
      id: 'c1',
      type: 'word',
      refId: 'w1',
      word: { ...dummyWord, id: 'w1', surface: 'word_due_later' },
      fsrsCard: {
        ...createNewCard(past),
        due: futureDue,
        reps: 1,
        last_review: past
      },
      isNew: false,
      isDue: false
    };

    // On May 2: not due yet
    const may2 = new Date('2026-05-02T12:00:00Z');
    const sessionMay2 = buildReviewQueue([card], 10, 50, may2);
    expect(sessionMay2.queue.length).toBe(0);

    // On May 4: now due for review!
    const sessionMay4 = buildReviewQueue([card], 10, 50, laterTime);
    expect(sessionMay4.queue.length).toBe(1);
    expect(sessionMay4.queue[0]?.word?.surface).toBe('word_due_later');
  });

  it('reconstructs card FSRS state from reviewLogs sequence', () => {
    const freshCard: StudyCard = {
      id: 'c_word_w1',
      type: 'word',
      refId: 'w1',
      word: { ...dummyWord, id: 'w1', surface: '預かる' },
      fsrsCard: createNewCard(),
      isNew: true,
      isDue: false
    };

    const reviewDate1 = new Date('2026-05-01T10:00:00Z');
    const reviewDate2 = new Date('2026-05-02T10:00:00Z');

    const logs = [
      {
        cardId: 'c_word_w1',
        rating: 3, // Good
        reviewedAt: reviewDate1
      },
      {
        cardId: 'c_word_w1',
        rating: 3, // Good
        reviewedAt: reviewDate2
      }
    ];

    const [updated] = applyReviewLogsToCards([freshCard], logs, new Date('2026-05-02T12:00:00Z'));
    expect(updated).toBeDefined();
    expect(updated!.isNew).toBe(false);
    expect(updated!.fsrsCard.reps).toBe(2);
    expect(updated!.fsrsCard.last_review?.toISOString()).toBe(reviewDate2.toISOString());
    // After 2 Good ratings, due date is in the future (> May 2)
    expect(updated!.fsrsCard.due.getTime()).toBeGreaterThan(reviewDate2.getTime());
  });
});

describe('countNewItemsLearnedToday', () => {
  const now = new Date();
  const todayStr = getTodayDateString(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const makeCard = (
    id: string,
    overrides: Partial<StudyCard> = {}
  ): StudyCard => ({
    id,
    type: 'word',
    refId: `ref_${id}`,
    word: {
      id: `w_${id}`,
      surface: id,
      readings: [id],
      meaningVi: id,
      kanji: [],
      hanVietBreakdown: [],
      exampleIds: [],
      tags: []
    },
    fsrsCard: {
      ...createNewCard(now),
      reps: 1,
      last_review: now
    },
    isNew: false,
    isDue: false,
    firstLearnedAt: now.toISOString(),
    ...overrides
  });

  it('counts only items introduced today, once per unique word', () => {
    const cards: StudyCard[] = [
      makeCard('c1'),
      // Same word in another deck/card must not be counted twice
      makeCard('c1_copy', {
        word: {
          id: 'w_c1',
          surface: 'c1',
          readings: ['c1'],
          meaningVi: 'c1',
          kanji: [],
          hanVietBreakdown: [],
          exampleIds: [],
          tags: []
        }
      }),
      // Introduced yesterday
      makeCard('c2', { firstLearnedAt: yesterday.toISOString() }),
      // Legacy card without firstLearnedAt but first review today
      makeCard('c3', { firstLearnedAt: undefined }),
      // Grammar item uses refId as its key
      makeCard('c4', {
        type: 'grammar',
        refId: 'g1',
        word: undefined,
        firstLearnedAt: now.toISOString()
      }),
      // Reviewed today but not new today
      makeCard('c5', { firstLearnedAt: yesterday.toISOString(), fsrsCard: { ...createNewCard(now), reps: 4, last_review: now } })
    ];

    expect(countNewItemsLearnedToday(cards, todayStr)).toBe(3); // c1, c3, g1
  });

  it('returns 0 when nothing new was learned today', () => {
    const cards = [makeCard('c1', { firstLearnedAt: yesterday.toISOString() })];
    expect(countNewItemsLearnedToday(cards, todayStr)).toBe(0);
  });
});

