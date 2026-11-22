import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Flame } from 'lucide-react';
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
  if (count >= goal) return 'bg-raku-accent';
  if (count >= Math.ceil((goal * 2) / 3)) return 'bg-raku-accent/70';
  if (count >= Math.ceil(goal / 3)) return 'bg-raku-accent/45';
  return 'bg-raku-accent/25';
}

export function StudyHeatmap({
  counts,
  goal,
  currentStreak,
  longestStreak
}: StudyHeatmapProps) {
  const today = getTodayDateString();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const weeks = useMemo(
    () => buildHeatmapWeeks(counts, today, goal, 53),
    [counts, today, goal]
  );
  const cells = useMemo(() => weeks.flat(), [weeks]);
  const selected = useMemo(
    () => (selectedDate ? cells.find((c) => c.date === selectedDate && !c.future) ?? null : null),
    [cells, selectedDate]
  );

  const monthLabels = useMemo(() => {
    let previousMonth = -1;
    return weeks.map((week) => {
      const first = week.find((cell) => !cell.future) || week[0];
      if (!first) return '';
      const month = new Date(`${first.date}T12:00:00`).getMonth();
      if (month === previousMonth) return '';
      previousMonth = month;
      return `Th${month + 1}`;
    });
  }, [weeks]);

  const completedDays = cells.filter((cell) => cell.completed).length;
  const todayCount = counts.get(today) || 0;
  const selectedLabel = selected
    ? FULL_DATE_FORMATTER.format(new Date(`${selected.date}T12:00:00`))
    : null;

  const selectCell = (cell: (typeof cells)[number]) => {
    setSelectedDate(cell.date);
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
      className="raku-card overflow-hidden p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="study-streak-title" className="text-base font-bold text-raku-ink">
            Lịch sử học tập
          </h3>
          <p className="mt-0.5 text-xs text-raku-muted">
            Mục tiêu {goal} từ mới mỗi ngày để duy trì chuỗi.
          </p>
        </div>

        {/* Clean inline stats strip instead of nested boxed cards */}
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs tabular-nums">
          <div className="flex items-center gap-1.5">
            <Flame
              className={`h-4 w-4 ${currentStreak > 0 ? 'text-raku-signal' : 'text-raku-muted'}`}
              aria-hidden="true"
            />
            <dt className="text-raku-muted">Chuỗi:</dt>
            <dd className="font-bold text-raku-ink">{currentStreak} ngày</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-raku-muted">Dài nhất:</dt>
            <dd className="font-semibold text-raku-ink">{longestStreak} ngày</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-raku-muted">Ngày đạt:</dt>
            <dd className="font-semibold text-raku-accent">{completedDays}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 flex gap-2">
        <div
          aria-hidden="true"
          className="mt-6 grid shrink-0 grid-rows-7 gap-1 text-[11px] font-medium leading-none text-raku-muted"
        >
          {DAY_LABELS.map((label) => (
            <span key={label} className="flex h-3.5 items-center">
              {label}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-2">
          <div className="min-w-max pr-4">
            <div aria-hidden="true" className="mb-2 flex h-4 gap-1 text-[11px] leading-4 text-raku-muted">
              {monthLabels.map((label, index) => (
                <span key={index} className="w-3.5 shrink-0 overflow-visible whitespace-nowrap">
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
                        className={`h-3.5 w-3.5 rounded-[3px] transition-colors ${cellColor(
                          cell.count,
                          goal,
                          cell.future
                        )} ${
                          cell.future
                            ? 'cursor-default'
                            : 'cursor-pointer hover:ring-1 hover:ring-raku-ink/50'
                        } ${isSelected ? 'ring-2 ring-raku-signal ring-offset-1 ring-offset-raku-surface' : ''}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-raku-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="min-h-5 text-xs text-raku-muted tabular-nums">
          {selectedLabel
            ? `${selectedLabel}: ${selected?.count ?? 0} từ mới${
                selected?.completed ? ' · đạt mục tiêu' : ''
              }`
            : `Hôm nay ${todayCount}/${goal} từ mới${
                todayCount >= goal ? ' · đã giữ chuỗi' : ` · còn ${goal - todayCount} từ`
              }`}
        </p>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-raku-muted">
          <span>Ít</span>
          <span className="h-3 w-3 rounded-[2px] bg-raku-subtle" />
          <span className="h-3 w-3 rounded-[2px] bg-raku-accent/25" />
          <span className="h-3 w-3 rounded-[2px] bg-raku-accent/45" />
          <span className="h-3 w-3 rounded-[2px] bg-raku-accent/70" />
          <span className="h-3 w-3 rounded-[2px] bg-raku-accent" />
          <span>Nhiều</span>
        </div>
      </div>
    </section>
  );
}
