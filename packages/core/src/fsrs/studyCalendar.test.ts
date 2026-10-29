import { describe, expect, it } from 'vitest';
import type { StudyCard } from './studySession.js';
import { createNewCard } from './scheduler.js';
import {
  buildHeatmapWeeks,
  calculateStudyStreaks,
  getDailyNewWordCounts
} from './studyCalendar.js';

function dateAt(day: number, hour = 12): Date {
  return new Date(2026, 9, day, hour, 0, 0); // Oct 2026 local time
}

function makeWordCard(
  id: string,
  wordId: string,
  learnedAt?: Date,
  overrides: Partial<StudyCard> = {}
): StudyCard {
  return {
    id,
    type: 'word',
    refId: wordId,
    word: {
      id: wordId,
      surface: id,
      readings: [id],
      meaningVi: id,
      kanji: [],
      hanVietBreakdown: [],
      exampleIds: [],
      tags: []
    },
    fsrsCard: {
      ...createNewCard(),
      reps: 1,
      last_review: learnedAt
    },
    isNew: false,
    isDue: false,
    firstLearnedAt: learnedAt?.toISOString(),
    ...overrides
  };
}

describe('study calendar', () => {
  it('counts unique new words per day and dedupes word ids', () => {
    const counts = getDailyNewWordCounts([
      makeWordCard('c1', 'w1', dateAt(1)),
      makeWordCard('c2', 'w1', dateAt(1)),
      makeWordCard('c3', 'w2', dateAt(1)),
      makeWordCard('c4', 'w3', dateAt(2))
    ]);

    expect(counts.get('2026-10-01')).toBe(2);
    expect(counts.get('2026-10-02')).toBe(1);
  });

  it('falls back to last_review when firstLearnedAt is missing', () => {
    const card = makeWordCard('c1', 'w1', dateAt(3));
    delete card.firstLearnedAt;
    const counts = getDailyNewWordCounts([card]);
    expect(counts.get('2026-10-03')).toBe(1);
  });

  it('counts a duplicated word only on its earliest learned date', () => {
    const counts = getDailyNewWordCounts([
      makeWordCard('c1', 'w1', dateAt(5)),
      makeWordCard('c2', 'w1', dateAt(2))
    ]);

    expect(counts.get('2026-10-02')).toBe(1);
    expect(counts.get('2026-10-05')).toBeUndefined();
  });

  it('calculates streak only on days reaching the goal', () => {
    const counts = new Map([
      ['2026-10-01', 2],
      ['2026-10-02', 1],
      ['2026-10-03', 2],
      ['2026-10-04', 2]
    ]);

    const result = calculateStudyStreaks(counts, '2026-10-04', 2);
    expect(result.currentStreak).toBe(2); // Oct 4 + Oct 3
    expect(result.longestStreak).toBe(2);
    expect(result.completedToday).toBe(true);
    expect(result.todayCount).toBe(2);
    expect(result.totalActiveDays).toBe(3);
  });

  it('keeps the streak through yesterday when today is not complete', () => {
    const counts = new Map([
      ['2026-10-02', 2],
      ['2026-10-03', 2],
      ['2026-10-04', 1]
    ]);

    const result = calculateStudyStreaks(counts, '2026-10-04', 2);
    expect(result.currentStreak).toBe(2);
    expect(result.completedToday).toBe(false);
  });

  it('throws away the streak after a missed day', () => {
    const counts = new Map([
      ['2026-10-01', 2],
      ['2026-10-03', 2]
    ]);
    const result = calculateStudyStreaks(counts, '2026-10-04', 2);
    expect(result.currentStreak).toBe(1); // Oct 3 only
  });

  it('builds a 53x7 heatmap ending at the current week', () => {
    const counts = new Map([
      ['2026-09-30', 2],
      ['2026-10-01', 1]
    ]);
    const weeks = buildHeatmapWeeks(counts, '2026-10-01', 2, 53);
    expect(weeks).toHaveLength(53);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().some((cell) => cell.date === '2026-09-30' && cell.completed)).toBe(true);
    expect(weeks.flat().find((cell) => cell.date === '2026-10-01')?.count).toBe(1);
    expect(weeks.flat().some((cell) => cell.future)).toBe(true);
  });
});
