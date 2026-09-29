import { describe, expect, it } from 'vitest';
import { buildReviewQueue, type StudyCard } from './studySession.js';
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
    expect(session.queue[0]?.word.surface).toBe('due_1');
    expect(session.queue[1]?.word.surface).toBe('new_1');
  });
});
