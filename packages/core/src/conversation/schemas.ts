import { z } from 'zod';
import { JlptLevelSchema } from '../models/schemas.js';

export const PolitenessLevelSchema = z.enum(['any', 'casual', 'polite', 'keigo']);
export type PolitenessLevel = z.infer<typeof PolitenessLevelSchema>;

export const QuickReplyCategorySchema = z.enum([
  'daily',
  'dining',
  'shopping',
  'travel',
  'friends',
  'work',
  'study',
  'health',
  'home',
  'social'
]);
export type QuickReplyCategory = z.infer<typeof QuickReplyCategorySchema>;

export const SentencePracticeModeSchema = z.enum([
  'word_builder',
  'grammar_target',
  'transform',
  'quick_reply'
]);
export type SentencePracticeMode = z.infer<typeof SentencePracticeModeSchema>;

export const SavedPhraseCandidateSchema = z.object({
  surface: z.string().min(1),
  reading: z.string().min(1),
  meaningVi: z.string().min(1),
  hanViet: z.string().optional(),
  exampleJp: z.string().default(''),
  exampleVi: z.string().default(''),
  pos: z.string().optional()
});
export type SavedPhraseCandidate = z.infer<typeof SavedPhraseCandidateSchema>;

export const SentenceIssueCategorySchema = z.enum([
  'grammar',
  'particle',
  'word_choice',
  'politeness',
  'naturalness',
  'spelling'
]);
export type SentenceIssueCategory = z.infer<typeof SentenceIssueCategorySchema>;

export const SentenceIssueSchema = z.object({
  category: SentenceIssueCategorySchema,
  originalSegment: z.string().default(''),
  suggestion: z.string().default(''),
  explanationVi: z.string().min(1)
});
export type SentenceIssue = z.infer<typeof SentenceIssueSchema>;

export const SentenceScoresSchema = z.object({
  grammar: z.number().min(1).max(5),
  naturalness: z.number().min(1).max(5),
  politenessFit: z.number().min(1).max(5)
});
export type SentenceScores = z.infer<typeof SentenceScoresSchema>;

export const SentenceFeedbackSchema = z.object({
  isAcceptable: z.boolean(),
  overallScore: z.number().min(0).max(100),
  scores: SentenceScoresSchema,
  correctedJp: z.string().min(1),
  naturalJp: z.string().min(1),
  readingJp: z.string().default(''),
  explanationVi: z.string().min(1),
  alternativeJp: z.string().optional(),
  issues: z.array(SentenceIssueSchema).default([]),
  suggestedPhrases: z.array(SavedPhraseCandidateSchema).default([])
});
export type SentenceFeedback = z.infer<typeof SentenceFeedbackSchema>;

export const PracticeTargetWordSchema = z.object({
  cardId: z.string().optional(),
  surface: z.string().min(1),
  reading: z.string().min(1),
  meaningVi: z.string().min(1)
});
export type PracticeTargetWord = z.infer<typeof PracticeTargetWordSchema>;

export const SentenceAttemptRecordSchema = z.object({
  id: z.string().min(1),
  promptId: z.string().optional(),
  mode: SentencePracticeModeSchema,
  jlpt: JlptLevelSchema,
  politeness: PolitenessLevelSchema,
  promptText: z.string().min(1),
  targetWords: z.array(PracticeTargetWordSchema).default([]),
  targetGrammar: z
    .object({
      id: z.string().optional(),
      pattern: z.string().min(1),
      meaningVi: z.string().default('')
    })
    .optional(),
  sourceSentence: z.string().optional(),
  userSentence: z.string().min(1),
  feedback: SentenceFeedbackSchema,
  createdAt: z.string().min(1)
});
export type SentenceAttemptRecord = z.infer<typeof SentenceAttemptRecordSchema>;

export const ConversationMissionSchema = z.object({
  id: z.string().min(1),
  titleVi: z.string().min(1),
  hintJp: z.string().optional()
});
export type ConversationMission = z.infer<typeof ConversationMissionSchema>;

export const ConversationCategorySchema = z.enum([
  'daily',
  'travel',
  'dining',
  'health',
  'campus',
  'work',
  'custom'
]);
export type ConversationCategory = z.infer<typeof ConversationCategorySchema>;

export const ConversationScenarioSchema = z.object({
  id: z.string().min(1),
  titleVi: z.string().min(1),
  titleJp: z.string().min(1),
  jlpt: JlptLevelSchema,
  category: ConversationCategorySchema,
  politeness: PolitenessLevelSchema,
  aiRoleVi: z.string().min(1),
  aiRoleJp: z.string().min(1),
  userRoleVi: z.string().min(1),
  settingVi: z.string().min(1),
  missions: z.array(ConversationMissionSchema).min(1),
  starterJp: z.string().min(1),
  starterReading: z.string().default(''),
  starterVi: z.string().min(1),
  isCustom: z.boolean().optional()
});
export type ConversationScenario = z.infer<typeof ConversationScenarioSchema>;

export const InlineCoachSchema = z.object({
  status: z.enum(['great', 'minor', 'fix']),
  naturalJp: z.string().optional(),
  noteVi: z.string().min(1),
  issues: z.array(SentenceIssueSchema).default([])
});
export type InlineCoach = z.infer<typeof InlineCoachSchema>;

export const ConversationMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['assistant', 'user']),
  textJp: z.string().min(1),
  readingJp: z.string().optional(),
  meaningVi: z.string().optional(),
  createdAt: z.string().min(1),
  coach: InlineCoachSchema.optional(),
  completedMissionIds: z.array(z.string()).optional(),
  usedTargetWords: z.array(z.string()).optional()
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const ConversationReplyResponseSchema = z.object({
  replyJp: z.string().min(1),
  replyReading: z.string().default(''),
  replyVi: z.string().min(1),
  coach: InlineCoachSchema,
  completedMissionIds: z.array(z.string()).default([]),
  usedTargetWords: z.array(z.string()).default([]),
  shouldWrapUp: z.boolean().default(false)
});
export type ConversationReplyResponse = z.infer<typeof ConversationReplyResponseSchema>;

export const ConversationHintItemSchema = z.object({
  jp: z.string().min(1),
  reading: z.string().default(''),
  meaningVi: z.string().min(1),
  noteVi: z.string().default('')
});
export type ConversationHintItem = z.infer<typeof ConversationHintItemSchema>;

export const ConversationHintSchema = z.object({
  suggestions: z.array(ConversationHintItemSchema).min(1)
});
export type ConversationHint = z.infer<typeof ConversationHintSchema>;

export const ConversationSummarySchema = z.object({
  overallScore: z.number().min(0).max(100),
  strengthsVi: z.array(z.string()).default([]),
  mistakesToWatchVi: z.array(z.string()).default([]),
  nextStepVi: z.string().default(''),
  usefulPhrases: z.array(SavedPhraseCandidateSchema).default([])
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const ConversationSessionSchema = z.object({
  id: z.string().min(1),
  scenarioId: z.string().min(1),
  scenario: ConversationScenarioSchema,
  targetWords: z.array(PracticeTargetWordSchema).default([]),
  messages: z.array(ConversationMessageSchema).default([]),
  completedMissionIds: z.array(z.string()).default([]),
  usedTargetWords: z.array(z.string()).default([]),
  status: z.enum(['active', 'completed']).default('active'),
  summary: ConversationSummarySchema.optional(),
  startedAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type ConversationSession = z.infer<typeof ConversationSessionSchema>;
