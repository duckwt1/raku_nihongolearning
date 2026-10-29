import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { buildHeatmapWeeks, getTodayDateString } from '@raku/core';

interface StudyHeatmapProps {
  counts: Map<string, number>;
  goal: number;
  currentStreak: number;
  longestStreak: number;
}

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function cellColor(count: number, goal: number, future: boolean): string {
  if (future) return 'bg-transparent';
  if (count === 0) return 'bg-slate-100 dark:bg-slate-800';
  if (count >= goal) {
    return 'bg-emerald-600 dark:bg-emerald-400 ring-1 ring-emerald-800/30 dark:ring-emerald-200/30';
  }
  if (count >= 10) return 'bg-emerald-400 dark:bg-emerald-600';
  if (count >= 5) return 'bg-emerald-300 dark:bg-emerald-700';
  return 'bg-emerald-100 dark:bg-emerald-950';
}

export function StudyHeatmap({
  counts,
  goal,
  currentStreak,
  longestStreak
}: StudyHeatmapProps) {
  const today = getTodayDateString();
  const [selected, setSelected] = useState<{ date: string; count: number; completed: boolean } | null>(null);
  const weeks = useMemo(
    () => buildHeatmapWeeks(counts, today, goal, 53),
    [counts, today, goal]
  );

  const monthLabels = useMemo(() => {
    let previousMonth = -1;
    return weeks.map((week) => {
      const first = week.find((cell) => !cell.future) || week[0];
      if (!first) return '';
      const date = new Date(`${first.date}T12:00:00`);
      const month = date.getMonth();
      if (month === previousMonth) return '';
      previousMonth = month;
      return new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(date);
    });
  }, [weeks]);

  const completedDays = weeks
    .flat()
    .filter((cell) => cell.completed).length;

  const selectedLabel = selected
    ? new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date(`${selected.date}T12:00:00`))
    : null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
            <Flame className="h-4 w-4 text-amber-500" />
            Chuỗi học tập
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Một ngày được tính khi học đủ {goal} từ mới.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Hiện tại</p>
            <p className="font-bold text-slate-800 dark:text-slate-100">
              {currentStreak} ngày
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Dài nhất</p>
            <p className="font-bold text-slate-800 dark:text-slate-100">
              {longestStreak} ngày
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Ngày đạt</p>
            <p className="font-bold text-slate-800 dark:text-slate-100">{completedDays}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1">
          <div className="grid grid-rows-7 gap-[3px] pr-1 text-[9px] leading-3 text-slate-400">
            {DAY_LABELS.map((label) => (
              <span key={label} className="flex h-3 items-center">
                {label}
              </span>
            ))}
          </div>

          <div>
            <div className="mb-1 flex gap-[3px]">
              {monthLabels.map((label, index) => (
                <div
                  key={index}
                  className="h-3 w-3 shrink-0 overflow-visible whitespace-nowrap text-[8px] leading-3 text-slate-400"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-rows-7 gap-[3px]">
                  {week.map((cell) => (
                    <div
                      key={cell.date}
                      title={
                        cell.future
                          ? ''
                          : `${cell.date}: ${cell.count} từ mới${
                              cell.completed ? ' · đạt mục tiêu' : ''
                            }`
                      }
                      aria-label={
                        cell.future
                          ? undefined
                          : `${cell.date}, ${cell.count} từ mới${
                              cell.completed ? ', đạt mục tiêu' : ''
                            }`
                      }
                      onClick={
                        cell.future
                          ? undefined
                          : () =>
                              setSelected({
                                date: cell.date,
                                count: cell.count,
                                completed: cell.completed
                              })
                      }
                      className={`h-3 w-3 rounded-[3px] ${cellColor(
                        cell.count,
                        goal,
                        cell.future
                      )} ${
                        cell.future
                          ? ''
                          : 'cursor-pointer transition hover:ring-1 hover:ring-slate-400 dark:hover:ring-slate-500'
                      } ${
                        selected?.date === cell.date
                          ? 'ring-2 ring-slate-800 dark:ring-slate-100'
                          : ''
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
        <span className="font-medium text-slate-500 dark:text-slate-300">
          {selectedLabel
            ? `${selectedLabel}: ${selected?.count ?? 0} từ mới${
                selected?.completed ? ' · đạt mục tiêu' : ''
              }`
            : 'Chạm vào một ô để xem chi tiết.'}
        </span>
        <span className="flex items-center gap-1">
          Ít
          <span className="h-3 w-3 rounded-[3px] bg-slate-100 dark:bg-slate-800" />
          <span className="h-3 w-3 rounded-[3px] bg-emerald-100 dark:bg-emerald-950" />
          <span className="h-3 w-3 rounded-[3px] bg-emerald-300 dark:bg-emerald-700" />
          <span className="h-3 w-3 rounded-[3px] bg-emerald-400 dark:bg-emerald-600" />
          <span className="h-3 w-3 rounded-[3px] bg-emerald-600 ring-1 ring-emerald-800/30 dark:bg-emerald-400" />
          Nhiều
        </span>
      </div>
    </section>
  );
}
