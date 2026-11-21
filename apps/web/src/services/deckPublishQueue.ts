export type DeckPublishJob = () => void | Promise<void>;

/** Thời gian gom các thay đổi của cùng một deck trước khi ghi Firestore */
export const DECK_PUBLISH_DEBOUNCE_MS = 1500;

/**
 * Hàng đợi publish theo deck.
 * - Nhiều thay đổi liên tiếp trên cùng deck chỉ tạo 1 lần ghi.
 * - Job mới nhất cho mỗi deck được giữ lại.
 * - Có thể cancel (khi xoá/unpublish) hoặc flush ngay (khi import/toggle).
 */
export class DeckPublishQueue {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private jobs = new Map<string, DeckPublishJob>();
  private inFlight = new Map<string, Promise<void>>();
  private generations = new Map<string, number>();

  schedule(key: string, job: DeckPublishJob, delayMs = DECK_PUBLISH_DEBOUNCE_MS): void {
    this.cancel(key);
    this.jobs.set(key, job);
    const gen = this.bumpGeneration(key);

    const timer = setTimeout(() => {
      this.timers.delete(key);
      const pending = this.jobs.get(key);
      this.jobs.delete(key);
      if (pending) this.run(key, pending, gen);
    }, delayMs);

    this.timers.set(key, timer);
  }

  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    this.jobs.delete(key);
    this.bumpGeneration(key);
  }

  cancelAll(): void {
    for (const key of new Set([...this.timers.keys(), ...this.jobs.keys(), ...this.inFlight.keys()])) {
      this.cancel(key);
    }
    this.jobs.clear();
  }

  flush(key: string): void {
    const timer = this.timers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    const pending = this.jobs.get(key);
    this.jobs.delete(key);
    if (pending) {
      const gen = this.generations.get(key) ?? this.bumpGeneration(key);
      this.run(key, pending, gen);
    }
  }

  flushAll(): void {
    for (const key of Array.from(this.jobs.keys())) {
      this.flush(key);
    }
  }

  /**
   * Chạy tuần tự 1 thao tác ngay lập tức (publish/unpublish/delete) sau mọi request đang bay của cùng key
   * để tránh ghi đè ngược thứ tự hoặc làm sống lại deck vừa xoá.
   */
  enqueueExclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
    this.cancel(key);
    const previous = this.inFlight.get(key) ?? Promise.resolve();
    const resultPromise = previous.then(() => action());
    const tracked = resultPromise.then(
      () => undefined,
      () => undefined
    );
    this.inFlight.set(key, tracked);
    void tracked.finally(() => {
      if (this.inFlight.get(key) === tracked) {
        this.inFlight.delete(key);
      }
    });
    return resultPromise;
  }

  has(key: string): boolean {
    return this.jobs.has(key);
  }

  get pendingCount(): number {
    return this.jobs.size;
  }

  private bumpGeneration(key: string): number {
    const next = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, next);
    return next;
  }

  private run(key: string, job: DeckPublishJob, gen: number): void {
    const execute = (): void | Promise<void> => {
      if (this.generations.get(key) !== gen) return;
      try {
        const result = job();
        if (result && typeof (result as Promise<void>).catch === 'function') {
          return (result as Promise<void>).catch(() => {
            // Lỗi đã được job tự log/toast; tránh unhandled rejection
          });
        }
      } catch {
        // Job tự xử lý lỗi; không để lỗi đồng bộ làm sập timer
      }
    };

    const previous = this.inFlight.get(key);
    if (!previous) {
      const outcome = execute();
      if (outcome) {
        this.inFlight.set(key, outcome);
        void outcome.finally(() => {
          if (this.inFlight.get(key) === outcome) {
            this.inFlight.delete(key);
          }
        });
      }
      return;
    }

    const chained = previous.then(() => execute());
    this.inFlight.set(key, chained);
    void chained.finally(() => {
      if (this.inFlight.get(key) === chained) {
        this.inFlight.delete(key);
      }
    });
  }
}

export const deckPublishQueue = new DeckPublishQueue();
