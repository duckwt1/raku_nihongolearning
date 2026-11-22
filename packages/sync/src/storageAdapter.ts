export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Generates namespaced local keys matching apps/web's profile convention.
 */
export function getUserStorageKey(baseKey: string, userId?: string | null): string {
  const ns = userId && userId !== 'local_device' && userId !== 'guest' ? `user_${userId}` : 'guest';
  return `raku_${baseKey}_${ns}`;
}

/**
 * In-memory storage adapter useful for unit tests and SSR fallbacks.
 */
export function createMemoryStorage(initial?: Record<string, string>): AsyncKeyValueStorage {
  const store = new Map<string, string>(initial ? Object.entries(initial) : undefined);
  return {
    async getItem(key: string) {
      return store.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      store.set(key, value);
    },
    async removeItem(key: string) {
      store.delete(key);
    }
  };
}
