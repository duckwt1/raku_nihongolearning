import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type FSRSParameters,
  type Grade,
  type RecordLogItem
} from 'ts-fsrs';

export { Rating, type Card, type Grade, type RecordLogItem };

export interface FSRSOptions {
  request_retention?: number;
  maximum_interval?: number;
  w?: number[];
  enable_fuzz?: boolean;
}

export const DEFAULT_FSRS_CONFIG: FSRSOptions = {
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false
};

/**
 * Creates a configured FSRS instance.
 */
export function createScheduler(options?: FSRSOptions) {
  const params: FSRSParameters = generatorParameters({
    request_retention: options?.request_retention ?? DEFAULT_FSRS_CONFIG.request_retention,
    maximum_interval: options?.maximum_interval ?? DEFAULT_FSRS_CONFIG.maximum_interval,
    enable_fuzz: options?.enable_fuzz ?? DEFAULT_FSRS_CONFIG.enable_fuzz
  });
  return fsrs(params);
}

/**
 * Formats time difference into concise SRS intervals like:
 * `<1m`, `<10m`, `1d`, `3d`, `2w`, `3mo`, `1y`
 */
export function formatInterval(due: Date, now: Date = new Date()): string {
  const diffMs = due.getTime() - now.getTime();
  if (diffMs <= 0) {
    return '<1m';
  }

  const minutes = Math.round(diffMs / (60 * 1000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) {
    if (minutes <= 1) return '<1m';
    if (minutes <= 10) return '<10m';
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;

  const weeks = Math.round(days / 7);
  if (days < 30) return `${weeks}w`;

  const months = Math.round(days / 30.4375);
  if (days < 365) return `${months}mo`;

  const years = Math.round(days / 365.25);
  return `${years}y`;
}

export interface CardPreview {
  grade: Grade;
  ratingLabel: 'Again' | 'Hard' | 'Good' | 'Easy';
  intervalLabel: string;
  nextDue: Date;
  scheduledDays: number;
}

/**
 * Previews all 4 grading choices (Again, Hard, Good, Easy) for a card at a given time.
 */
export function previewCardGrades(
  card: Card,
  now: Date = new Date(),
  options?: FSRSOptions
): Record<Grade, CardPreview> {
  const f = createScheduler(options);
  const schedulingCards = f.repeat(card, now);

  const mapGrade = (grade: Grade, label: CardPreview['ratingLabel']): CardPreview => {
    const item = schedulingCards[grade];
    const nextDue = item.card.due;
    return {
      grade,
      ratingLabel: label,
      intervalLabel: formatInterval(nextDue, now),
      nextDue,
      scheduledDays: item.card.scheduled_days
    };
  };

  return {
    [Rating.Again]: mapGrade(Rating.Again, 'Again'),
    [Rating.Hard]: mapGrade(Rating.Hard, 'Hard'),
    [Rating.Good]: mapGrade(Rating.Good, 'Good'),
    [Rating.Easy]: mapGrade(Rating.Easy, 'Easy')
  };
}

/**
 * Applies a rating to a card and returns the updated card and log.
 */
export function applyGrade(
  card: Card,
  grade: Grade,
  now: Date = new Date(),
  options?: FSRSOptions
): RecordLogItem {
  const f = createScheduler(options);
  return f.next(card, now, grade);
}

/**
 * Helper to initialize a new fresh card with default FSRS attributes.
 */
export function createNewCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}
