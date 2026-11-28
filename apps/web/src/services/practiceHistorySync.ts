import type { ConversationSession, SentenceAttemptRecord } from '@raku/core';
import {
  createFirestoreSyncClient,
  createUserRepository,
  mergeConversationSessions,
  mergeSentenceHistory,
  type AsyncKeyValueStorage
} from '@raku/sync';
import { db } from './firebase';

const browserStorageAdapter: AsyncKeyValueStorage = {
  async getItem(key) {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore quota errors gracefully
    }
  },
  async removeItem(key) {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
};

const webRepository = createUserRepository(browserStorageAdapter);
const webSyncClient = createFirestoreSyncClient({ db, repository: webRepository });

export async function loadConversationSessions(userId?: string | null): Promise<ConversationSession[]> {
  return webRepository.loadConversationSessions(userId);
}

export async function persistConversationSession(
  userId: string | null | undefined,
  session: ConversationSession,
  existing: ConversationSession[]
): Promise<ConversationSession[]> {
  const next = mergeConversationSessions([session], existing);
  await webRepository.saveConversationSessions(userId, next);
  if (userId && userId !== 'local_device' && typeof navigator !== 'undefined' && navigator.onLine) {
    void webSyncClient.upsertConversationSessionToCloud(userId, session).catch((err) => {
      console.warn('Đồng bộ phiên hội thoại lên Firestore thất bại:', err);
    });
  }
  return next;
}

export async function removeConversationSession(
  userId: string | null | undefined,
  sessionId: string,
  existing: ConversationSession[]
): Promise<ConversationSession[]> {
  const next = existing.filter((s) => s.id !== sessionId);
  await webRepository.saveConversationSessions(userId, next);
  if (userId && userId !== 'local_device' && typeof navigator !== 'undefined' && navigator.onLine) {
    void webSyncClient.deleteConversationSessionFromCloud(userId, sessionId).catch((err) => {
      console.warn('Xoá phiên hội thoại trên Firestore thất bại:', err);
    });
  }
  return next;
}

export async function loadSentenceHistory(userId?: string | null): Promise<SentenceAttemptRecord[]> {
  return webRepository.loadSentenceHistory(userId);
}

export async function persistSentenceAttempt(
  userId: string | null | undefined,
  attempt: SentenceAttemptRecord,
  existing: SentenceAttemptRecord[]
): Promise<SentenceAttemptRecord[]> {
  const next = mergeSentenceHistory([attempt], existing);
  await webRepository.saveSentenceHistory(userId, next);
  if (userId && userId !== 'local_device' && typeof navigator !== 'undefined' && navigator.onLine) {
    void webSyncClient.upsertSentenceAttemptToCloud(userId, attempt).catch((err) => {
      console.warn('Đồng bộ lịch sử đặt câu lên Firestore thất bại:', err);
    });
  }
  return next;
}

export async function syncPracticeHistoryWithCloud(userId: string): Promise<{
  sessions: ConversationSession[];
  attempts: SentenceAttemptRecord[];
}> {
  const [localSessions, localAttempts] = await Promise.all([
    webRepository.loadConversationSessions(userId),
    webRepository.loadSentenceHistory(userId)
  ]);

  if (!userId || userId === 'local_device') {
    return { sessions: localSessions, attempts: localAttempts };
  }

  try {
    const [cloudSessions, cloudAttempts] = await Promise.all([
      webSyncClient.pullConversationSessionsFromCloud(userId),
      webSyncClient.pullSentenceHistoryFromCloud(userId)
    ]);

    const mergedSessions = mergeConversationSessions(localSessions, cloudSessions);
    const mergedAttempts = mergeSentenceHistory(localAttempts, cloudAttempts);

    await Promise.all([
      webRepository.saveConversationSessions(userId, mergedSessions),
      webRepository.saveSentenceHistory(userId, mergedAttempts)
    ]);

    // Push any newer local sessions/attempts missing or older on cloud
    const cloudSessionById = new Map(cloudSessions.map((s) => [s.id, s]));
    const cloudAttemptById = new Map(cloudAttempts.map((a) => [a.id, a]));
    const pushPromises: Array<Promise<void>> = [];

    for (const s of mergedSessions.slice(0, 10)) {
      const remote = cloudSessionById.get(s.id);
      if (!remote || s.updatedAt > remote.updatedAt) {
        pushPromises.push(webSyncClient.upsertConversationSessionToCloud(userId, s));
      }
    }
    for (const a of mergedAttempts.slice(0, 20)) {
      if (!cloudAttemptById.has(a.id)) {
        pushPromises.push(webSyncClient.upsertSentenceAttemptToCloud(userId, a));
      }
    }
    if (pushPromises.length > 0) {
      await Promise.allSettled(pushPromises);
    }

    return { sessions: mergedSessions, attempts: mergedAttempts };
  } catch (err) {
    console.warn('Đồng bộ lịch sử hội thoại & đặt câu với Firestore thất bại:', err);
    return { sessions: localSessions, attempts: localAttempts };
  }
}
