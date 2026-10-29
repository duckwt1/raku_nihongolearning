import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import {
  GrammarLevelSchema,
  GrammarSchema,
  JlptLevelSchema,
  type Grammar,
  type GrammarLevel,
  type JlptLevel
} from '@raku/core';
import { db } from './firebase';
import { sanitizeFirestoreData } from './firestoreSync';

const LEVELS_CACHE_KEY = 'raku_grammar_levels_cache_v1';
const POINTS_CACHE_PREFIX = 'raku_grammar_points_cache_v1_';

export const JLPT_LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

export function isJlptLevel(value: string): value is JlptLevel {
  return JlptLevelSchema.safeParse(value).success;
}

export async function isGrammarAdmin(uid?: string | null): Promise<boolean> {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch {
    return false;
  }
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Bỏ qua quota
  }
}

export function loadCachedGrammarLevels(): GrammarLevel[] {
  const raw = readJson<unknown[]>(LEVELS_CACHE_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = GrammarLevelSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function loadCachedGrammarPoints(level: JlptLevel): Grammar[] {
  const raw = readJson<unknown[]>(`${POINTS_CACHE_PREFIX}${level}`);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = GrammarSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function fetchGrammarLevels(): Promise<GrammarLevel[]> {
  try {
    const snap = await getDocs(collection(db, 'grammarLevels'));
    const levels: GrammarLevel[] = [];
    snap.forEach((item) => {
      const parsed = GrammarLevelSchema.safeParse({ ...item.data(), level: item.id });
      if (parsed.success) levels.push(parsed.data);
    });
    const ordered = JLPT_LEVELS.map(
      (level) =>
        levels.find((item) => item.level === level) || {
          level,
          name: `JLPT ${level}`,
          pointCount: 0,
          contentVersion: 1
        }
    );
    writeJson(LEVELS_CACHE_KEY, ordered);
    return ordered;
  } catch (err) {
    console.warn('Không thể tải grammar levels từ Firestore:', err);
    const cached = loadCachedGrammarLevels();
    return cached.length > 0
      ? cached
      : JLPT_LEVELS.map((level) => ({
          level,
          name: `JLPT ${level}`,
          pointCount: 0,
          contentVersion: 1
        }));
  }
}

export async function fetchGrammarPoints(level: JlptLevel): Promise<Grammar[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'grammarPoints'), where('jlpt', '==', level))
    );
    const points: Grammar[] = [];
    snap.forEach((item) => {
      const parsed = GrammarSchema.safeParse({ ...item.data(), id: item.id });
      if (parsed.success) points.push(parsed.data);
    });
    points.sort(
      (a, b) =>
        (a.lesson ?? 999) - (b.lesson ?? 999) ||
        (a.order ?? 999) - (b.order ?? 999) ||
        a.pattern.localeCompare(b.pattern)
    );
    writeJson(`${POINTS_CACHE_PREFIX}${level}`, points);
    return points;
  } catch (err) {
    console.warn(`Không thể tải grammar ${level} từ Firestore:`, err);
    return loadCachedGrammarPoints(level);
  }
}

export interface GrammarImportResult {
  level: JlptLevel;
  imported: number;
  deleted: number;
}

async function deleteAllMatching(
  collectionName: string,
  predicate?: (data: Record<string, unknown>) => boolean
): Promise<number> {
  const snap = await getDocs(collection(db, collectionName));
  const targets = snap.docs.filter((item) =>
    predicate ? predicate(item.data() as Record<string, unknown>) : true
  );

  let deleted = 0;
  for (let i = 0; i < targets.length; i += 400) {
    const batch = writeBatch(db);
    for (const target of targets.slice(i, i + 400)) {
      batch.delete(target.ref);
    }
    await batch.commit();
    deleted += Math.min(400, targets.length - i);
  }
  return deleted;
}

export async function importGrammarPoints(
  points: Grammar[],
  options: { mode: 'replace' | 'merge' }
): Promise<GrammarImportResult> {
  if (points.length === 0) {
    throw new Error('Không có grammar point nào để import.');
  }
  const level = points[0]!.jlpt;
  if (!points.every((point) => point.jlpt === level)) {
    throw new Error('Tất cả grammar point trong một lần import phải cùng JLPT level.');
  }

  let deleted = 0;
  if (options.mode === 'replace') {
    deleted = await deleteAllMatching(
      'grammarPoints',
      (data) => data.jlpt === level
    );
  }

  for (let i = 0; i < points.length; i += 400) {
    const batch = writeBatch(db);
    for (const point of points.slice(i, i + 400)) {
      batch.set(
        doc(db, 'grammarPoints', point.id),
        sanitizeFirestoreData({ ...point, updatedAt: point.updatedAt || new Date().toISOString() }),
        { merge: true }
      );
    }
    await batch.commit();
  }

  const latest = await getDocs(
    query(collection(db, 'grammarPoints'), where('jlpt', '==', level))
  );

  await setDoc(
    doc(db, 'grammarLevels', level),
    sanitizeFirestoreData({
      level,
      name: `JLPT ${level}`,
      pointCount: latest.size,
      contentVersion: Date.now(),
      updatedAt: new Date().toISOString()
    }),
    { merge: true }
  );

  writeJson(`${POINTS_CACHE_PREFIX}${level}`, points);
  return { level, imported: points.length, deleted };
}

export async function purgeGrammarData(): Promise<{
  grammarPoints: number;
  grammarLevels: number;
  legacyGrammar: number;
  legacyExercises: number;
}> {
  const legacyGrammar = await deleteAllMatching('grammar');
  const legacyExercises = await deleteAllMatching('grammarExercises');
  const grammarPoints = await deleteAllMatching('grammarPoints');
  const grammarLevels = await deleteAllMatching('grammarLevels');
  return { grammarPoints, grammarLevels, legacyGrammar, legacyExercises };
}

export function clearGrammarCache(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LEVELS_CACHE_KEY);
    for (const level of JLPT_LEVELS) {
      localStorage.removeItem(`${POINTS_CACHE_PREFIX}${level}`);
    }
  } catch {
    // ignore
  }
}

export async function deleteGrammarPoint(grammarId: string): Promise<void> {
  await deleteDoc(doc(db, 'grammarPoints', grammarId));
}

export function grammarToCsvRow(point: Grammar): Record<string, string> {
  return {
    id: point.id,
    jlpt: point.jlpt,
    lesson: point.lesson?.toString() || '',
    order: point.order?.toString() || '',
    pattern: point.pattern,
    title: point.title,
    meaning_vi: point.meaningVi.join('|'),
    explanation_vi: point.explanationVi,
    nuance_vi: point.nuanceVi || '',
    notes: point.notes.join('|'),
    tags: point.tags.join('|'),
    updated_at: point.updatedAt || ''
  };
}
