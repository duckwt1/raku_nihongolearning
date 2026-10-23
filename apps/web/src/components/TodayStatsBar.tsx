import { Clock, CheckCircle2, Flame, Layers, Sparkles } from 'lucide-react';
import type { UserStudyStats } from '@raku/core';

interface TodayStatsBarProps {
  stats: UserStudyStats;
  totalDueToday: number;
  totalNewToday: number;
  onQuickStudy?: () => void;
  onStudyMoreNew?: () => void;
}

export function TodayStatsBar({
  stats,
  totalDueToday,
  totalNewToday,
  onQuickStudy,
  onStudyMoreNew
}: TodayStatsBarProps) {
  const { studySeconds, reviewedCount } = stats.todayStats;
  const minutes = Math.floor(studySeconds / 60);
  const seconds = studySeconds % 60;

  const formattedTime =
    minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds} giây`;

  const isDailyGoalFinished = reviewedCount > 0 && totalDueToday === 0 && totalNewToday === 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-raku-line bg-raku-surface">
      <div className="flex flex-col gap-3 border-b border-raku-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-raku-accent-soft text-raku-accent">
            <Layers className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold text-raku-ink">Tiến độ hôm nay</h2>
            <p className="mt-0.5 text-sm text-raku-muted">Một nhịp học nhỏ, đều đặn mỗi ngày</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-50 px-3 text-sm font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
            <Flame className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            {stats.streakDays} ngày liên tiếp
          </div>

          {isDailyGoalFinished && (
            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-raku-accent-soft px-3 text-sm font-semibold text-raku-accent">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Mục tiêu hôm nay xong
            </span>
          )}

          {onQuickStudy && (totalDueToday > 0 || totalNewToday > 0) && (
            <button
              onClick={onQuickStudy}
              className="flex min-h-11 items-center justify-center rounded-xl bg-raku-accent px-4 text-sm font-semibold text-raku-on-accent transition-colors hover:bg-raku-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raku-signal focus-visible:ring-offset-2"
            >
              Học ngay
            </button>
          )}

          {onStudyMoreNew && isDailyGoalFinished && (
            <button
              onClick={onStudyMoreNew}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-raku-line px-3.5 text-sm font-semibold text-raku-ink transition-colors hover:bg-raku-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raku-accent focus-visible:ring-offset-2"
            >
              <Sparkles className="h-4 w-4 text-raku-accent" aria-hidden="true" />
              Học thêm 20 từ
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-raku-line sm:grid-cols-4 sm:divide-y-0">
        <div className="flex min-w-0 items-center gap-3 p-4">
          <Clock className="h-5 w-5 shrink-0 text-raku-muted" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm text-raku-muted">Thời gian học</div>
            <div className="truncate text-lg font-bold text-raku-ink">{formattedTime}</div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-raku-accent" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm text-raku-muted">Đã ôn</div>
            <div className="text-lg font-bold text-raku-ink">{reviewedCount} <span className="text-sm font-medium text-raku-muted">thẻ</span></div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3 p-4">
          <Layers className="h-5 w-5 shrink-0 text-raku-signal" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm text-raku-muted">Cần ôn</div>
            <div className="text-lg font-bold text-raku-ink">{totalDueToday} <span className="text-sm font-medium text-raku-muted">thẻ</span></div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3 p-4">
          <Sparkles className="h-5 w-5 shrink-0 text-raku-accent" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm text-raku-muted">Thẻ mới</div>
            <div className="text-lg font-bold text-raku-ink">{totalNewToday} <span className="text-sm font-medium text-raku-muted">thẻ</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
