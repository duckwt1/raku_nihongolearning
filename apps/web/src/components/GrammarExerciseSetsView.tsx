import {
  BookOpenCheck,
  ChevronDown,
  ListChecks,
  Play,
  RefreshCw,
  Settings2,
  Sparkles
} from 'lucide-react';
import type {
  GrammarExercise,
  JlptLevel
} from '@raku/core';
import type {
  GrammarExerciseStat,
  GrammarPracticeSession
} from '../services/grammarPracticeStatsStore';

interface GrammarExerciseSetsViewProps {
  exercises: GrammarExercise[];
  stats: Record<string, GrammarExerciseStat>;
  sessions: GrammarPracticeSession[];
  isAdmin: boolean;
  isLoading: boolean;
  target?: {
    level: JlptLevel;
    pattern: string;
    exercises: GrammarExercise[];
  } | null;
  onStartLevel: (level: JlptLevel, count: number) => void;
  onStartTarget: (count: number) => void;
  onManage: () => void;
  onRefresh: () => void;
}

const LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

function levelSummary(
  exercises: GrammarExercise[],
  stats: Record<string, GrammarExerciseStat>,
  sessions: GrammarPracticeSession[]
) {
  const statList = exercises
    .map((exercise) => stats[exercise.id])
    .filter((stat): stat is GrammarExerciseStat => Boolean(stat));
  const attempts = statList.reduce((sum, stat) => sum + stat.attempts, 0);
  const correct = statList.reduce((sum, stat) => sum + stat.correct, 0);
  const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
  const grammarCount = new Set(exercises.map((exercise) => exercise.grammarId)).size;
  const level = exercises[0]?.jlpt;
  const lastSession = sessions.find((session) => session.level === level);
  return {
    attempts,
    correct,
    accuracy,
    grammarCount,
    attempted: statList.length,
    lastSession
  };
}

function StartButtons({
  count,
  onStart
}: {
  count: number;
  onStart: (count: number) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onStart(Math.min(10, count))}
        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        Bắt đầu {Math.min(10, count)} câu
      </button>
      {count > 10 && (
        <button
          type="button"
          onClick={() => onStart(Math.min(20, count))}
          className="rounded-xl border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
        >
          {Math.min(20, count)} câu
        </button>
      )}
      <button
        type="button"
        onClick={() => onStart(count)}
        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Tất cả
      </button>
    </div>
  );
}

export function GrammarExerciseSetsView({
  exercises,
  stats,
  sessions,
  isAdmin,
  isLoading,
  target,
  onStartLevel,
  onStartTarget,
  onManage,
  onRefresh
}: GrammarExerciseSetsViewProps) {
  const levels = LEVELS.filter((level) =>
    exercises.some((exercise) => exercise.jlpt === level)
  );
  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              <ListChecks className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span>Bộ bài tập ngữ pháp</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Chọn bộ theo JLPT, bấm bắt đầu để luyện ngẫu nhiên từng câu.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={onManage}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Quản lý bài tập
              </button>
            )}
          </div>
        </div>
      </div>

      {target && target.exercises.length > 0 && (
        <div className="rounded-3xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-900 dark:bg-violet-950/20 sm:p-6">
          <div className="flex items-center gap-2 text-xs font-bold text-violet-700 dark:text-violet-300">
            <Sparkles className="h-4 w-4" />
            Bài tập cho mẫu ngữ pháp
          </div>
          <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
            {target.pattern}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {target.exercises.length} bài tập · Level {target.level}
          </p>
          <StartButtons count={target.exercises.length} onStart={onStartTarget} />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white py-12 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Đang tải bài tập...
        </div>
      ) : exercises.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <BookOpenCheck className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            Chưa có bài tập ngữ pháp.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {isAdmin
              ? 'Bấm "Quản lý bài tập" để tạo hoặc import CSV.'
              : 'Admin sẽ bổ sung bài tập sau.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {levels.map((level) => {
              const levelExercises = exercises.filter((exercise) => exercise.jlpt === level);
              const summary = levelSummary(levelExercises, stats, sessions);
              return (
                <div
                  key={level}
                  className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        {level}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {summary.attempted}/{levelExercises.length} bài đã luyện
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">
                      Bộ bài tập ngữ pháp {level}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {levelExercises.length} bài · {summary.grammarCount} grammar point
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                        <p className="text-[10px] text-slate-400">Độ chính xác</p>
                        <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-100">
                          {summary.attempts > 0 ? `${summary.accuracy}%` : '—'}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                        <p className="text-[10px] text-slate-400">Lần gần nhất</p>
                        <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-100">
                          {summary.lastSession
                            ? `${summary.lastSession.correct}/${summary.lastSession.total}`
                            : 'Chưa luyện'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <StartButtons
                    count={levelExercises.length}
                    onStart={(count) => onStartLevel(level, count)}
                  />
                </div>
              );
            })}
          </div>

          {recentSessions.length > 0 && (
            <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <ChevronDown className="h-3.5 w-3.5" />
                  Lịch sử luyện gần đây
                </span>
                <span className="text-slate-400">{sessions.length} phiên</span>
              </summary>
              <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                  >
                    <span className="text-slate-500 dark:text-slate-400">
                      {session.level} · {new Date(session.completedAt).toLocaleString('vi-VN')}
                    </span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                      {session.correct}/{session.total}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
