import type { JlptLevel } from '@raku/core';
import { getUserStorageKey } from './userStorage';

const STATS_BASE_KEY = 'grammar_practice_stats';
const MAX_SESSIONS = 50;

export interface GrammarExerciseStat {
  exerciseId: string;
  grammarId: string;
  jlpt: JlptLevel;
  attempts: number;
  correct: number;
  lastCorrect: boolean;
  lastPracticedAt: string;
}

export interface GrammarPracticeSession {
  id: string;
  startedAt: string;
  completedAt: string;
  level: JlptLevel;
  grammarIds: string[];
  exerciseIds: string[];
  total: number;
  correct: number;
}

export interface GrammarPracticeStore {
  stats: Record<string, GrammarExerciseStat>;
  sessions: GrammarPracticeSession[];
}

const EMPTY_STORE: GrammarPracticeStore = { stats: {}, sessions: [] };

export function loadGrammarPracticeStore(uid?: string | null): GrammarPracticeStore {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return EMPTY_STORE;
  try {
    const raw = localStorage.getItem(getUserStorageKey(STATS_BASE_KEY, uid));
    if (!raw) return EMPTY_STORE;
    const parsed = JSON.parse(raw) as Partial<GrammarPracticeStore>;
    return {
      stats: parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {},
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
    };
  } catch {
    return EMPTY_STORE;
  }
}

function saveGrammarPracticeStore(uid: string | null | undefined, store: GrammarPracticeStore): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      getUserStorageKey(STATS_BASE_KEY, uid),
      JSON.stringify({
        stats: store.stats,
        sessions: store.sessions.slice(0, MAX_SESSIONS)
      })
    );
  } catch {
    // ignore quota
  }
}

export function recordGrammarPracticeSession(
  uid: string | null | undefined,
  session: GrammarPracticeSession,
  results: Array<{
    exerciseId: string;
    grammarId: string;
    jlpt: JlptLevel;
    correct: boolean;
  }>
): GrammarPracticeStore {
  const store = loadGrammarPracticeStore(uid);
  const stats = { ...store.stats };

  for (const result of results) {
    const previous = stats[result.exerciseId];
    stats[result.exerciseId] = {
      exerciseId: result.exerciseId,
      grammarId: result.grammarId,
      jlpt: result.jlpt,
      attempts: (previous?.attempts || 0) + 1,
      correct: (previous?.correct || 0) + (result.correct ? 1 : 0),
      lastCorrect: result.correct,
      lastPracticedAt: session.completedAt
    };
  }

  const next: GrammarPracticeStore = {
    stats,
    sessions: [session, ...store.sessions.filter((item) => item.id !== session.id)].slice(
      0,
      MAX_SESSIONS
    )
  };
  saveGrammarPracticeStore(uid, next);
  return next;
}

export function clearGrammarPracticeStore(uid?: string | null): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(getUserStorageKey(STATS_BASE_KEY, uid));
  } catch {
    // ignore
  }
}

export function exerciseAccuracy(stat?: GrammarExerciseStat): number {
  if (!stat || stat.attempts === 0) return 0;
  return Math.round((stat.correct / stat.attempts) * 100);
}
