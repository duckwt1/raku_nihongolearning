import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOLDERS,
  DEFAULT_DECKS,
  buildDefaultCards,
  calculateDeckCounts,
  calculateFolderCounts,
  createInitialStudyStats,
  recordStudyActivity
} from './deckManager.js';

describe('Deck and Folder Manager', () => {
  it('has default folders and decks set up correctly', () => {
    expect(DEFAULT_FOLDERS.length).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_DECKS.length).toBeGreaterThanOrEqual(3);

    const n3Folder = DEFAULT_FOLDERS.find((f) => f.id === 'folder_jlpt_n3');
    expect(n3Folder).toBeDefined();

    const n3Decks = DEFAULT_DECKS.filter((d) => d.folderId === 'folder_jlpt_n3');
    expect(n3Decks.length).toBe(2); // Words, Grammar
  });

  it('builds default cards for words and grammar', () => {
    const cards = buildDefaultCards();
    expect(cards.length).toBe(880 + 97); // 880 words + 97 grammar

    const wordCards = cards.filter((c) => c.deckId === 'deck_n3_words');
    const grammarCards = cards.filter((c) => c.deckId === 'deck_n3_grammar');

    expect(wordCards.length).toBe(880);
    expect(grammarCards.length).toBe(97);
  });

  it('calculates Anki-style deck counts (New, Learn, Due)', () => {
    const cards = buildDefaultCards();
    // Raw count without limit:
    const rawCounts = calculateDeckCounts(cards, 'deck_n3_words');
    expect(rawCounts.totalCards).toBe(880);
    expect(rawCounts.newCount).toBe(880);
    expect(rawCounts.dueCount).toBe(0);

    // With daily limits (20 new, 50 reviews):
    const limitedCounts = calculateDeckCounts(cards, 'deck_n3_words', {
      newCardsPerDay: 20,
      maxReviewsPerDay: 50
    });
    expect(limitedCounts.newCount).toBe(20);
    expect(limitedCounts.dueCount).toBe(0);
  });

  it('calculates aggregated folder counts', () => {
    const cards = buildDefaultCards();
    const folderCounts = calculateFolderCounts(cards, DEFAULT_DECKS, 'folder_jlpt_n3');

    expect(folderCounts.totalCards).toBe(880 + 97);
    expect(folderCounts.newCount).toBe(880 + 97);
  });

  it('records study activity and tracks daily time and reviewed count', () => {
    let stats = createInitialStudyStats();
    expect(stats.todayStats.studySeconds).toBe(0);
    expect(stats.todayStats.reviewedCount).toBe(0);

    // Spend 30 seconds studying
    stats = recordStudyActivity(stats, 30);
    expect(stats.todayStats.studySeconds).toBe(30);
    expect(stats.todayStats.reviewedCount).toBe(0);

    // Review a card with Good rating (3)
    stats = recordStudyActivity(stats, 5, 3);
    expect(stats.todayStats.studySeconds).toBe(35);
    expect(stats.todayStats.reviewedCount).toBe(1);
    expect(stats.todayStats.correctCount).toBe(1);
    expect(stats.streakDays).toBe(1);

    // Review a card with Again rating (1)
    stats = recordStudyActivity(stats, 4, 1);
    expect(stats.todayStats.reviewedCount).toBe(2);
    expect(stats.todayStats.againCount).toBe(1);
  });
});
