import type {
  ConversationHint,
  ConversationMessage,
  ConversationReplyResponse,
  ConversationScenario,
  ConversationSummary,
  JlptLevel,
  PolitenessLevel,
  PracticeTargetWord,
  SentenceFeedback,
  SentencePracticeMode
} from '@raku/core';
import { auth } from './firebase';
import { getApiUrl } from './apiClient';

async function postAiEndpoint<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Bạn cần đăng nhập (hoặc bấm Dùng thử ẩn danh ở tab Hồ sơ) để sử dụng gia sư AI.');
  }

  const res = await fetch(getApiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errJson = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errJson.error || `Lỗi máy chủ AI (HTTP ${res.status})`);
  }

  return (await res.json()) as T;
}

export async function checkSentenceWithAi(params: {
  mode: SentencePracticeMode;
  jlpt: JlptLevel;
  politeness: PolitenessLevel;
  promptText: string;
  targetWords?: PracticeTargetWord[];
  targetGrammar?: { pattern: string; meaningVi: string };
  sourceSentence?: string;
  userSentence: string;
}): Promise<SentenceFeedback> {
  const data = await postAiEndpoint<{ feedback: SentenceFeedback }>(
    '/api/ai/sentence-check',
    params
  );
  return data.feedback;
}

export async function sendConversationReply(params: {
  scenario: ConversationScenario;
  targetWords?: PracticeTargetWord[];
  completedMissionIds?: string[];
  history: Array<Pick<ConversationMessage, 'role' | 'textJp'>>;
  userMessage: string;
}): Promise<ConversationReplyResponse> {
  const data = await postAiEndpoint<{ reply: ConversationReplyResponse }>(
    '/api/ai/conversation/reply',
    params
  );
  return data.reply;
}

export async function fetchConversationHint(params: {
  scenario: ConversationScenario;
  targetWords?: PracticeTargetWord[];
  completedMissionIds?: string[];
  history: Array<Pick<ConversationMessage, 'role' | 'textJp'>>;
}): Promise<ConversationHint> {
  const data = await postAiEndpoint<{ hint: ConversationHint }>(
    '/api/ai/conversation/hint',
    params
  );
  return data.hint;
}

export async function fetchConversationSummary(params: {
  scenario: ConversationScenario;
  history: Array<Pick<ConversationMessage, 'role' | 'textJp'>>;
}): Promise<ConversationSummary> {
  const data = await postAiEndpoint<{ summary: ConversationSummary }>(
    '/api/ai/conversation/summary',
    params
  );
  return data.summary;
}
