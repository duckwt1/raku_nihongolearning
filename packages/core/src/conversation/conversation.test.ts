import { describe, expect, it } from 'vitest';
import { createNewCard } from '../fsrs/scheduler.js';
import type { StudyCard } from '../fsrs/studySession.js';
import { normalizeJapaneseSurface } from '../text/normalize.js';
import {
  QUICK_REPLY_BANK,
  computeQuickReplyProgress,
  pickNextQuickReplyItem
} from './quickReplyBank.js';
import {
  BUILTIN_CONVERSATION_SCENARIOS,
  buildCustomStudyCardFromPhrase,
  isDuplicatePhraseInDeck,
  matchTargetWordsLive,
  pickTargetWordsForPractice
} from './scenarios.js';
import {
  ConversationReplyResponseSchema,
  ConversationScenarioSchema,
  SentenceFeedbackSchema,
  type SentenceAttemptRecord
} from './schemas.js';
import {
  buildGrammarSentencePrompt,
  buildQuickReplyPrompt,
  buildTransformPrompt,
  buildWordSentencePrompt
} from './sentencePrompts.js';

function makeWordCard(
  id: string,
  surface: string,
  reading: string,
  meaningVi: string,
  opts: { deckId?: string; lapses?: number; reps?: number; isDue?: boolean } = {}
): StudyCard {
  const fsrsCard = createNewCard();
  fsrsCard.lapses = opts.lapses ?? 0;
  fsrsCard.reps = opts.reps ?? 0;
  return {
    id,
    type: 'word',
    refId: id,
    deckId: opts.deckId ?? 'deck_1',
    word: {
      id,
      surface,
      readings: [reading],
      meaningVi,
      kanji: [],
      hanVietBreakdown: [],
      exampleIds: [],
      tags: []
    },
    fsrsCard,
    isNew: (opts.reps ?? 0) === 0,
    isDue: opts.isDue ?? false
  };
}

describe('normalizeJapaneseSurface', () => {
  it('strips spaces, full-width spaces, half-width katakana, and brackets', () => {
    expect(normalizeJapaneseSurface(' 「 ｺｰﾋｰ 」 ')).toBe('コーヒー');
    expect(normalizeJapaneseSurface('東京　駅。')).toBe('東京駅');
  });
});

describe('BUILTIN_CONVERSATION_SCENARIOS', () => {
  it('contains 12 valid scenarios covering N5 through N1', () => {
    expect(BUILTIN_CONVERSATION_SCENARIOS.length).toBeGreaterThanOrEqual(12);
    const levels = new Set<string>();
    for (const scenario of BUILTIN_CONVERSATION_SCENARIOS) {
      const parsed = ConversationScenarioSchema.safeParse(scenario);
      expect(parsed.success).toBe(true);
      levels.add(scenario.jlpt);
    }
    expect(levels).toEqual(new Set(['N5', 'N4', 'N3', 'N2', 'N1']));
  });
});

describe('pickTargetWordsForPractice', () => {
  it('prioritizes weak/lapsed words and filters by deckId', () => {
    const cards = [
      makeWordCard('c1', '新しい', 'あたらしい', 'mới', { deckId: 'deck_a', lapses: 0, reps: 0 }),
      makeWordCard('c2', '確認', 'かくにん', 'xác nhận', { deckId: 'deck_a', lapses: 3, reps: 5, isDue: true }),
      makeWordCard('c3', '予定', 'よてい', 'dự định', { deckId: 'deck_b', lapses: 5, reps: 5, isDue: true })
    ];

    const picked = pickTargetWordsForPractice(cards, { deckId: 'deck_a', count: 1 });
    expect(picked).toHaveLength(1);
    expect(picked[0]?.surface).toBe('確認');
  });
});

describe('matchTargetWordsLive', () => {
  const targets = [
    { surface: '食べる', reading: 'たべる', meaningVi: 'ăn' },
    { surface: '確認', reading: 'かくにん', meaningVi: 'xác nhận' },
    { surface: '楽しい', reading: 'たのしい', meaningVi: 'vui' }
  ];

  it('matches conjugated verbs, adjectives, and kana readings', () => {
    expect(matchTargetWordsLive('昨日ラーメンを食べました！', targets)).toContain('食べる');
    expect(matchTargetWordsLive('とても楽しかったです', targets)).toContain('楽しい');
    expect(matchTargetWordsLive('あとでかくにんしますね', targets)).toContain('確認');
  });
});

describe('phrase deduplication & custom study card builder', () => {
  it('detects duplicates ignoring spaces/punctuation and auto-populates Han-Viet', () => {
    const existing = [makeWordCard('c1', '確認', 'かくにん', 'xác nhận', { deckId: 'deck_conv' })];
    expect(isDuplicatePhraseInDeck(' 確認。', 'deck_conv', existing)).toBe(true);
    expect(isDuplicatePhraseInDeck('確認', 'deck_other', existing)).toBe(false);

    const built = buildCustomStudyCardFromPhrase(
      {
        surface: '連絡',
        reading: 'れんらく',
        meaningVi: 'liên lạc',
        exampleJp: '後で連絡します。',
        exampleVi: 'Tôi sẽ liên lạc sau.'
      },
      'deck_conv'
    );
    expect(built.deckId).toBe('deck_conv');
    expect(built.word?.kanji).toEqual(['連', '絡']);
    expect(built.word?.tags).toContain('conversation');
  });
});

describe('sentence prompt builders & response schemas', () => {
  it('builds all 4 sentence practice prompts cleanly', () => {
    const p1 = buildWordSentencePrompt(
      [{ surface: '準備', reading: 'じゅんび', meaningVi: 'chuẩn bị' }],
      'polite',
      'N3'
    );
    expect(p1.mode).toBe('word_builder');
    expect(p1.targetWords).toHaveLength(1);

    const p2 = buildGrammarSentencePrompt(
      {
        id: 'g1',
        jlpt: 'N3',
        pattern: '〜うちに',
        title: '〜うちに',
        meaningVi: ['Trong lúc'],
        formation: [{ rule: 'Vる + うちに' }],
        usage: []
      },
      'polite'
    );
    expect(p2.mode).toBe('grammar_target');
    expect(p2.targetGrammar?.pattern).toBe('〜うちに');

    const p3 = buildTransformPrompt('keigo', 'N2');
    expect(p3.mode).toBe('transform');
    expect(p3.sourceSentence?.jp.length).toBeGreaterThan(0);

    const p4 = buildQuickReplyPrompt('N4', 'polite');
    expect(p4.mode).toBe('quick_reply');
    expect(p4.sourceSentence?.jp.length).toBeGreaterThan(0);
  });

  it('validates SentenceFeedback and ConversationReply schemas', () => {
    const fb = SentenceFeedbackSchema.safeParse({
      isAcceptable: true,
      overallScore: 88,
      scores: { grammar: 4, naturalness: 5, politenessFit: 4 },
      correctedJp: '東京に住んでいます。',
      naturalJp: '今、東京に住んでいます。',
      readingJp: 'いま、とうきょうにすんでいます。',
      explanationVi: 'Dùng trợ từ に với động từ 住む.',
      issues: [],
      suggestedPhrases: []
    });
    expect(fb.success).toBe(true);

    const reply = ConversationReplyResponseSchema.safeParse({
      replyJp: 'いらっしゃいませ！',
      replyReading: 'いらっしゃいませ！',
      replyVi: 'Xin chào quý khách!',
      coach: { status: 'great', noteVi: 'Câu rất tự nhiên!', issues: [] },
      completedMissionIds: ['m1'],
      usedTargetWords: [],
      shouldWrapUp: false
    });
    expect(reply.success).toBe(true);
  });
});

describe('QUICK_REPLY_BANK & >=50 anti-repeat mastery logic', () => {
  it('contains 300+ unique everyday quick-reply prompts across all 10 categories', () => {
    expect(QUICK_REPLY_BANK.length).toBeGreaterThanOrEqual(300);
    const ids = new Set(QUICK_REPLY_BANK.map((q) => q.id));
    expect(ids.size).toBe(QUICK_REPLY_BANK.length);
    const categories = new Set(QUICK_REPLY_BANK.map((q) => q.category));
    expect(categories.size).toBe(10);
  });

  it('excludes prompts with score >= 50 and keeps prompts with score < 50 for retry', () => {
    const n1WorkItems = QUICK_REPLY_BANK.filter((q) => q.jlpt === 'N1' && q.category === 'work');
    expect(n1WorkItems.length).toBeGreaterThanOrEqual(2);

    const passedItem = n1WorkItems[0]!;
    const retryItem = n1WorkItems[1]!;

    const makeAttempt = (promptId: string, score: number): SentenceAttemptRecord => ({
      id: `att_${promptId}_${score}`,
      promptId,
      mode: 'quick_reply',
      jlpt: 'N1',
      politeness: 'any',
      promptText: 'test',
      targetWords: [],
      userSentence: 'はい、承知いたしました。',
      feedback: {
        isAcceptable: score >= 50,
        overallScore: score,
        scores: { grammar: 4, naturalness: 4, politenessFit: 5 },
        correctedJp: 'はい、承知いたしました。',
        naturalJp: 'はい、承知いたしました。',
        readingJp: 'はい、しょうちいたしました。',
        explanationVi: 'ok',
        issues: [],
        suggestedPhrases: []
      },
      createdAt: '2026-11-25T10:00:00.000Z'
    });

    // Mark all items except retryItem as >= 50
    const history: SentenceAttemptRecord[] = n1WorkItems.map((item) =>
      item.id === retryItem.id ? makeAttempt(item.id, 42) : makeAttempt(item.id, 78)
    );

    const progress = computeQuickReplyProgress(history, { jlpt: 'N1', category: 'work' });
    expect(progress.passedIds.has(passedItem.id)).toBe(true);
    expect(progress.retryIds.has(retryItem.id)).toBe(true);
    expect(progress.retryCount).toBe(1);

    const picked = pickNextQuickReplyItem({ jlpt: 'N1', category: 'work', history });
    expect(picked.item.id).toBe(retryItem.id);
    expect(picked.isRetry).toBe(true);
    expect(picked.allPassed).toBe(false);
  });
});
