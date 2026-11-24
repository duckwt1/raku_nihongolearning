import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GrammarExerciseSchema,
  GrammarSchema,
  validateGrammarExercise,
  type Grammar,
  type GrammarExercise,
  type JlptLevel
} from '@raku/core';
import { isFirebaseConfigured, mobileSyncClient } from './firebase';

const POINTS_CACHE_PREFIX = 'raku_mobile_grammar_points_v1_';
const EXERCISES_CACHE_PREFIX = 'raku_mobile_grammar_exercises_v1_';

const memoryPoints = new Map<JlptLevel, Grammar[]>();
const memoryPointsById = new Map<string, Grammar>();
const memoryExercises = new Map<JlptLevel, GrammarExercise[]>();

function indexPoints(level: JlptLevel, list: Grammar[]): void {
  memoryPoints.set(level, list);
  for (const item of list) {
    memoryPointsById.set(item.id, item);
  }
}

export async function loadCachedGrammarPoints(level: JlptLevel): Promise<Grammar[]> {
  const inMem = memoryPoints.get(level);
  if (inMem) return inMem;

  try {
    const raw = await AsyncStorage.getItem(`${POINTS_CACHE_PREFIX}${level}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid: Grammar[] = [];
    for (const item of parsed) {
      const res = GrammarSchema.safeParse(item);
      if (res.success) valid.push(res.data);
    }
    indexPoints(level, valid);
    return valid;
  } catch {
    return [];
  }
}

export async function fetchAndCacheGrammarPoints(level: JlptLevel): Promise<Grammar[]> {
  if (!isFirebaseConfigured) {
    return loadCachedGrammarPoints(level);
  }
  const list = await mobileSyncClient.fetchGrammarPoints(level);
  indexPoints(level, list);
  AsyncStorage.setItem(`${POINTS_CACHE_PREFIX}${level}`, JSON.stringify(list)).catch(() => {});
  return list;
}

export async function getGrammarPointById(
  id: string,
  level?: JlptLevel
): Promise<Grammar | null> {
  const fromMem = memoryPointsById.get(id);
  if (fromMem) return fromMem;

  if (level) {
    const cached = await loadCachedGrammarPoints(level);
    const match = cached.find((g) => g.id === id);
    if (match) return match;

    if (isFirebaseConfigured) {
      try {
        const remote = await fetchAndCacheGrammarPoints(level);
        return remote.find((g) => g.id === id) ?? null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function loadCachedGrammarExercises(level: JlptLevel): Promise<GrammarExercise[]> {
  const inMem = memoryExercises.get(level);
  if (inMem) return inMem;

  try {
    const raw = await AsyncStorage.getItem(`${EXERCISES_CACHE_PREFIX}${level}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid: GrammarExercise[] = [];
    for (const item of parsed) {
      const res = GrammarExerciseSchema.safeParse(item);
      if (res.success && validateGrammarExercise(res.data).valid) {
        valid.push(res.data);
      }
    }
    memoryExercises.set(level, valid);
    return valid;
  } catch {
    return [];
  }
}

export async function fetchAndCacheGrammarExercises(
  level: JlptLevel,
  grammarId?: string
): Promise<GrammarExercise[]> {
  if (!isFirebaseConfigured) {
    const cached = await loadCachedGrammarExercises(level);
    return grammarId ? cached.filter((ex) => ex.grammarId === grammarId) : cached;
  }

  const rawList = await mobileSyncClient.fetchGrammarExercises(level, grammarId);
  const valid = rawList.filter((ex) => validateGrammarExercise(ex).valid);

  if (!grammarId) {
    memoryExercises.set(level, valid);
    AsyncStorage.setItem(`${EXERCISES_CACHE_PREFIX}${level}`, JSON.stringify(valid)).catch(
      () => {}
    );
  }
  return valid;
}
