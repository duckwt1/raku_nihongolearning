import { Clock, CheckCircle2, Flame, Layers, Sparkles } from 'lucide-react';
import type { UserStudyStats } from '@raku/core';

interface TodayStatsBarProps {
  stats: UserStudyStats;
  totalDueToday: number;
  totalNewToday: number;
  onQuickStudy?: () => void;
}

export function TodayStatsBar({
  stats,
  totalDueToday,
  totalNewToday,
  onQuickStudy
}: TodayStatsBarProps) {
  const { studySeconds, reviewedCount } = stats.todayStats;
  const minutes = Math.floor(studySeconds / 60);
  const seconds = studySeconds % 60;

  const formattedTime =
    minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds} giây`;

  return (
    <div className="bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-purple-500/10 dark:from-sky-950/40 dark:via-indigo-950/40 dark:to-purple-950/40 border border-sky-200 dark:border-sky-900/60 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Top row: Greeting and Streak */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
          </span>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Tiến độ hôm nay
          </span>
        </div>

        {/* Streak badge and Quick study button */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold shadow-xs">
            <Flame className="w-4 h-4 fill-amber-500 text-amber-500 animate-bounce" />
            <span>{stats.streakDays} ngày liên tiếp</span>
          </div>

          {onQuickStudy && (totalDueToday > 0 || totalNewToday > 0) && (
            <button
              onClick={onQuickStudy}
              className="px-3.5 py-1 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs transition touch-target flex items-center space-x-1"
            >
              <span>Học ngay</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Time studied today */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur shadow-xs flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Đã học hôm nay
            </div>
            <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100">
              {formattedTime}
            </div>
          </div>
        </div>

        {/* Cards reviewed today */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur shadow-xs flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Đã ôn hôm nay
            </div>
            <div className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400">
              {reviewedCount} <span className="text-xs font-normal text-slate-400">thẻ</span>
            </div>
          </div>
        </div>

        {/* Remaining Due Reviews */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur shadow-xs flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Cần ôn lại
            </div>
            <div className="text-sm sm:text-base font-extrabold text-indigo-600 dark:text-indigo-400">
              {totalDueToday} <span className="text-xs font-normal text-slate-400">thẻ</span>
            </div>
          </div>
        </div>

        {/* Remaining New Cards */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur shadow-xs flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Thẻ mới chờ học
            </div>
            <div className="text-sm sm:text-base font-extrabold text-amber-600 dark:text-amber-400">
              {totalNewToday} <span className="text-xs font-normal text-slate-400">thẻ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
