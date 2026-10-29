import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import {
  GrammarExerciseSchema,
  validateGrammarExercise,
  type GrammarExercise
} from '@raku/core';
import { db } from './firebase';
import { sanitizeFirestoreData } from './firestoreSync';

const CACHE_KEY = 'raku_grammar_exercises_cache_v1';

export function createGrammarExerciseId(): string {
  return `gex_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function parseGrammarExercises(raw: unknown[]): GrammarExercise[] {
  return raw.flatMap((item) => {
    const parsed = GrammarExerciseSchema.safeParse(item);
    if (!parsed.success) return [];
    return validateGrammarExercise(parsed.data).valid ? [parsed.data] : [];
  });
}

export function loadCachedGrammarExercises(): GrammarExercise[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parseGrammarExercises(parsed) : [];
  } catch {
    return [];
  }
}

function cache(exercises: GrammarExercise[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(exercises));
  } catch {
    // ignore quota
  }
}

export async function fetchGrammarExercises(): Promise<GrammarExercise[]> {
  try {
    const snap = await getDocs(collection(db, 'grammarExercises'));
    const exercises: GrammarExercise[] = [];
    snap.forEach((item) => {
      const parsed = GrammarExerciseSchema.safeParse({
        ...item.data(),
        id: (item.data() as { id?: string }).id || item.id
      });
      if (parsed.success && validateGrammarExercise(parsed.data).valid) {
        exercises.push(parsed.data);
      }
    });
    exercises.sort(
      (a, b) =>
        a.jlpt.localeCompare(b.jlpt) ||
        a.grammarPattern.localeCompare(b.grammarPattern) ||
        (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    cache(exercises);
    return exercises;
  } catch (err) {
    console.warn('Không thể tải bài tập ngữ pháp:', err);
    return loadCachedGrammarExercises();
  }
}

export async function saveGrammarExercise(exercise: GrammarExercise): Promise<void> {
  await setDoc(
    doc(db, 'grammarExercises', exercise.id),
    sanitizeFirestoreData({ ...exercise, visibility: 'public' }),
    { merge: true }
  );
}

export async function deleteGrammarExercise(exerciseId: string): Promise<void> {
  await deleteDoc(doc(db, 'grammarExercises', exerciseId));
}

export function clearGrammarExerciseCache(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
