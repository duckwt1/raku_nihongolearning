import type { Deck, JlptLevel, Word } from '../models/schemas.js';
import type { StudyCard } from '../fsrs/studySession.js';
import { halfWidthKatakanaToFullWidth, katakanaToHiragana, normalizeNfc } from '../text/normalize.js';

export const ARENA_TIME_LIMITS = [10, 15, 20, 30] as const;
export const ARENA_MAX_PLAYERS = 8;
export const ARENA_MAX_QUESTIONS = 30;
export const ARENA_MIN_PLAYERS = 2;
export const ARENA_COUNTDOWN_MS = 3_000;
export const ARENA_REVEAL_MS = 1_000;
export const ARENA_SUBMISSION_GRACE_MS = 1_000;
export const ARENA_HOST_HEARTBEAT_MS = 10_000;
export const ARENA_HOST_TIMEOUT_MS = 90_000;
export const ARENA_PLAYER_HEARTBEAT_MS = 10_000;
export const ARENA_PLAYER_TIMEOUT_MS = 60_000;

export type ArenaQuestionType = 'vi-to-jp' | 'jp-to-reading' | 'jp-to-meaning';
export type ArenaQuestionMode = ArenaQuestionType | 'mixed';
export type ArenaWordSource = 'owned' | 'community' | 'all' | 'jlpt';

export interface ArenaSettings {
  source: ArenaWordSource;
  jlptLevel?: JlptLevel;
  questionCount: number;
  timeLimitSeconds: (typeof ARENA_TIME_LIMITS)[number];
  questionMode: ArenaQuestionMode;
}

export interface ArenaOption {
  id: string;
  text: string;
}

/** Public question snapshot. It deliberately contains no correct answer field. */
export interface ArenaQuestion {
  id: string;
  index: number;
  type: ArenaQuestionType;
  prompt: string;
  choices?: ArenaOption[];
}

/** Host-only answer key stored in a separately permissioned Firestore subcollection. */
export interface ArenaAnswerKey {
  answer: string;
  acceptedAnswers: string[];
  correctChoiceId?: string;
  readings: string[];
  meanings: string[];
  explanationVi: string;
}

export interface ArenaQuestionBundle {
  question: ArenaQuestion;
  answerKey: ArenaAnswerKey;
}

export interface ArenaRankablePlayer {
  uid: string;
  nickname: string;
  score: number;
  correctCount: number;
  totalCorrectResponseMs: number;
  status?: 'active' | 'left';
}

export class ArenaQuestionGenerationError extends Error {
  constructor(
    readonly requestedCount: number,
    readonly availableCount: number,
    message = `Chỉ có thể tạo ${availableCount} câu hợp lệ với dữ liệu này.`
  ) {
    super(message);
    this.name = 'ArenaQuestionGenerationError';
  }
}

export function normalizeArenaReading(value: string): string {
  const trimmed = normalizeNfc(value).trim();
  return katakanaToHiragana(halfWidthKatakanaToFullWidth(trimmed));
}

export function normalizeArenaMeaning(value: string): string {
  return normalizeNfc(value)
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('vi-VN');
}

export function splitMeaningAlternatives(value: string): string[] {
  const fullMeaning = value.trim();
  const parts = value.split(/[;,，；|\n\r]+/u).map((part) => part.trim()).filter(Boolean);
  const seen = new Set<string>();
  return [fullMeaning, ...parts].filter((meaning) => {
    const normalized = normalizeArenaMeaning(meaning);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function uniqueWords(words: Word[]): Word[] {
  const seenIds = new Set<string>();
  const seenForms = new Set<string>();
  const unique: Word[] = [];

  for (const word of words) {
    const surface = normalizeNfc(word.surface).trim().toLocaleLowerCase('ja-JP');
    const readings = word.readings.map(normalizeArenaReading).filter(Boolean).sort().join('|');
    // Keep words with incomplete legacy data in the pool; eligibility is checked
    // per question type below so a missing reading does not block a meaning quiz.
    if (!surface) continue;
    const formKey = `${surface}\u0000${readings}`;
    if (seenIds.has(word.id) || seenForms.has(formKey)) continue;
    seenIds.add(word.id);
    seenForms.add(formKey);
    unique.push(word);
  }

  return unique;
}

export function selectArenaWords(
  cards: StudyCard[],
  decks: Deck[],
  source: ArenaWordSource,
  jlptLevel?: JlptLevel
): Word[] {
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const words = cards
    .filter((card) => card.type === 'word' && card.word)
    .filter((card) => {
      const deck = card.deckId ? deckById.get(card.deckId) : undefined;
      if (source === 'owned') return deck?.origin === 'owned';
      if (source === 'community') {
        return deck?.origin === 'community' || deck?.visibility === 'community';
      }
      if (source === 'jlpt') return Boolean(jlptLevel && card.word?.jlpt === jlptLevel);
      return true;
    })
    .map((card) => card.word!);
  return uniqueWords(words);
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  return shuffled;
}

function acceptedMeanings(word: Word): string[] {
  return splitMeaningAlternatives(word.meaningVi);
}

function eligibleQuestionTypes(words: Word[], requestedTypes: ArenaQuestionType[]): Map<string, ArenaQuestionType[]> {
  const surfaceMeanings = new Map<string, Set<string>>();
  const singleMeaningSurfaceCounts = new Map<string, number>();

  for (const word of words) {
    const surface = word.surface.trim();
    if (!surface) continue;
    const meanings = surfaceMeanings.get(surface) ?? new Set<string>();
    meanings.add(normalizeArenaMeaning(word.meaningVi));
    surfaceMeanings.set(surface, meanings);
  }

  for (const meanings of surfaceMeanings.values()) {
    if (meanings.size !== 1) continue;
    const [meaning] = meanings;
    singleMeaningSurfaceCounts.set(meaning!, (singleMeaningSurfaceCounts.get(meaning!) ?? 0) + 1);
  }

  const eligibleByWord = new Map<string, ArenaQuestionType[]>();
  for (const word of words) {
    const available: ArenaQuestionType[] = [];
    const meaning = normalizeArenaMeaning(word.meaningVi);
    if (requestedTypes.includes('vi-to-jp') && acceptedMeanings(word).length > 0) {
      const ownSurfaceMeanings = surfaceMeanings.get(word.surface.trim());
      const ownSurfaceHasDistractorMeaning = Boolean(ownSurfaceMeanings && [...ownSurfaceMeanings].some((candidate) => candidate !== meaning));
      const distractorSurfaceCount = surfaceMeanings.size
        - (singleMeaningSurfaceCounts.get(meaning) ?? 0)
        - Number(ownSurfaceHasDistractorMeaning);
      if (distractorSurfaceCount >= 3) available.push('vi-to-jp');
    }
    if (requestedTypes.includes('jp-to-reading') && word.readings.some((reading) => normalizeArenaReading(reading))) {
      available.push('jp-to-reading');
    }
    if (requestedTypes.includes('jp-to-meaning') && acceptedMeanings(word).length > 0) {
      available.push('jp-to-meaning');
    }
    eligibleByWord.set(word.id, available);
  }
  return eligibleByWord;
}

function makeQuestion(
  word: Word,
  index: number,
  type: ArenaQuestionType,
  words: Word[],
  random: () => number
): ArenaQuestionBundle {
  const id = `q${index}`;
  const readings = [...new Set(word.readings.map(normalizeArenaReading).filter(Boolean))];
  const meanings = acceptedMeanings(word);

  if (type === 'vi-to-jp') {
    const correctMeaning = word.meaningVi.trim();
    const correctMeaningNormalized = normalizeArenaMeaning(correctMeaning);
    const distractors = words.filter((candidate) =>
      candidate.id !== word.id &&
      candidate.surface.trim() !== word.surface.trim() &&
      normalizeArenaMeaning(candidate.meaningVi) !== correctMeaningNormalized
    );
    const bySurface = new Map<string, Word>();
    for (const candidate of shuffle(distractors, random)) {
      const surface = candidate.surface.trim();
      if (!surface || bySurface.has(surface)) continue;
      bySurface.set(surface, candidate);
      if (bySurface.size === 3) break;
    }
    if (bySurface.size !== 3) {
      throw new ArenaQuestionGenerationError(index + 1, index);
    }

    const choiceTexts = shuffle([word.surface.trim(), ...bySurface.keys()], random);
    const choices = choiceTexts.map((text, optionIndex) => ({
      id: `${id}_o${optionIndex}`,
      text
    }));
    const correctChoiceId = choices.find((choice) => choice.text === word.surface.trim())!.id;
    return {
      question: {
        id,
        index,
        type,
        prompt: correctMeaning,
        choices
      },
      answerKey: {
        answer: word.surface.trim(),
        acceptedAnswers: [correctChoiceId],
        correctChoiceId,
        readings,
        meanings,
        explanationVi: `${word.surface.trim()}${readings.length ? ` (${readings.join(' / ')})` : ''} — ${correctMeaning}.`
      }
    };
  }

  if (type === 'jp-to-reading') {
    const answer = readings[0] || word.surface.trim();
    return {
      question: { id, index, type, prompt: word.surface.trim() },
      answerKey: {
        answer,
        acceptedAnswers: readings,
        readings,
        meanings,
        explanationVi: `${word.surface.trim()} đọc là ${readings.join(' / ')}.`
      }
    };
  }

  return {
    question: { id, index, type, prompt: word.surface.trim() },
    answerKey: {
      answer: word.meaningVi.trim(),
      acceptedAnswers: meanings,
      readings,
      meanings,
        explanationVi: `${word.surface.trim()}${readings.length ? ` (${readings.join(' / ')})` : ''} có nghĩa là ${word.meaningVi.trim()}.`
    }
  };
}

export function generateArenaQuiz(
  inputWords: Word[],
  questionCount: number,
  mode: ArenaQuestionMode,
  random: () => number = Math.random
): ArenaQuestionBundle[] {
  const words = uniqueWords(inputWords);
  const questionTypes: ArenaQuestionType[] =
    mode === 'mixed' ? ['vi-to-jp', 'jp-to-reading', 'jp-to-meaning'] : [mode];
  const availableTypesByWord = eligibleQuestionTypes(words, questionTypes);
  const eligible = words.filter((word) => (availableTypesByWord.get(word.id)?.length ?? 0) > 0);

  const safeCount = questionCount;
  if (!Number.isInteger(questionCount) || safeCount < 1 || safeCount > ARENA_MAX_QUESTIONS || safeCount > eligible.length) {
    throw new ArenaQuestionGenerationError(
      safeCount,
      eligible.length,
      eligible.length === 0
        ? 'Không có đủ từ vựng hợp lệ cho dạng bài đã chọn.'
        : safeCount > ARENA_MAX_QUESTIONS
          ? `Mỗi phòng chỉ hỗ trợ tối đa ${ARENA_MAX_QUESTIONS} câu.`
          : `Dạng bài đã chọn chỉ tạo được tối đa ${eligible.length} câu hợp lệ.`
    );
  }

  return shuffle(eligible, random).slice(0, safeCount).map((word, index) => {
    const availableTypes = availableTypesByWord.get(word.id)!;
    const selectedType = availableTypes[Math.floor(random() * availableTypes.length)]!;
    return makeQuestion(word, index, selectedType, words, random);
  });
}

export function countArenaEligibleWords(
  inputWords: Word[],
  mode: ArenaQuestionMode
): number {
  const words = uniqueWords(inputWords);
  const questionTypes: ArenaQuestionType[] =
    mode === 'mixed' ? ['vi-to-jp', 'jp-to-reading', 'jp-to-meaning'] : [mode];
  const availableTypesByWord = eligibleQuestionTypes(words, questionTypes);
  return words.filter((word) => (availableTypesByWord.get(word.id)?.length ?? 0) > 0).length;
}

export function gradeArenaAnswer(
  questionType: ArenaQuestionType,
  answerKey: ArenaAnswerKey,
  submittedAnswer: string
): boolean {
  if (questionType === 'vi-to-jp') {
    const value = normalizeNfc(submittedAnswer).trim();
    return Boolean(value) && answerKey.acceptedAnswers.includes(value);
  }
  if (questionType === 'jp-to-reading') {
    const value = normalizeArenaReading(submittedAnswer);
    return Boolean(value) && answerKey.acceptedAnswers.some((answer) => normalizeArenaReading(answer) === value);
  }
  const value = normalizeArenaMeaning(submittedAnswer);
  return Boolean(value) && answerKey.acceptedAnswers.some((answer) => normalizeArenaMeaning(answer) === value);
}

export function calculateArenaScore(
  isCorrect: boolean,
  responseTimeMs: number,
  timeLimitSeconds: number,
  submissionGraceMs = ARENA_SUBMISSION_GRACE_MS
): number {
  if (!isCorrect || !Number.isFinite(responseTimeMs) || !Number.isFinite(timeLimitSeconds)) return 0;
  const limitMs = Math.max(0, timeLimitSeconds * 1_000);
  if (limitMs === 0 || responseTimeMs < 0 || responseTimeMs > limitMs + submissionGraceMs) return 0;
  const scoringResponseTimeMs = Math.min(responseTimeMs, limitMs);
  const rawScore = 1_000 * (1 - scoringResponseTimeMs / limitMs);
  return Math.max(300, Math.round(rawScore / 10) * 10);
}

export function rankArenaPlayers<T extends ArenaRankablePlayer>(players: T[]): T[] {
  return [...players].sort((left, right) =>
    right.score - left.score ||
    right.correctCount - left.correctCount ||
    left.totalCorrectResponseMs - right.totalCorrectResponseMs ||
    left.nickname.localeCompare(right.nickname, 'vi')
  );
}
