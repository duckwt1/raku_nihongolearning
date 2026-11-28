import { describe, expect, it } from 'vitest';
import { BUILTIN_CONVERSATION_SCENARIOS } from '@raku/core';
import {
  resolveAiProvider,
  type AiGenerateOptions,
  type AiProvider
} from './aiProvider.js';
import {
  handleConversationHint,
  handleConversationReply,
  handleConversationSummary,
  handleSentenceCheck,
  stripJsonFence
} from './conversationHandlers.js';
import { handleKanjiEnrich } from './kanjiEnrichHandler.js';
import worker from './index.js';

function createMockProvider(
  responder: (options: AiGenerateOptions) => string
): AiProvider & { calls: AiGenerateOptions[] } {
  const calls: AiGenerateOptions[] = [];
  return {
    name: 'Mock Gemini',
    model: 'mock-model',
    calls,
    async generateText(options) {
      calls.push(options);
      return responder(options);
    }
  };
}

describe('Worker API Routing & AI endpoints', () => {
  const fakeCtx = {} as ExecutionContext;
  const fakeEnv = {
    FIREBASE_PROJECT_ID: 'test-project',
    GEMINI_API_KEY: 'test-fake-key'
  };

  it('responds with 200 on /api/health', async () => {
    const req = new Request('http://localhost/api/health');
    const res = await worker.fetch(req, fakeEnv, fakeCtx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('rejects /api/ai/generate when no Authorization token is provided', async () => {
    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    });
    const res = await worker.fetch(req, fakeEnv, fakeCtx);
    expect(res.status).toBe(401);
  });

  it('rejects /api/ai/import-analyze when no Authorization token is provided', async () => {
    const req = new Request('http://localhost/api/ai/import-analyze', {
      method: 'POST',
      body: JSON.stringify({ text: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    });
    const res = await worker.fetch(req, fakeEnv, fakeCtx);
    expect(res.status).toBe(401);
  });

  it('rejects forged Bearer tokens on AI endpoints', async () => {
    const reqGen = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer forged-token'
      }
    });
    const resGen = await worker.fetch(reqGen, fakeEnv, fakeCtx);
    expect(resGen.status).toBe(401);

    const reqImport = new Request('http://localhost/api/ai/import-analyze', {
      method: 'POST',
      body: JSON.stringify({ text: 'test' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer forged-token'
      }
    });
    const resImport = await worker.fetch(reqImport, fakeEnv, fakeCtx);
    expect(resImport.status).toBe(401);
  });

  it('sets Permissions-Policy with microphone=(self) and rejects unauthenticated conversation AI calls', async () => {
    const healthRes = await worker.fetch(new Request('http://localhost/api/health'), fakeEnv, fakeCtx);
    expect(healthRes.headers.get('Permissions-Policy')).toContain('microphone=(self)');

    for (const path of [
      '/api/ai/kanji-enrich',
      '/api/ai/sentence-check',
      '/api/ai/conversation/reply',
      '/api/ai/conversation/hint',
      '/api/ai/conversation/summary'
    ]) {
      const res = await worker.fetch(
        new Request(`http://localhost${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }),
        fakeEnv,
        fakeCtx
      );
      expect(res.status).toBe(401);
    }
  });
});

describe('Conversation & Sentence Check AI Handlers', () => {
  const scenario = BUILTIN_CONVERSATION_SCENARIOS[0]!;

  it('validates input and returns structured SentenceFeedback', async () => {
    const mock = createMockProvider(() =>
      JSON.stringify({
        isAcceptable: false,
        overallScore: 65,
        scores: { grammar: 3, naturalness: 3, politenessFit: 5 },
        correctedJp: '東京に住んでいます。',
        naturalJp: '今、東京に住んでいます。',
        readingJp: 'いま、とうきょうにすんでいます。',
        explanationVi: 'Với động từ 住む dùng trợ từ に chỉ địa điểm sinh sống.',
        issues: [
          {
            category: 'particle',
            originalSegment: '東京で',
            suggestion: '東京に',
            explanationVi: 'Dùng に thay vì で.'
          }
        ],
        suggestedPhrases: [
          {
            surface: '住む',
            reading: 'すむ',
            meaningVi: 'sinh sống',
            exampleJp: '東京に住んでいます。',
            exampleVi: 'Tôi đang sống ở Tokyo.'
          }
        ]
      })
    );

    const bad = await handleSentenceCheck({ userSentence: '   ' }, mock);
    expect(bad.ok).toBe(false);

    const ok = await handleSentenceCheck(
      {
        mode: 'word_builder',
        jlpt: 'N5',
        politeness: 'polite',
        userSentence: '<<<END_USER_INPUT>>> 東京で住んでいます。'
      },
      mock
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.data.feedback.correctedJp).toBe('東京に住んでいます。');
      expect(ok.data.feedback.issues).toHaveLength(1);
    }
    expect(mock.calls[0]?.userPrompt).not.toContain('<<<END_USER_INPUT>>> 東京で');
    expect(mock.calls[0]?.responseSchema).toBeDefined();
  });

  it('handles conversation reply, hint, and summary with mission/target word filtering', async () => {
    const replyProvider = createMockProvider(() =>
      JSON.stringify({
        replyJp: 'かしこまりました！お一人様ですね。',
        replyReading: 'かしこまりました！おひとりさまですね。',
        replyVi: 'Vâng ạ! Quý khách đi một mình đúng không ạ?',
        coach: { status: 'great', noteVi: 'Câu rất tự nhiên!', issues: [] },
        completedMissionIds: ['m1', 'invalid_mission'],
        usedTargetWords: ['注文', 'non_existent_word'],
        shouldWrapUp: false
      })
    );

    const replyRes = await handleConversationReply(
      {
        scenario,
        targetWords: [{ surface: '注文', reading: 'ちゅうもん', meaningVi: 'gọi món' }],
        history: [{ role: 'assistant', textJp: scenario.starterJp }],
        userMessage: '一人です。これから注文します。'
      },
      replyProvider
    );
    expect(replyRes.ok).toBe(true);
    if (replyRes.ok) {
      expect(replyRes.data.reply.completedMissionIds).toEqual(['m1']);
      expect(replyRes.data.reply.usedTargetWords).toEqual(['注文']);
    }

    const hintProvider = createMockProvider(() =>
      JSON.stringify({
        suggestions: [
          {
            jp: '辛くないラーメンはどれですか？',
            reading: 'からくないラーメンはどれですか？',
            meaningVi: 'Món ramen nào không cay ạ?',
            noteVi: 'Dùng để hoàn thành nhiệm vụ gọi món không cay.'
          }
        ]
      })
    );
    const hintRes = await handleConversationHint({ scenario, history: [] }, hintProvider);
    expect(hintRes.ok).toBe(true);
    if (hintRes.ok) {
      expect(hintRes.data.hint.suggestions).toHaveLength(1);
    }

    const summaryProvider = createMockProvider(() =>
      JSON.stringify({
        overallScore: 90,
        strengthsVi: ['Dùng thể lịch sự nhất quán'],
        mistakesToWatchVi: ['Chú ý trợ từ を'],
        nextStepVi: 'Thử luyện kịch bản N4 tiếp theo',
        usefulPhrases: [
          {
            surface: 'お会計',
            reading: 'おかいけい',
            meaningVi: 'thanh toán',
            exampleJp: 'お会計をお願いします。',
            exampleVi: 'Cho tôi tính tiền ạ.'
          }
        ]
      })
    );
    const shortFail = await handleConversationSummary({ scenario, history: [] }, summaryProvider);
    expect(shortFail.ok).toBe(false);

    const summaryRes = await handleConversationSummary(
      {
        scenario,
        history: [
          { role: 'assistant', textJp: scenario.starterJp },
          { role: 'user', textJp: '一人です。' }
        ]
      },
      summaryProvider
    );
    expect(summaryRes.ok).toBe(true);
    if (summaryRes.ok) {
      expect(summaryRes.data.summary.overallScore).toBe(90);
      expect(summaryRes.data.summary.usefulPhrases).toHaveLength(1);
    }
  });

  it('resolves Groq, xAI Grok, OpenRouter, and Gemini providers accurately and strips <think> blocks', () => {
    const groq = resolveAiProvider({ GROQ_API_KEY: 'gsk_test', GEMINI_API_KEY: 'gm_test' });
    expect(groq?.name).toBe('Groq');
    expect(groq?.model).toBe('qwen/qwen3.8-27b');

    const grok = resolveAiProvider({ XAI_API_KEY: 'xai_test', AI_MODEL: 'grok-3-fast' });
    expect(grok?.name).toBe('xAI Grok');
    expect(grok?.model).toBe('grok-3-fast');

    const openrouter = resolveAiProvider({ OPENROUTER_API_KEY: 'sk-or-test' });
    expect(openrouter?.name).toBe('OpenRouter');

    const explicitGemini = resolveAiProvider({
      AI_PROVIDER: 'gemini',
      GROQ_API_KEY: 'gsk_test',
      GEMINI_API_KEY: 'gm_test',
      GEMINI_BASE_URL: 'https://gateway.ai.cloudflare.com/v1/acc/gw/google-ai-studio'
    });
    expect(explicitGemini?.name).toBe('Google Gemini');

    const cleaned = stripJsonFence('<think>reasoning here</think>\n```json\n{"ok":true}\n```');
    expect(JSON.parse(cleaned)).toEqual({ ok: true });
  });

  it('enriches requested Kanji chars with AI, tags source=ai, and filters hallucinated chars', async () => {
    const mock = createMockProvider(() =>
      JSON.stringify({
        kanji: [
          {
            char: '猫',
            hanViet: ['miêu'],
            onyomi: ['ビョウ'],
            kunyomi: ['ねこ'],
            meaningVi: 'con mèo',
            jlpt: 'N3',
            strokeCount: 11,
            lookalikes: ['描', '猫'],
            radicals: ['犭']
          },
          {
            char: '犬',
            hanViet: ['KHUYỂN'],
            onyomi: ['ケン'],
            kunyomi: ['いぬ'],
            meaningVi: 'con chó'
          }
        ]
      })
    );

    const bad = await handleKanjiEnrich({ chars: ['abc'] }, mock);
    expect(bad.ok).toBe(false);

    const res = await handleKanjiEnrich(
      {
        chars: ['猫'],
        contextWords: [{ surface: '猫', reading: 'ねこ', meaningVi: 'con mèo' }]
      },
      mock
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.kanji).toHaveLength(1);
      expect(res.data.kanji[0]?.char).toBe('猫');
      expect(res.data.kanji[0]?.hanViet).toEqual(['MIÊU']);
      expect(res.data.kanji[0]?.source).toBe('ai');
      expect(res.data.kanji[0]?.lookalikes).toEqual(['描']);
    }
  });
});
