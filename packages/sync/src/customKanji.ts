import { doc, getDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { KANJI_BY_CHAR, KanjiSchema, type Kanji } from '@raku/core';
import { sanitizeFirestoreData } from './firestoreClient.js';

/**
 * Stored in `/users/{uid}/customWords/__custom_kanji__` (already allowed by firestore.rules
 * `match /customWords/{wordId} { allow read, write: if isOwner(uid); }`) so all AI/user
 * enriched Kanji sync in 1 single document with zero extra rules deploy.
 */
export const CUSTOM_KANJI_DOC_ID = '__custom_kanji__';
export const MAX_CUSTOM_KANJI_ENTRIES = 2000;

export function computeCustomKanjiHash(list: Kanji[]): string {
  const sorted = [...list]
    .filter((k) => Boolean(k?.char) && !KANJI_BY_CHAR.has(k.char))
    .sort((a, b) => a.char.localeCompare(b.char));
  if (sorted.length === 0) return '';
  const value = JSON.stringify(sorted);
  let hashA = 2166136261;
  let hashB = 5381;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    hashA = Math.imul(hashA ^ code, 16777619);
    hashB = Math.imul(hashB, 33) ^ code;
  }
  return `${(hashA >>> 0).toString(36)}-${(hashB >>> 0).toString(36)}`;
}

export function mergeCustomKanjiLists(
  local: Kanji[],
  incoming: Kanji[]
): {
  list: Kanji[];
  addedCount: number;
  hasChanges: boolean;
} {
  const byChar = new Map<string, Kanji>();
  for (const item of local) {
    if (!item?.char || KANJI_BY_CHAR.has(item.char)) continue;
    byChar.set(item.char, item);
  }

  let addedCount = 0;
  let hasChanges = false;
  for (const item of incoming) {
    if (!item?.char || KANJI_BY_CHAR.has(item.char)) continue;
    const check = KanjiSchema.safeParse(item);
    if (!check.success) continue;
    const existing = byChar.get(check.data.char);
    if (!existing) {
      byChar.set(check.data.char, check.data);
      addedCount++;
      hasChanges = true;
    } else if (
      existing.meaningVi !== check.data.meaningVi ||
      JSON.stringify(existing.hanViet) !== JSON.stringify(check.data.hanViet)
    ) {
      byChar.set(check.data.char, { ...existing, ...check.data });
      hasChanges = true;
    }
  }

  const list = Array.from(byChar.values())
    .sort((a, b) => a.char.localeCompare(b.char))
    .slice(0, MAX_CUSTOM_KANJI_ENTRIES);

  return { list, addedCount, hasChanges };
}

export async function syncCustomKanjiBundleWithDb(
  db: Firestore,
  userId: string,
  customKanji: Kanji[],
  lastSyncedHash = ''
): Promise<{ synced: boolean; hash: string }> {
  const clean = customKanji
    .filter((k) => Boolean(k?.char) && !KANJI_BY_CHAR.has(k.char))
    .sort((a, b) => a.char.localeCompare(b.char))
    .slice(0, MAX_CUSTOM_KANJI_ENTRIES);
  const nextHash = computeCustomKanjiHash(clean);
  if (!userId || userId === 'local_device' || !nextHash || nextHash === lastSyncedHash) {
    return { synced: false, hash: lastSyncedHash || nextHash };
  }

  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', userId, 'customWords', CUSTOM_KANJI_DOC_ID),
    sanitizeFirestoreData({
      id: CUSTOM_KANJI_DOC_ID,
      hash: nextHash,
      kanji: clean,
      updatedAt: new Date().toISOString()
    })
  );
  batch.set(
    doc(db, 'users', userId),
    { customKanjiHash: nextHash },
    { merge: true }
  );
  await batch.commit();
  return { synced: true, hash: nextHash };
}

export async function pullCustomKanjiBundleWithDb(
  db: Firestore,
  userId: string,
  localKanji: Kanji[],
  remoteHash?: string,
  localSyncedHash = ''
): Promise<{
  list: Kanji[];
  fetched: boolean;
  addedCount: number;
  hash: string;
}> {
  if (!userId || userId === 'local_device') {
    return { list: localKanji, fetched: false, addedCount: 0, hash: localSyncedHash };
  }

  // Zero-read skip when remote hash matches local synced hash and local cache is populated
  if (remoteHash && remoteHash === localSyncedHash && localKanji.length > 0) {
    return { list: localKanji, fetched: false, addedCount: 0, hash: localSyncedHash };
  }
  // If profile has no customKanjiHash at all and we already checked once, skip read
  if (remoteHash === '' || (remoteHash === undefined && localKanji.length > 0 && localSyncedHash)) {
    return { list: localKanji, fetched: false, addedCount: 0, hash: localSyncedHash };
  }

  const snap = await getDoc(doc(db, 'users', userId, 'customWords', CUSTOM_KANJI_DOC_ID));
  if (!snap.exists()) {
    return { list: localKanji, fetched: false, addedCount: 0, hash: localSyncedHash };
  }

  const data = snap.data() as { hash?: unknown; kanji?: unknown };
  const rawKanji = Array.isArray(data.kanji) ? (data.kanji as Kanji[]) : [];
  const merged = mergeCustomKanjiLists(localKanji, rawKanji);
  const resolvedHash =
    typeof data.hash === 'string' && data.hash
      ? data.hash
      : computeCustomKanjiHash(merged.list);

  return {
    list: merged.list,
    fetched: true,
    addedCount: merged.addedCount,
    hash: resolvedHash
  };
}
