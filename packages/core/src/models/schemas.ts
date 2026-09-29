import { z } from 'zod';

export const JlptLevelSchema = z.enum(['N5', 'N4', 'N3', 'N2', 'N1']);
export type JlptLevel = z.infer<typeof JlptLevelSchema>;

/**
 * Kanji document schema
 */
export const KanjiSchema = z.object({
  char: z.string().length(1),
  hanViet: z.array(z.string()).default([]),
  onyomi: z.array(z.string()).default([]),
  kunyomi: z.array(z.string()).default([]),
  meaningVi: z.string(),
  jlpt: JlptLevelSchema.optional(),
  strokeCount: z.number().int().positive().optional(),
  lookalikes: z.array(z.string()).default([]),
  radicals: z.array(z.string()).default([])
});
export type Kanji = z.infer<typeof KanjiSchema>;

/**
 * Word document schema
 */
export const WordSchema = z.object({
  id: z.string().min(1),
  surface: z.string().min(1),
  readings: z.array(z.string().min(1)).min(1),
  meaningVi: z.string().min(1),
  pos: z.string().optional(), // Part of speech, e.g. 動詞, 名詞
  jlpt: JlptLevelSchema.optional(),
  kanji: z.array(z.string().length(1)).default([]), // Ordered kanji in surface
  hanVietBreakdown: z.array(z.string()).default([]),
  exampleIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([])
});
export type Word = z.infer<typeof WordSchema>;

/**
 * Sentence document schema
 */
export const SentenceSchema = z.object({
  id: z.string().min(1),
  jp: z.string().min(1),
  vi: z.string().min(1),
  tokens: z.array(z.string()).default([]), // For sentence scramble quiz
  wordIds: z.array(z.string()).default([]),
  source: z.string().default('user'),
  license: z.string().optional()
});
export type Sentence = z.infer<typeof SentenceSchema>;

/**
 * Grammar point document schema
 */
export const GrammarSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  explanationVi: z.string().min(1),
  examples: z
    .array(
      z.object({
        jp: z.string(),
        vi: z.string()
      })
    )
    .default([]),
  jlpt: JlptLevelSchema.optional()
});
export type Grammar = z.infer<typeof GrammarSchema>;

/**
 * Question Schema (Section 8.2)
 * Types: K1..K7, fill_blank, order, translate_jp_vi, translate_vi_jp
 */
export const QuestionTypeSchema = z.enum([
  'K1', // Type reading (flashcard)
  'K2', // Choose meaning
  'K3', // Common kanji in 2-3 words
  'K4', // Han Viet <-> Kanji
  'K5', // Word assembly
  'K6', // Reading in context
  'K7', // Fill word into sentence
  'fill_blank',
  'order',
  'translate_jp_vi',
  'translate_vi_jp'
]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const QuestionProvenanceSchema = z.object({
  origin: z.enum(['seed', 'ai', 'user']),
  model: z.string().optional(),
  generatedAt: z.string().optional(),
  verified: z.boolean().default(false),
  notes: z.string().optional()
});
export type QuestionProvenance = z.infer<typeof QuestionProvenanceSchema>;

export const QuestionSchema = z.object({
  id: z.string().min(1),
  type: QuestionTypeSchema,
  prompt: z.string().min(1),
  choices: z.array(z.string()).optional(),
  answer: z.union([z.string(), z.array(z.string())]),
  tokens: z.array(z.string()).optional(), // for 'order' question type
  explanationVi: z.string().default(''),
  kanjiRefs: z.array(z.string()).default([]),
  wordRefs: z.array(z.string()).default([]),
  grammarRefs: z.array(z.string()).default([]),
  difficulty: z.number().int().min(1).max(5).default(1),
  provenance: QuestionProvenanceSchema
});
export type Question = z.infer<typeof QuestionSchema>;

/**
 * Import Record Schema (Section 5B.4)
 */
export const FieldProvenanceSchema = z.enum(['user', 'dictionary', 'ai']);
export type FieldProvenance = z.infer<typeof FieldProvenanceSchema>;

export const ImportRecordSchema = z.object({
  sourceRow: z.number().int().nonnegative(),
  sourceText: z.string(),
  surface: z.string().min(1),
  readings: z.array(z.string()).min(1),
  meaningVi: z.string().min(1),
  hanViet: z.array(z.string()).optional(),
  pos: z.string().optional(),
  jlpt: JlptLevelSchema.optional(),
  exampleJp: z.string().optional(),
  exampleVi: z.string().optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).default(1),
  provenance: z.record(FieldProvenanceSchema).default({}),
  issues: z.array(z.string()).default([])
});
export type ImportRecord = z.infer<typeof ImportRecordSchema>;

/**
 * Folder Schema - for hierarchical organization of Decks (like Anki deck trees)
 */
export const FolderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  parentId: z.string().nullable().default(null),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
export type Folder = z.infer<typeof FolderSchema>;

/**
 * Deck Schema - representing a collection of cards (like Anki decks)
 */
export const DeckSchema = z.object({
  id: z.string().min(1),
  folderId: z.string().nullable().default(null),
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  cardType: z.enum(['word', 'kanji', 'grammar', 'custom', 'mixed']).default('mixed'),
  cardIds: z.array(z.string()).default([]),
  newCardsPerDay: z.number().int().default(20),
  maxReviewsPerDay: z.number().int().default(50),
  isDefault: z.boolean().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
export type Deck = z.infer<typeof DeckSchema>;

/**
 * Daily study statistics
 */
export interface DailyStudyStats {
  date: string; // YYYY-MM-DD
  studySeconds: number; // Time spent studying in seconds
  reviewedCount: number; // Total reviews today
  correctCount: number; // Hard, Good, Easy count
  againCount: number; // Again count
}

export interface UserStudyStats {
  todayStats: DailyStudyStats;
  streakDays: number;
  lastStudiedDate: string; // YYYY-MM-DD
  totalCardsLearned: number;
}
