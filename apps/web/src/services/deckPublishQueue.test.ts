import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckPublishQueue } from './deckPublishQueue';

describe('DeckPublishQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('coalesces multiple changes for the same deck into one publish', () => {
    const queue = new DeckPublishQueue();
    const first = vi.fn();
    const second = vi.fn();

    queue.schedule('deck_1', first, 1000);
    vi.advanceTimersByTime(400);
    queue.schedule('deck_1', second, 1000);
    vi.advanceTimersByTime(400);

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(queue.pendingCount).toBe(1);

    vi.advanceTimersByTime(600);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(queue.pendingCount).toBe(0);
  });

  it('publishes independent decks separately', () => {
    const queue = new DeckPublishQueue();
    const deckOne = vi.fn();
    const deckTwo = vi.fn();

    queue.schedule('deck_1', deckOne, 1000);
    queue.schedule('deck_2', deckTwo, 1000);
    vi.advanceTimersByTime(1000);

    expect(deckOne).toHaveBeenCalledTimes(1);
    expect(deckTwo).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending publish (e.g. before deleting/unpublishing a deck)', () => {
    const queue = new DeckPublishQueue();
    const job = vi.fn();

    queue.schedule('deck_1', job, 1000);
    queue.cancel('deck_1');
    vi.advanceTimersByTime(1000);

    expect(job).not.toHaveBeenCalled();
    expect(queue.has('deck_1')).toBe(false);
  });

  it('flushes a pending publish immediately', () => {
    const queue = new DeckPublishQueue();
    const job = vi.fn();

    queue.schedule('deck_1', job, 1000);
    queue.flush('deck_1');

    expect(job).toHaveBeenCalledTimes(1);
    expect(queue.pendingCount).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('flushAll publishes every pending deck', () => {
    const queue = new DeckPublishQueue();
    const deckOne = vi.fn();
    const deckTwo = vi.fn();

    queue.schedule('deck_1', deckOne);
    queue.schedule('deck_2', deckTwo);
    queue.flushAll();

    expect(deckOne).toHaveBeenCalledTimes(1);
    expect(deckTwo).toHaveBeenCalledTimes(1);
  });

  it('swallows async job errors so timers keep working', () => {
    const queue = new DeckPublishQueue();
    const failing = vi.fn().mockRejectedValue(new Error('offline'));

    queue.schedule('deck_1', failing, 100);
    vi.advanceTimersByTime(100);
    expect(failing).toHaveBeenCalledTimes(1);

    const next = vi.fn();
    queue.schedule('deck_2', next, 100);
    vi.advanceTimersByTime(100);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
