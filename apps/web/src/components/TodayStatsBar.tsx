import { ArrowRight, Check, Clock3, Flame, Plus } from 'lucide-react';
import { getTodayDateString, type UserStudyStats } from '@raku/core';

interface TodayStatsBarProps {
  stats: UserStudyStats;
  totalDueToday: number;
  totalNewToday: number;
  /** Số từ/mục mới thực sự được học lần đầu trong ngày */
  newItemsLearnedToday: number;
  newWordGoal: number;
  currentStreak: number;
  longestStreak: number;
  onQuickStudy?: () => void;
  onStudyMoreNew?: () => void;
}

export function TodayStatsBar({
  stats,
  totalDueToday,
  totalNewToday,
  newItemsLearnedToday,
  newWordGoal,
  currentStreak,
  longestStreak,
  onQuickStudy,
  onStudyMoreNew
}: TodayStatsBarProps) {
  const isStatsToday = stats.todayStats.date === getTodayDateString();
  const studySeconds = isStatsToday ? stats.todayStats.studySeconds : 0;
  const reviewedCount = isStatsToday ? stats.todayStats.reviewedCount : 0;
  const minutes = Math.floor(studySeconds / 60);
  const formattedTime =
    minutes > 0 ? `${minutes} phút` : studySeconds > 0 ? '< 1 phút' : '0 phút';

  const isDailyGoalFinished =
    newItemsLearnedToday >= newWordGoal &&
    (reviewedCount > 0 || newItemsLearnedToday > 0) &&
    totalDueToday === 0 &&
    totalNewToday === 0;

  const remainingTotal = totalDueToday + totalNewToday;
  const hasWorkToday = remainingTotal > 0;
  const totalToday = reviewedCount + remainingTotal;
  const progress = totalToday > 0 ? Math.round((reviewedCount / totalToday) * 100) : 0;

  const todayLabel = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date());

  const headline = isDailyGoalFinished
    ? 'Đã xong mục tiêu hôm nay'
    : totalDueToday > 0
      ? `Còn ${totalDueToday} thẻ đến hạn`
      : totalNewToday > 0
        ? `${totalNewToday} thẻ mới sẵn sàng`
        : 'Không có thẻ đến hạn';

  return (
    <section
      aria-labelledby="today-focus-title"
      className="raku-card p-5 sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-raku-muted">
            <span className="capitalize">{todayLabel}</span>
            <span aria-hidden="true">·</span>
            <span
              className="inline-flex items-center gap-1 font-medium text-raku-ink tabular-nums"
              title={`Chuỗi dài nhất: ${longestStreak} ngày`}
            >
              <Flame
                className={`h-3.5 w-3.5 ${currentStreak > 0 ? 'text-raku-signal' : 'text-raku-muted'}`}
                aria-hidden="true"
              />
              {currentStreak} ngày liên tiếp
            </span>
          </div>

          <h2
            id="today-focus-title"
            className="text-xl font-bold tracking-tight text-raku-ink sm:text-2xl tabular-nums"
          >
            {headline}
          </h2>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-raku-muted tabular-nums">
            <span>
              Đã ôn <strong className="font-semibold text-raku-ink">{reviewedCount}</strong>
            </span>
            <span>
              Từ mới{' '}
              <strong className="font-semibold text-raku-ink">
                {newItemsLearnedToday}/{newWordGoal}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {formattedTime}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {hasWorkToday && onQuickStudy && (
            <button
              type="button"
              onClick={onQuickStudy}
              className="raku-btn-primary w-full sm:w-auto"
            >
              <span>{reviewedCount > 0 ? 'Tiếp tục ôn' : 'Ôn ngay'}</span>
              <span className="rounded-md bg-raku-on-accent/15 px-1.5 py-0.5 text-xs tabular-nums">
                {remainingTotal}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          {isDailyGoalFinished && (
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-raku-accent-soft px-3.5 text-sm font-semibold text-raku-accent">
              <Check className="h-4 w-4" aria-hidden="true" />
              Hoàn tất
            </span>
          )}

          {onStudyMoreNew && !hasWorkToday && (
            <button
              type="button"
              onClick={onStudyMoreNew}
              className="raku-btn-secondary w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Học thêm 20 từ mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Slim, calm single-tone progress indicator */}
      <div className="mt-5 space-y-1.5">
        <div
          className="raku-progress-track"
          role="progressbar"
          aria-label="Tiến độ học hôm nay"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="raku-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-raku-muted tabular-nums">
          <span>
            {totalToday > 0 ? `${reviewedCount} / ${totalToday} thẻ hôm nay` : 'Chưa có lượt ôn hôm nay'}
          </span>
          <span>{progress}%</span>
        </div>
      </div>
    </section>
  );
}
