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
  exampleJp: z.string().optional(),
  exampleVi: z.string().optional(),
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
 * Grammar point document schema (detailed, level-based)
 */
export const GrammarExampleSchema = z.object({
  id: z.string().min(1),
  jp: z.string().min(1),
  vi: z.string().min(1),
  highlight: z.string().optional(),
  breakdown: z.string().optional(),
  note: z.string().optional()
});
export type GrammarExample = z.infer<typeof GrammarExampleSchema>;

export const GrammarFormationSchema = z.object({
  rule: z.string().min(1),
  example: z.string().optional(),
  note: z.string().optional()
});
export type GrammarFormation = z.infer<typeof GrammarFormationSchema>;

export const GrammarUsageSchema = z.object({
  situation: z.string().min(1),
  explanationVi: z.string().min(1),
  exampleIds: z.array(z.string()).default([])
});
export type GrammarUsage = z.infer<typeof GrammarUsageSchema>;

export const GrammarMistakeSchema = z.object({
  mistake: z.string().min(1),
  correction: z.string().min(1),
  explanationVi: z.string().optional()
});
export type GrammarMistake = z.infer<typeof GrammarMistakeSchema>;

export const GrammarComparisonSchema = z.object({
  grammarId: z.string().optional(),
  pattern: z.string().min(1),
  differenceVi: z.string().min(1),
  example: z
    .object({
      jp: z.string().min(1),
      vi: z.string().min(1)
    })
    .optional()
});
export type GrammarComparison = z.infer<typeof GrammarComparisonSchema>;

export const GrammarSchema = z.object({
  id: z.string().min(1),
  jlpt: JlptLevelSchema,
  lesson: z.number().int().positive().optional(),
  order: z.number().int().positive().optional(),

  /** Dạng ngữ pháp tiếng Nhật, ví dụ 〜うちに */
  pattern: z.string().min(1),
  /** Tiêu đề hiển thị, ví dụ 〜うちに (Trong lúc / Trước khi) */
  title: z.string().min(1),
  meaningVi: z.array(z.string().min(1)).min(1),

  explanationVi: z.string().min(1),

  formation: z.array(GrammarFormationSchema).min(1),
  usage: z.array(GrammarUsageSchema).default([]),
  nuanceVi: z.string().optional(),
  notes: z.array(z.string()).default([]),
  commonMistakes: z.array(GrammarMistakeSchema).default([]),
  comparisons: z.array(GrammarComparisonSchema).default([]),

  examples: z.array(GrammarExampleSchema).min(1),
  tags: z.array(z.string()).default([]),
  relatedIds: z.array(z.string()).default([]),
  schemaVersion: z.number().int().positive().default(1),
  updatedAt: z.string().optional()
});
export type Grammar = z.infer<typeof GrammarSchema>;

export const GrammarLevelSchema = z.object({
  level: JlptLevelSchema,
  name: z.string().min(1),
  pointCount: z.number().int().nonnegative().default(0),
  contentVersion: z.number().int().positive().default(1),
  updatedAt: z.string().optional()
});
export type GrammarLevel = z.infer<typeof GrammarLevelSchema>;

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
  /** Folder nội dung có sẵn (JLPT N3) - không cho người dùng xoá */
  isDefault: z.boolean().optional(),
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
  /** Ai đang sở hữu bộ thẻ này: người dùng tạo, tải từ cộng đồng, hay nội dung có sẵn */
  origin: z.enum(['owned', 'community', 'builtin']).default('owned'),
  /** Riêng tư trên máy hay đã chia sẻ lên cộng đồng */
  visibility: z.enum(['community', 'private']).default('private'),
  /** Id document tương ứng trong collection communityDecks (nếu đã chia sẻ) */
  communityDocId: z.string().optional(),
  /** Deck gốc nếu deck này là bản tải từ cộng đồng */
  sourceDeckId: z.string().optional(),
  authorName: z.string().optional(),
  authorUid: z.string().optional(),
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
