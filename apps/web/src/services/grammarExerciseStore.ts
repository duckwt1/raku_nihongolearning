import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where
} from 'firebase/firestore';
import {
  GrammarExerciseRecordSchema,
  type GrammarExerciseRecord,
  type Question
} from '@raku/core';
import { db } from './firebase';
import { sanitizeFirestoreData } from './firestoreSync';
import { getUserStorageKey } from './userStorage';

const GRAMMAR_EXERCISES_BASE_KEY = 'grammar_exercises';

export type GrammarExerciseDraft = Omit<
  GrammarExerciseRecord,
  'id' | 'createdAt' | 'updatedAt' | 'ownerUid' | 'authorName'
> & {
  id?: string;
  ownerUid?: string;
  authorName?: string;
};

export function createGrammarExerciseId(uid?: string | null): string {
  return `gx_${uid || 'guest'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function parseGrammarExerciseRecords(raw: unknown[]): GrammarExerciseRecord[] {
  const records: GrammarExerciseRecord[] = [];
  for (const item of raw) {
    const parsed = GrammarExerciseRecordSchema.safeParse(item);
    if (parsed.success) records.push(parsed.data);
  }
  return records;
}

export function loadLocalGrammarExercises(uid?: string | null): GrammarExerciseRecord[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getUserStorageKey(GRAMMAR_EXERCISES_BASE_KEY, uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parseGrammarExerciseRecords(parsed);
  } catch {
    return [];
  }
}

export function saveLocalGrammarExercises(
  uid: string | null | undefined,
  exercises: GrammarExerciseRecord[]
): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      getUserStorageKey(GRAMMAR_EXERCISES_BASE_KEY, uid),
      JSON.stringify(exercises)
    );
  } catch {
    // Bỏ qua lỗi quota/localStorage
  }
}

/**
 * Tải toàn bộ bài tập đã công khai. Quy mô app cá nhân nên tải một lần
 * và lọc theo grammar point ở client; Firestore vẫn cache offline.
 */
export async function fetchPublicGrammarExercises(): Promise<GrammarExerciseRecord[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'grammarExercises'), where('visibility', '==', 'public'))
    );
    const records: GrammarExerciseRecord[] = [];
    snap.forEach((item) => {
      const parsed = GrammarExerciseRecordSchema.safeParse({
        ...item.data(),
        id: (item.data() as { id?: string }).id || item.id
      });
      if (parsed.success) records.push(parsed.data);
    });
    return records;
  } catch (err) {
    console.warn('Không thể tải bài tập ngữ pháp cộng đồng:', err);
    return [];
  }
}

export async function publishGrammarExercise(
  exercise: GrammarExerciseRecord
): Promise<void> {
  await setDoc(
    doc(db, 'grammarExercises', exercise.id),
    sanitizeFirestoreData({ ...exercise, visibility: 'public' }),
    { merge: true }
  );
}

export async function unpublishGrammarExercise(exerciseId: string): Promise<void> {
  await deleteDoc(doc(db, 'grammarExercises', exerciseId));
}

export async function deleteGrammarExerciseFromCloud(exerciseId: string): Promise<void> {
  await deleteDoc(doc(db, 'grammarExercises', exerciseId));
}

export function mergeGrammarExercises(
  local: GrammarExerciseRecord[],
  remote: GrammarExerciseRecord[]
): GrammarExerciseRecord[] {
  const map = new Map<string, GrammarExerciseRecord>();
  for (const exercise of remote) map.set(exercise.id, exercise);
  // Bản local (kể cả bản public của chính mình) được ưu tiên vì mới hơn.
  for (const exercise of local) map.set(exercise.id, exercise);
  return Array.from(map.values());
}

export function buildGrammarExerciseRecord(args: {
  draft: GrammarExerciseDraft;
  ownerUid: string;
  authorName?: string;
  existing?: GrammarExerciseRecord;
}): GrammarExerciseRecord {
  const now = new Date().toISOString();
  const record: GrammarExerciseRecord = {
    ...(args.existing ?? {}),
    ...args.draft,
    id: args.existing?.id || args.draft.id || createGrammarExerciseId(args.ownerUid),
    ownerUid: args.ownerUid,
    authorName: args.authorName || args.existing?.authorName,
    createdAt: args.existing?.createdAt || now,
    updatedAt: now
  };

  return GrammarExerciseRecordSchema.parse(record);
}

export function toQuestion(record: GrammarExerciseRecord): Question {
  const {
    ownerUid: _ownerUid,
    authorName: _authorName,
    visibility: _visibility,
    copyOf: _copyOf,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...question
  } = record;
  return question;
}
