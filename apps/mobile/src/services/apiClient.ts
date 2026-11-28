import Constants from 'expo-constants';
import {
  KanjiSchema,
  type ConversationHint,
  type ConversationMessage,
  type ConversationReplyResponse,
  type ConversationScenario,
  type ConversationSummary,
  type JlptLevel,
  type Kanji,
  type PolitenessLevel,
  type PracticeTargetWord,
  type SentenceFeedback,
  type SentencePracticeMode
} from '@raku/core';
import { auth } from './firebase';

function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  // Dev-only convenience: derive LAN host from Expo dev server and point to local wrangler dev (:8787)
  if (__DEV__) {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } })
        .manifest2?.extra?.expoClient?.hostUri;
    if (typeof hostUri === 'string' && hostUri.length > 0) {
      const host = hostUri.split(':')[0];
      if (host) {
        return `http://${host}:8787`;
      }
    }
    return 'http://localhost:8787';
  }

  return 'https://rakunihongo-duckwt.pages.dev';
}

async function postAiEndpoint<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Bạn cần đăng nhập (hoặc dùng thử ẩn danh ở tab Hồ sơ) để sử dụng gia sư AI.');
  }

  const baseUrl = resolveApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  const res = await fetch(`${baseUrl}${normalizedPath}`, {
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

export async function enrichKanjiWithAi(
  chars: string[],
  contextWords: Array<{ surface: string; reading?: string; meaningVi?: string }> = []
): Promise<Kanji[]> {
  const uniqueChars = Array.from(new Set(chars.filter(Boolean)));
  if (uniqueChars.length === 0) return [];

  const results: Kanji[] = [];
  const BATCH_SIZE = 25;
  for (let i = 0; i < uniqueChars.length; i += BATCH_SIZE) {
    const chunk = uniqueChars.slice(i, i + BATCH_SIZE);
    const data = await postAiEndpoint<{ kanji?: unknown[] }>('/api/ai/kanji-enrich', {
      chars: chunk,
      contextWords: contextWords.slice(0, 20)
    });
    if (Array.isArray(data.kanji)) {
      for (const item of data.kanji) {
        const parsed = KanjiSchema.safeParse(item);
        if (parsed.success) results.push(parsed.data);
      }
    }
  }
  return results;
}
