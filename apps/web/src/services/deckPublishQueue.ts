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

  schedule(key: string, job: DeckPublishJob, delayMs = DECK_PUBLISH_DEBOUNCE_MS): void {
    this.cancel(key);
    this.jobs.set(key, job);

    const timer = setTimeout(() => {
      this.timers.delete(key);
      const pending = this.jobs.get(key);
      this.jobs.delete(key);
      if (pending) this.run(pending);
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
  }

  cancelAll(): void {
    for (const key of Array.from(this.timers.keys())) {
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
    if (pending) this.run(pending);
  }

  flushAll(): void {
    for (const key of Array.from(this.jobs.keys())) {
      this.flush(key);
    }
  }

  has(key: string): boolean {
    return this.jobs.has(key);
  }

  get pendingCount(): number {
    return this.jobs.size;
  }

  private run(job: DeckPublishJob): void {
    try {
      const result = job();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        void (result as Promise<void>).catch(() => {
          // Lỗi đã được job tự log/toast; tránh unhandled rejection
        });
      }
    } catch {
      // Job tự xử lý lỗi; không để lỗi đồng bộ làm sập timer
    }
  }
}

export const deckPublishQueue = new DeckPublishQueue();
