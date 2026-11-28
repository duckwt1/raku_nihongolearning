import { KanjiSchema, type Kanji } from '@raku/core';
import { auth } from './firebase';
import { getApiUrl } from './apiClient';

const BATCH_SIZE = 25;

export interface KanjiEnrichContext {
  surface: string;
  reading?: string;
  meaningVi?: string;
}

/**
 * Calls Worker `/api/ai/kanji-enrich` in chunks of up to 25 chars to enrich missing Kanji.
 */
export async function enrichKanjiWithAi(
  chars: string[],
  contextWords: KanjiEnrichContext[] = []
): Promise<Kanji[]> {
  const uniqueChars = Array.from(new Set(chars.filter(Boolean)));
  if (uniqueChars.length === 0) return [];

  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Cần đăng nhập để dùng AI tra cứu Kanji.');
  }

  const results: Kanji[] = [];
  for (let i = 0; i < uniqueChars.length; i += BATCH_SIZE) {
    const chunk = uniqueChars.slice(i, i + BATCH_SIZE);
    const res = await fetch(getApiUrl('/api/ai/kanji-enrich'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        chars: chunk,
        contextWords: contextWords.slice(0, 20)
      })
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }

    const data = (await res.json()) as { kanji?: unknown[] };
    if (Array.isArray(data.kanji)) {
      for (const item of data.kanji) {
        const parsed = KanjiSchema.safeParse(item);
        if (parsed.success) {
          results.push(parsed.data);
        }
      }
    }
  }

  return results;
}
