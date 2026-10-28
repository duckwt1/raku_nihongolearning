import type { Grammar, Question } from '../models/schemas.js';
import { GRAMMAR_BLANK_MARKER } from '../questions/validation.js';

/**
 * Tách câu tiếng Nhật thành các mảnh ghép.
 * Dùng Intl.Segmenter (word granularity) để không phụ thuộc vào khoảng trắng,
 * vì tiếng Nhật thường viết liền. Dấu câu được gắn vào mảnh trước đó.
 */
export function tokenizeJapaneseSentence(sentence: string): string[] {
  const trimmed = sentence.trim();
  if (!trimmed) return [];

  const Segmenter = (Intl as unknown as {
    Segmenter?: new (
      locale: string,
      options: { granularity: string }
    ) => { segment: (text: string) => Iterable<{ segment: string }> };
  }).Segmenter;

  if (typeof Segmenter === 'function') {
    try {
      const segmenter = new Segmenter('ja', { granularity: 'word' });
      const parts = Array.from(segmenter.segment(trimmed), (item) => item.segment);
      const tokens: string[] = [];
      for (const part of parts) {
        if (!part.trim()) continue;
        if (/^[。、？！,!?]+$/.test(part) && tokens.length > 0) {
          tokens[tokens.length - 1] += part;
        } else {
          tokens.push(part);
        }
      }
      if (tokens.length >= 2) return tokens;
    } catch {
      // Fallback bên dưới
    }
  }

  return trimmed
    .replace(/([。、？！])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Lấy các biến thể khóa ngữ pháp từ title, ví dụ "〜てからでないと・〜てからでなければ (...)" */
export function extractGrammarKeys(title: string): string[] {
  const withoutParentheses = title.replace(/\([^)]*\)/g, ' ');
  const keys = withoutParentheses
    .split(/[・/\n]/)
    .map((part) => part.replace(/[〜~]/g, '').replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0);

  return Array.from(new Set(keys));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tìm đoạn text trong câu khớp với một biến thể của title.
 * Hỗ trợ ký hiệu 〜/~/~ trong title như "ほど〜はない".
 */
export function findGrammarSpan(
  sentence: string,
  title: string
): { text: string; index: number } | null {
  const rawParts = title
    .replace(/\([^)]*\)/g, ' ')
    .split(/[・/\n]/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0);

  let best: { text: string; index: number } | null = null;

  for (const rawPart of rawParts) {
    const literal = rawPart.replace(/[〜~]/g, '').trim();
    if (literal) {
      const literalIndex = sentence.indexOf(literal);
      if (literalIndex >= 0 && (!best || literal.length > best.text.length)) {
        best = { text: literal, index: literalIndex };
      }
    }

    // Với title có 〜 ở giữa (ví dụ ほど〜はない), cho phép khớp mọi ký tự ở giữa
    if (/[〜~]/.test(rawPart)) {
      const patternSource = escapeRegExp(rawPart).replace(/[〜~]/g, '.*?');
      const match = sentence.match(new RegExp(patternSource));
      if (match && match.index !== undefined && (!best || match[0].length > best.text.length)) {
        best = { text: match[0], index: match.index };
      }
    }
  }

  return best;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function collectDistractorKeys(allGrammar: Grammar[], answer: string): string[] {
  const result: string[] = [];
  for (const grammar of allGrammar) {
    for (const key of extractGrammarKeys(grammar.title)) {
      if (key === answer || result.includes(key)) continue;
      if (key.length < 2) continue;
      result.push(key);
    }
  }

  if (result.length < 3) {
    for (const fallback of ['〜ながら', '〜ために', '〜ように', '〜たびに']) {
      const key = fallback.replace(/[〜~]/g, '');
      if (key !== answer && !result.includes(key)) result.push(key);
    }
  }

  return result;
}

/**
 * Sinh bài mẫu không cần AI từ ví dụ của một grammar point:
 * - fill_blank nếu tìm thấy chính xác cụm ngữ pháp trong câu ví dụ
 * - order bằng tokenizer tiếng Nhật
 * Đây là bài mẫu tự động, không phải nội dung đã kiểm duyệt.
 */
export function generateSeedGrammarExercises(
  grammar: Grammar,
  allGrammar: Grammar[],
  options: { maxPerType?: number } = {}
): Question[] {
  const maxPerType = options.maxPerType ?? 2;
  const exercises: Question[] = [];
  const seenPrompts = new Set<string>();
  const distractorKeys = collectDistractorKeys(
    allGrammar.filter((item) => item.id !== grammar.id),
    ''
  );

  let fillCount = 0;
  let orderCount = 0;

  for (let index = 0; index < grammar.examples.length; index++) {
    const example = grammar.examples[index];
    if (!example?.jp) continue;

    if (fillCount < maxPerType) {
      const span = findGrammarSpan(example.jp, grammar.title);
      if (span && span.text.length >= 1) {
        const prompt = `${example.jp.slice(0, span.index)}${GRAMMAR_BLANK_MARKER}${example.jp.slice(span.index + span.text.length)}`;
        if (!seenPrompts.has(prompt)) {
          const answer = span.text;
          const distractors = shuffle(
            distractorKeys.filter((key) => key !== answer && !key.includes(answer) && !answer.includes(key))
          ).slice(0, 3);
          const choices = shuffle([answer, ...distractors]);

          exercises.push({
            id: `q_seed_${grammar.id}_fill_${index}`,
            type: 'fill_blank',
            prompt,
            choices,
            answer,
            explanationVi: grammar.explanationVi,
            kanjiRefs: [],
            wordRefs: [],
            grammarRefs: [grammar.id],
            grammarId: grammar.id,
            sourceExample: example.jp,
            difficulty: 2,
            provenance: { origin: 'seed', verified: false, notes: 'Tự động sinh từ câu ví dụ' }
          });
          seenPrompts.add(prompt);
          fillCount++;
        }
      }
    }

    if (orderCount < maxPerType) {
      const tokens = tokenizeJapaneseSentence(example.jp);
      if (tokens.length >= 2) {
        const prompt = 'Sắp xếp các mảnh ghép thành câu đúng.';
        if (!seenPrompts.has(`${prompt}::${example.jp}`)) {
          const hasRealTranslation =
            Boolean(example.vi) && !example.vi.startsWith('Ví dụ minh họa cho mẫu câu');
          exercises.push({
            id: `q_seed_${grammar.id}_order_${index}`,
            type: 'order',
            prompt,
            tokens,
            answer: example.jp,
            explanationVi: `${grammar.explanationVi}${hasRealTranslation ? `\nNghĩa tham khảo: ${example.vi}` : ''}`,
            kanjiRefs: [],
            wordRefs: [],
            grammarRefs: [grammar.id],
            grammarId: grammar.id,
            sourceExample: example.jp,
            difficulty: 2,
            provenance: { origin: 'seed', verified: false, notes: 'Tự động sinh từ câu ví dụ' }
          });
          seenPrompts.add(`${prompt}::${example.jp}`);
          orderCount++;
        }
      }
    }
  }

  return exercises;
}
