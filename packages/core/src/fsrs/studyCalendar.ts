import type { StudyCard } from './studySession.js';
import { getTodayDateString } from './studySession.js';

export interface StudyStreakResult {
  currentStreak: number;
  longestStreak: number;
  todayCount: number;
  completedToday: boolean;
  totalActiveDays: number;
}

export interface HeatmapCell {
  date: string;
  count: number;
  completed: boolean;
  future: boolean;
}

function parseDateString(dateStr: string): Date {
  const [year = 1970, month = 1, day = 1] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateStr: string, delta: number): string {
  const date = parseDateString(dateStr);
  date.setDate(date.getDate() + delta);
  return getTodayDateString(date);
}

/**
 * Đếm số từ vựng mới (unique word.id) được học lần đầu theo từng ngày.
 * - Dùng firstLearnedAt; fallback last_review khi reps === 1 (dữ liệu cũ).
 * - Bỏ qua card ngữ pháp / card không có word.
 */
export function getDailyNewWordCounts(cards: StudyCard[]): Map<string, number> {
  const earliestByWord = new Map<string, Date>();

  for (const card of cards) {
    const wordId = card.word?.id || (card.type === 'word' ? card.refId : '');
    if (!wordId) continue;

    let learnedAt: Date | null = null;
    if (card.firstLearnedAt) {
      const parsed = new Date(card.firstLearnedAt);
      if (!Number.isNaN(parsed.getTime())) learnedAt = parsed;
    }
    if (!learnedAt && card.fsrsCard.last_review && card.fsrsCard.reps === 1) {
      learnedAt = new Date(card.fsrsCard.last_review);
    }
    if (!learnedAt || Number.isNaN(learnedAt.getTime())) continue;

    const existing = earliestByWord.get(wordId);
    if (!existing || learnedAt.getTime() < existing.getTime()) {
      earliestByWord.set(wordId, learnedAt);
    }
  }

  const byDate = new Map<string, Set<string>>();
  for (const [wordId, learnedAt] of earliestByWord) {
    const dateStr = getTodayDateString(learnedAt);
    const set = byDate.get(dateStr) || new Set<string>();
    set.add(wordId);
    byDate.set(dateStr, set);
  }

  return new Map(
    Array.from(byDate.entries()).map(([date, words]) => [date, words.size])
  );
}

/**
 * Streak: một ngày hoàn thành khi số từ mới >= goal.
 * Nếu hôm nay chưa đạt, streak được tính đến hết hôm qua (chưa reset trong ngày).
 */
export function calculateStudyStreaks(
  dailyCounts: Map<string, number>,
  today: string,
  goal: number
): StudyStreakResult {
  const safeGoal = Math.max(1, Math.floor(goal) || 1);
  const todayCount = dailyCounts.get(today) || 0;
  const completedToday = todayCount >= safeGoal;

  let cursor = completedToday ? today : addDays(today, -1);
  let currentStreak = 0;
  while ((dailyCounts.get(cursor) || 0) >= safeGoal) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  const completedDates = Array.from(dailyCounts.entries())
    .filter(([, count]) => count >= safeGoal)
    .map(([date]) => date)
    .sort();

  let longestStreak = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of completedDates) {
    if (previous && addDays(previous, 1) === date) {
      run++;
    } else {
      run = 1;
    }
    longestStreak = Math.max(longestStreak, run);
    previous = date;
  }

  return {
    currentStreak,
    longestStreak,
    todayCount,
    completedToday,
    totalActiveDays: completedDates.length
  };
}

/**
 * Tạo lưới heatmap 7 hàng (T2-CN) x N tuần, kết thúc ở tuần hiện tại.
 */
export function buildHeatmapWeeks(
  dailyCounts: Map<string, number>,
  today: string,
  goal: number,
  weeks = 53
): HeatmapCell[][] {
  const todayDate = parseDateString(today);
  const mondayOffset = (todayDate.getDay() + 6) % 7;
  const currentWeekStart = addDays(today, -mondayOffset);
  const start = addDays(currentWeekStart, -(weeks - 1) * 7);
  const safeGoal = Math.max(1, Math.floor(goal) || 1);

  return Array.from({ length: weeks }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(start, weekIndex * 7 + dayIndex);
      const future = date > today;
      const count = future ? 0 : dailyCounts.get(date) || 0;
      return {
        date,
        count,
        completed: !future && count >= safeGoal,
        future
      };
    })
  );
}
