import {
  KanjiSchema,
  extractKanjiChars,
  type Kanji
} from '@raku/core';
import type { AiProvider } from './aiProvider.js';
import { sanitizePromptBoundary, stripJsonFence } from './conversationHandlers.js';

export const MAX_KANJI_ENRICH_CHARS = 25;

export interface KanjiEnrichContextWord {
  surface: string;
  reading?: string;
  meaningVi?: string;
}

export type KanjiEnrichResult =
  | { ok: true; data: { kanji: Kanji[] } }
  | { ok: false; status: number; error: string };

function normalizeStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

/**
 * Enriches missing Kanji characters using the configured AI provider and strictly
 * validates each entry against KanjiSchema and the requested character allowlist.
 */
export async function handleKanjiEnrich(
  rawBody: unknown,
  provider: AiProvider
): Promise<KanjiEnrichResult> {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { ok: false, status: 400, error: 'Payload phải là JSON object hợp lệ' };
  }

  const body = rawBody as Record<string, unknown>;
  const rawChars = Array.isArray(body.chars) ? body.chars : [];
  const requestedChars: string[] = [];
  const requestedSet = new Set<string>();

  for (const item of rawChars) {
    if (typeof item !== 'string') continue;
    for (const ch of extractKanjiChars(item)) {
      if (requestedSet.has(ch)) continue;
      requestedSet.add(ch);
      requestedChars.push(ch);
      if (requestedChars.length >= MAX_KANJI_ENRICH_CHARS) break;
    }
    if (requestedChars.length >= MAX_KANJI_ENRICH_CHARS) break;
  }

  if (requestedChars.length === 0) {
    return { ok: false, status: 400, error: 'Cần truyền ít nhất 1 chữ Kanji hợp lệ trong mảng chars.' };
  }

  const rawContext = Array.isArray(body.contextWords) ? body.contextWords : [];
  const contextWords: KanjiEnrichContextWord[] = [];
  for (const item of rawContext.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const surface = typeof rec.surface === 'string' ? rec.surface.trim().slice(0, 40) : '';
    if (!surface) continue;
    contextWords.push({
      surface: sanitizePromptBoundary(surface),
      ...(typeof rec.reading === 'string' && rec.reading.trim()
        ? { reading: sanitizePromptBoundary(rec.reading.trim().slice(0, 60)) }
        : {}),
      ...(typeof rec.meaningVi === 'string' && rec.meaningVi.trim()
        ? { meaningVi: sanitizePromptBoundary(rec.meaningVi.trim().slice(0, 120)) }
        : {})
    });
  }

  const systemPrompt = `Bạn là từ điển chữ Hán (Kanji) Nhật - Việt chuẩn xác cho người Việt học JLPT.
QUY TẮC BẮT BUỘC:
1. Chỉ trả về đúng các chữ Kanji có trong danh sách được yêu cầu, không thêm chữ ngoài danh sách.
2. Trả về JSON thuần (không markdown, không giải thích ngoài JSON) theo cấu trúc:
{
  "kanji": [
    {
      "char": "猫",
      "hanViet": ["MIÊU"],
      "onyomi": ["ビョウ"],
      "kunyomi": ["ねこ"],
      "meaningVi": "con mèo",
      "jlpt": "N3",
      "strokeCount": 11,
      "lookalikes": ["描", "苗"],
      "radicals": ["犭", "苗"]
    }
  ]
}
3. hanViet: viết HOA tiếng Việt (1-2 âm phổ biến nhất).
4. onyomi: viết bằng Katakana; kunyomi: viết bằng Hiragana (có thể để mảng rỗng nếu không phổ biến).
5. jlpt: chỉ dùng "N5", "N4", "N3", "N2", hoặc "N1" (bỏ qua nếu là chữ ngoài JLPT).
6. strokeCount: số nét chuẩn (số nguyên dương).
7. lookalikes: tối đa 3 chữ Kanji dễ nhầm (mỗi phần tử đúng 1 chữ).`;

  const userPrompt = `Hãy cung cấp thông tin từ điển chuẩn cho ${requestedChars.length} chữ Kanji sau:
<<<USER_INPUT>>>
${requestedChars.join(' ')}
${contextWords.length > 0 ? `\nNgữ cảnh từ vựng đi kèm: ${JSON.stringify(contextWords)}` : ''}
<<<END_USER_INPUT>>>`;

  try {
    const rawResult = await provider.generateText({
      systemPrompt,
      userPrompt,
      temperature: 0.2
    });
    const parsed = JSON.parse(stripJsonFence(rawResult)) as unknown;
    const rawItems: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { kanji?: unknown }).kanji)
        ? ((parsed as { kanji: unknown[] }).kanji)
        : [parsed];

    const validKanji: Kanji[] = [];
    const emitted = new Set<string>();

    for (const item of rawItems) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const char = typeof rec.char === 'string' ? rec.char.trim() : '';
      if (!requestedSet.has(char) || emitted.has(char)) continue;

      const rawJlpt = typeof rec.jlpt === 'string' ? rec.jlpt.trim().toUpperCase() : undefined;
      const jlpt =
        rawJlpt && ['N5', 'N4', 'N3', 'N2', 'N1'].includes(rawJlpt) ? rawJlpt : undefined;
      const rawStroke = Number(rec.strokeCount);
      const strokeCount =
        Number.isInteger(rawStroke) && rawStroke > 0 && rawStroke <= 64 ? rawStroke : undefined;

      const candidate = {
        char,
        hanViet: normalizeStringArray(rec.hanViet).map((hv) => hv.toUpperCase()).slice(0, 4),
        onyomi: normalizeStringArray(rec.onyomi).slice(0, 6),
        kunyomi: normalizeStringArray(rec.kunyomi).slice(0, 6),
        meaningVi: typeof rec.meaningVi === 'string' ? rec.meaningVi.trim() : '',
        ...(jlpt ? { jlpt } : {}),
        ...(strokeCount ? { strokeCount } : {}),
        lookalikes: normalizeStringArray(rec.lookalikes)
          .filter((lk) => lk.length === 1 && lk !== char)
          .slice(0, 4),
        radicals: normalizeStringArray(rec.radicals).slice(0, 5),
        source: 'ai' as const
      };

      const check = KanjiSchema.safeParse(candidate);
      if (check.success && check.data.meaningVi.length > 0) {
        emitted.add(char);
        validKanji.push(check.data);
      }
    }

    return { ok: true, data: { kanji: validKanji } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi khi tra cứu Kanji bằng AI';
    return { ok: false, status: 500, error: `Tra cứu Kanji AI thất bại: ${msg}` };
  }
}
