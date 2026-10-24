import { CheckCircle2, Clock3, Flame, Layers3, Sparkles } from 'lucide-react';
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
  const formattedTime = minutes > 0
    ? `${minutes} phút học`
    : studySeconds > 0
      ? 'Dưới 1 phút học'
      : 'Chưa học hôm nay';
  const isDailyGoalFinished = reviewedCount > 0 && totalDueToday === 0 && totalNewToday === 0;
  const hasWorkToday = totalDueToday > 0 || totalNewToday > 0;
  const totalToday = reviewedCount + totalDueToday + totalNewToday;
  const progress = totalToday > 0 ? Math.round((reviewedCount / totalToday) * 100) : 0;
  const todayLabel = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date());

  return (
    <section aria-labelledby="today-focus-title" className="raku-daily-card">
      <div className="raku-daily-card__main">
        <div className="raku-daily-copy">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="raku-daily-kicker">
              <span className="raku-daily-kicker__seal" aria-hidden="true">楽</span>
              Nhịp học hôm nay
            </p>
            <span className="raku-daily-date">{todayLabel}</span>
          </div>

          <h2 id="today-focus-title" className="raku-daily-title">
            Mỗi ngày một nét mới.
          </h2>
          <p className="raku-daily-description">
            Ôn bài đến hạn trước. Khi xong, bạn có thể mở thêm thẻ mới.
          </p>

          <div className="raku-daily-progress">
            <div className="raku-progress-summary flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-raku-ink">Tiến độ hôm nay</span>
              <span className="shrink-0 text-raku-muted tabular-nums">
                {reviewedCount} / {totalToday} thẻ
              </span>
            </div>
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-raku-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-4 w-4" aria-hidden="true" /> {formattedTime}
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {hasWorkToday && onQuickStudy && (
              <button
                onClick={onQuickStudy}
                className="raku-daily-action"
              >
                {reviewedCount > 0 ? 'Tiếp tục ôn tập' : 'Bắt đầu ôn tập'}
                <span aria-hidden="true">→</span>
              </button>
            )}
            {isDailyGoalFinished && (
              <span className="raku-daily-complete">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Hôm nay đã trọn vẹn
              </span>
            )}
            {!hasWorkToday && !isDailyGoalFinished && (
              <span className="text-sm font-medium text-raku-muted">Hôm nay chưa có thẻ đến hạn.</span>
            )}
            {onStudyMoreNew && isDailyGoalFinished && (
              <button onClick={onStudyMoreNew} className="raku-daily-more">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Mở thêm 20 từ
              </button>
            )}
          </div>
        </div>

        <div className="raku-study-stamp" aria-hidden="true">
          <span className="raku-study-stamp__character">楽</span>
          <span className="raku-study-stamp__caption">raku · học vui</span>
        </div>
      </div>

      <div className="raku-daily-stats" role="group" aria-label="Tổng kết học tập hôm nay">
        <div className="raku-daily-stat">
          <span className="raku-daily-stat__icon raku-daily-stat__icon--green"><CheckCircle2 aria-hidden="true" /></span>
          <div>
            <span className="raku-daily-stat__label">Đã ôn</span>
            <strong>{reviewedCount}<small> thẻ</small></strong>
          </div>
        </div>
        <div className="raku-daily-stat">
          <span className="raku-daily-stat__icon raku-daily-stat__icon--red"><Layers3 aria-hidden="true" /></span>
          <div>
            <span className="raku-daily-stat__label">Cần ôn</span>
            <strong>{totalDueToday}<small> thẻ</small></strong>
          </div>
        </div>
        <div className="raku-daily-stat">
          <span className="raku-daily-stat__icon raku-daily-stat__icon--gold"><Sparkles aria-hidden="true" /></span>
          <div>
            <span className="raku-daily-stat__label">Từ mới</span>
            <strong>{totalNewToday}<small> thẻ</small></strong>
          </div>
        </div>
        <div className="raku-daily-stat">
          <span className="raku-daily-stat__icon raku-daily-stat__icon--ink"><Flame aria-hidden="true" /></span>
          <div>
            <span className="raku-daily-stat__label">Chuỗi ngày</span>
            <strong>{stats.streakDays}<small> ngày</small></strong>
          </div>
        </div>
      </div>
    </section>
  );
}
