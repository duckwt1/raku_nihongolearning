import { describe, expect, it } from 'vitest';
import {
  applyGrade,
  createNewCard,
  formatInterval,
  previewCardGrades,
  Rating
} from './scheduler.js';

describe('formatInterval', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('formats under 1 minute or past due as <1m', () => {
    expect(formatInterval(new Date(now.getTime() - 1000), now)).toBe('<1m');
    expect(formatInterval(new Date(now.getTime() + 30 * 1000), now)).toBe('<1m');
  });

  it('formats learning intervals (1m to 10m)', () => {
    expect(formatInterval(new Date(now.getTime() + 60 * 1000), now)).toBe('<1m');
    expect(formatInterval(new Date(now.getTime() + 5 * 60 * 1000), now)).toBe('5m');
    expect(formatInterval(new Date(now.getTime() + 10 * 60 * 1000), now)).toBe('10m');
  });

  it('formats days, weeks, months', () => {
    expect(formatInterval(new Date(now.getTime() + 24 * 60 * 60 * 1000), now)).toBe('1d');
    expect(formatInterval(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), now)).toBe('3d');
    expect(formatInterval(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), now)).toBe('2w');
    expect(formatInterval(new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), now)).toBe('3mo');
  });
});

describe('previewCardGrades & applyGrade', () => {
  it('generates 4 preview options for a brand new card', () => {
    const card = createNewCard();
    const now = new Date();
    const preview = previewCardGrades(card, now);

    expect(preview[Rating.Again]).toBeDefined();
    expect(preview[Rating.Hard]).toBeDefined();
    expect(preview[Rating.Good]).toBeDefined();
    expect(preview[Rating.Easy]).toBeDefined();

    expect(preview[Rating.Again].ratingLabel).toBe('Again');
    expect(preview[Rating.Good].ratingLabel).toBe('Good');
    expect(typeof preview[Rating.Good].intervalLabel).toBe('string');
  });

  it('applies a grade and advances card state', () => {
    const card = createNewCard();
    const now = new Date();
    const item = applyGrade(card, Rating.Good, now);

    expect(item.card).toBeDefined();
    expect(item.log).toBeDefined();
    expect(item.log.rating).toBe(Rating.Good);
    expect(item.card.reps).toBe(1);
  });
});
