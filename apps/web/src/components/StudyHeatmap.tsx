import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarCheck2, Flame, Trophy } from 'lucide-react';
import { buildHeatmapWeeks, getTodayDateString } from '@raku/core';

interface StudyHeatmapProps {
  counts: Map<string, number>;
  goal: number;
  currentStreak: number;
  longestStreak: number;
}

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

function cellColor(count: number, goal: number, future: boolean): string {
  if (future) return 'bg-transparent';
  if (count === 0) return 'bg-raku-subtle';
  if (count >= goal) return 'bg-raku-accent ring-1 ring-raku-accent/35';
  if (count >= Math.ceil((goal * 2) / 3)) return 'bg-raku-accent/75';
  if (count >= Math.ceil(goal / 3)) return 'bg-raku-accent/50';
  return 'bg-raku-accent/25';
}

export function StudyHeatmap({
  counts,
  goal,
  currentStreak,
  longestStreak
}: StudyHeatmapProps) {
  const today = getTodayDateString();
  const [selected, setSelected] = useState<{ date: string; count: number; completed: boolean } | null>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const weeks = useMemo(
    () => buildHeatmapWeeks(counts, today, goal, 53),
    [counts, today, goal]
  );
  const cells = useMemo(() => weeks.flat(), [weeks]);

  const monthLabels = useMemo(() => {
    let previousMonth = -1;
    return weeks.map((week) => {
      const first = week.find((cell) => !cell.future) || week[0];
      if (!first) return '';
      const month = new Date(`${first.date}T12:00:00`).getMonth();
      if (month === previousMonth) return '';
      previousMonth = month;
      return String(month + 1);
    });
  }, [weeks]);

  const completedDays = cells.filter((cell) => cell.completed).length;
  const todayCount = counts.get(today) || 0;
  const selectedLabel = selected
    ? FULL_DATE_FORMATTER.format(new Date(`${selected.date}T12:00:00`))
    : null;

  const selectCell = (cell: (typeof cells)[number]) => {
    setSelected({
      date: cell.date,
      count: cell.count,
      completed: cell.completed
    });
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    cellIndex: number
  ) => {
    const offsets: Record<string, number> = {
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
      ArrowDown: 1
    };
    const offset = offsets[event.key];
    if (!offset) return;

    event.preventDefault();
    let nextIndex = cellIndex + offset;
    let nextCell = cells[nextIndex];
    while (nextCell?.future) {
      nextIndex += offset;
      nextCell = cells[nextIndex];
    }
    if (!nextCell) return;

    cellRefs.current.get(nextCell.date)?.focus();
    selectCell(nextCell);
  };

  return (
    <section
      aria-labelledby="study-streak-title"
      className="overflow-hidden rounded-3xl border border-raku-line bg-raku-surface p-4 shadow-[0_8px_24px_rgba(36,52,48,0.05)] sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3
            id="study-streak-title"
            className="flex items-center gap-2 text-base font-bold text-raku-ink"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raku-signal/10 text-raku-signal">
              <Flame className="h-5 w-5" aria-hidden="true" />
            </span>
            Chuỗi học tập
          </h3>
          <p className="mt-2 text-sm leading-5 text-raku-muted">
            Mỗi ô là một ngày học từ mới; đủ {goal} từ sẽ tính một ngày giữ chuỗi.
          </p>
        </div>
        <span className="inline-flex min-h-9 w-fit items-center gap-2 rounded-full bg-raku-accent-soft px-3 text-xs font-medium text-raku-accent">
          Mục tiêu <strong className="tabular-nums">{goal} từ/ngày</strong>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-6 gap-3 sm:grid-cols-3">
        <div className="col-span-6 flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-raku-accent/20 bg-raku-accent-soft p-4 sm:col-span-1">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-raku-surface text-raku-signal shadow-sm">
            <Flame className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <span className="block text-xs font-medium text-raku-muted">Chuỗi hiện tại</span>
            <strong className="mt-0.5 block text-lg font-bold leading-6 text-raku-ink tabular-nums">
              {currentStreak} <span className="text-sm font-medium">ngày</span>
            </strong>
          </div>
          <span className="ml-auto hidden text-xs font-medium text-raku-muted sm:block lg:text-right">
            {currentStreak > 0 ? 'Đang nối tiếp' : 'Bắt đầu hôm nay'}
          </span>
        </div>

        <div className="col-span-3 flex min-h-[4.5rem] items-center gap-2 rounded-2xl border border-raku-line bg-raku-canvas/60 px-3 py-3 sm:col-span-1 sm:gap-3 sm:px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raku-subtle text-raku-muted">
            <Trophy className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <span className="block truncate text-xs font-medium text-raku-muted">Dài nhất</span>
            <strong className="mt-0.5 block text-lg font-bold leading-5 text-raku-ink tabular-nums">
              {longestStreak} <span className="text-xs font-medium text-raku-muted">ngày</span>
            </strong>
          </div>
        </div>

        <div className="col-span-3 flex min-h-[4.5rem] items-center gap-2 rounded-2xl border border-raku-line bg-raku-canvas/60 px-3 py-3 sm:col-span-1 sm:gap-3 sm:px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raku-subtle text-raku-accent">
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <span className="block truncate text-xs font-medium text-raku-muted">Ngày đạt</span>
            <strong className="mt-0.5 block text-lg font-bold leading-5 text-raku-ink tabular-nums">
              {completedDays} <span className="text-xs font-medium text-raku-muted">ngày</span>
            </strong>
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <div
          aria-hidden="true"
          className="mt-6 grid shrink-0 grid-rows-7 gap-1 text-xs font-medium leading-none text-raku-muted"
        >
          {DAY_LABELS.map((label) => (
            <span key={label} className="flex h-4 items-center">
              {label}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-2">
          <div className="min-w-max">
            <div aria-hidden="true" className="mb-2 flex h-4 gap-1 text-xs leading-4 text-raku-muted">
              {monthLabels.map((label, index) => (
                <span key={index} className="w-4 shrink-0 overflow-visible whitespace-nowrap">
                  {label}
                </span>
              ))}
            </div>

            <div role="grid" aria-label="Lịch học trong 53 tuần gần nhất" className="flex gap-1">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} role="row" className="grid grid-rows-7 gap-1">
                  {week.map((cell, dayIndex) => {
                    const cellIndex = weekIndex * 7 + dayIndex;
                    const isSelected = selected?.date === cell.date;
                    const isTabStop = isSelected || (!selected && cell.date === today);
                    const label = `${FULL_DATE_FORMATTER.format(new Date(`${cell.date}T12:00:00`))}: ${cell.count} từ mới${
                      cell.completed ? ', đạt mục tiêu' : ''
                    }`;

                    return (
                      <button
                        key={cell.date}
                        ref={(element) => {
                          if (element) cellRefs.current.set(cell.date, element);
                          else cellRefs.current.delete(cell.date);
                        }}
                        type="button"
                        role="gridcell"
                        disabled={cell.future}
                        aria-hidden={cell.future || undefined}
                        aria-label={cell.future ? undefined : label}
                        aria-selected={cell.future ? undefined : isSelected}
                        title={cell.future ? undefined : `${cell.count} từ mới`}
                        tabIndex={cell.future || !isTabStop ? -1 : 0}
                        onClick={cell.future ? undefined : () => selectCell(cell)}
                        onKeyDown={(event) => handleCellKeyDown(event, cellIndex)}
                        className={`h-4 w-4 rounded-[4px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raku-signal focus-visible:ring-offset-1 ${cellColor(
                          cell.count,
                          goal,
                          cell.future
                        )} ${
                          cell.future
                            ? 'cursor-default'
                            : 'cursor-pointer hover:ring-2 hover:ring-raku-signal/50'
                        } ${isSelected ? 'ring-2 ring-raku-signal ring-offset-1' : ''}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 border-t border-raku-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="min-h-5 text-xs font-medium leading-5 text-raku-muted">
          {selectedLabel
            ? `${selectedLabel}: ${selected?.count ?? 0} từ mới${
                selected?.completed ? ' · đã đạt mục tiêu' : ''
              }`
            : `Hôm nay ${todayCount}/${goal} từ mới${
                todayCount >= goal ? ' · đã giữ được chuỗi' : ` · còn ${goal - todayCount} từ để đạt mục tiêu`
              }`}
        </p>
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-raku-muted">
          <span>Ít</span>
          <span className="h-3 w-3 rounded-[3px] bg-raku-subtle" />
          <span className="h-3 w-3 rounded-[3px] bg-raku-accent/25" />
          <span className="h-3 w-3 rounded-[3px] bg-raku-accent/50" />
          <span className="h-3 w-3 rounded-[3px] bg-raku-accent/75" />
          <span className="h-3 w-3 rounded-[3px] bg-raku-accent" />
          <span>Nhiều</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-raku-muted sm:hidden">Vuốt ngang để xem đủ 53 tuần.</p>
    </section>
  );
}
