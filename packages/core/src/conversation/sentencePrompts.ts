import { SEED_SENTENCES } from '../data/index.js';
import type { Grammar, JlptLevel } from '../models/schemas.js';
import {
  QUICK_REPLY_CATEGORY_LABELS,
  pickNextQuickReplyItem
} from './quickReplyBank.js';
import { POLITENESS_LABELS } from './scenarios.js';
import type {
  PolitenessLevel,
  PracticeTargetWord,
  QuickReplyCategory,
  SentenceAttemptRecord,
  SentencePracticeMode
} from './schemas.js';

export interface SentencePracticePrompt {
  id: string;
  /** Stable bank ID for Quick Reply anti-repeat tracking (e.g. qr_daily_001) */
  promptId?: string;
  mode: SentencePracticeMode;
  jlpt: JlptLevel;
  politeness: PolitenessLevel;
  category?: QuickReplyCategory;
  isRetry?: boolean;
  allPassed?: boolean;
  titleVi: string;
  instructionVi: string;
  contextVi: string;
  targetWords: PracticeTargetWord[];
  targetGrammar?: {
    id?: string;
    pattern: string;
    meaningVi: string;
    formationHint?: string;
  };
  sourceSentence?: {
    jp: string;
    readingJp?: string;
    vi: string;
  };
  placeholderJp: string;
}

const WORD_CONTEXT_HINTS: Record<PolitenessLevel, string[]> = {
  any: [
    'Tự do đặt 1 câu tiếng Nhật tự nhiên theo phong cách bạn muốn (thân mật hay lịch sự đều được).',
    'Hãy tưởng tượng một tình huống đời thường hoặc công việc rồi vận dụng từ vào câu hoàn chỉnh.',
    'Viết một câu ngắn gọn, đúng ngữ pháp mà người Nhật thực tế sẽ nói.'
  ],
  casual: [
    'Tưởng tượng bạn đang nhắn tin hoặc trò chuyện cùng bạn thân.',
    'Kể ngắn gọn về một trải nghiệm gần đây của bạn với bạn cùng lớp.',
    'Đưa ra một lời rủ rê hoặc ý kiến cá nhân một cách tự nhiên.'
  ],
  polite: [
    'Đặt một câu lịch sự bạn có thể dùng trong giao tiếp hàng ngày tại Nhật.',
    'Tưởng tượng bạn đang giải thích hoặc hỏi thăm một người mới quen / đồng nghiệp.',
    'Viết một câu hoàn chỉnh phù hợp khi trò chuyện tại trường học hoặc cửa hàng.'
  ],
  keigo: [
    'Tưởng tượng bạn đang báo cáo, nhờ vả hoặc trao đổi với cấp trên / khách hàng.',
    'Đặt một câu trang trọng phù hợp trong email hoặc cuộc họp công ty Nhật.'
  ]
};

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function buildWordSentencePrompt(
  targetWords: PracticeTargetWord[],
  politeness: PolitenessLevel = 'any',
  jlpt: JlptLevel = 'N3'
): SentencePracticePrompt {
  const words = targetWords.slice(0, 3);
  const wordListLabel = words.map((w) => w.surface).join('、');
  const style = POLITENESS_LABELS[politeness];
  const politenessNote =
    politeness === 'any'
      ? ' (tự do chọn thể thân mật, lịch sự hay kính ngữ tuỳ bạn)'
      : ` ở mức ${style.label} (${style.jp})`;

  return {
    id: `sp_word_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    mode: 'word_builder',
    jlpt,
    politeness,
    titleVi: `Đặt câu với ${words.length} từ vựng`,
    instructionVi: `Hãy viết một câu tiếng Nhật hoàn chỉnh sử dụng ${words.length === 1 ? 'từ' : 'các từ'} 「${wordListLabel}」${politenessNote}.`,
    contextVi: pickRandom(WORD_CONTEXT_HINTS[politeness]),
    targetWords: words,
    placeholderJp: 'Nhập hoặc nói câu tiếng Nhật của bạn...'
  };
}

export function buildGrammarSentencePrompt(
  grammar: Pick<Grammar, 'id' | 'pattern' | 'title' | 'meaningVi' | 'jlpt' | 'formation' | 'usage'>,
  politeness: PolitenessLevel = 'any',
  optionalWords: PracticeTargetWord[] = []
): SentencePracticePrompt {
  const style = POLITENESS_LABELS[politeness];
  const meaning = Array.isArray(grammar.meaningVi) ? grammar.meaningVi.join(' / ') : '';
  const usageHint = grammar.usage?.[0]?.explanationVi || grammar.usage?.[0]?.situation;
  const formationHint = grammar.formation?.[0]?.rule;
  const politenessNote =
    politeness === 'any' ? '' : ` ở mức ${style.label} (${style.jp})`;

  return {
    id: `sp_gram_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    mode: 'grammar_target',
    jlpt: grammar.jlpt,
    politeness,
    titleVi: `Đặt câu với mẫu ${grammar.pattern}`,
    instructionVi: `Đặt 1 câu tự nhiên áp dụng mẫu ngữ pháp 「${grammar.pattern}」 (${meaning})${politenessNote}.`,
    contextVi: usageHint || `Tự chọn bối cảnh đời sống hoặc công việc phù hợp với sắc thái của ${grammar.pattern}.`,
    targetWords: optionalWords.slice(0, 2),
    targetGrammar: {
      id: grammar.id,
      pattern: grammar.pattern,
      meaningVi: meaning,
      formationHint
    },
    placeholderJp: `Ví dụ đặt câu có chứa ${grammar.pattern}...`
  };
}

export function buildTransformPrompt(
  targetPoliteness: PolitenessLevel,
  jlpt: JlptLevel,
  customSource?: { jp: string; vi: string }
): SentencePracticePrompt {
  const effectivePoliteness: PolitenessLevel =
    targetPoliteness === 'any' ? 'polite' : targetPoliteness;
  const source =
    customSource ||
    (SEED_SENTENCES.length > 0
      ? pickRandom(SEED_SENTENCES)
      : { jp: '明日、友達と映画を見に行きます。', vi: 'Ngày mai tôi đi xem phim với bạn.' });
  const style = POLITENESS_LABELS[effectivePoliteness];

  return {
    id: `sp_trans_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    mode: 'transform',
    jlpt,
    politeness: effectivePoliteness,
    titleVi: `Biến hóa sang ${style.label} (${style.jp})`,
    instructionVi: `Hãy viết lại câu gốc bên dưới sang sắc thái ${style.label} (${style.jp}) sao cho giữ nguyên ý chính nhưng tự nhiên nhất.`,
    contextVi: style.desc,
    targetWords: [],
    sourceSentence: {
      jp: source.jp,
      vi: source.vi
    },
    placeholderJp: 'Viết lại câu theo phong cách yêu cầu...'
  };
}

export function buildQuickReplyPrompt(
  jlpt: JlptLevel | 'all' = 'all',
  politeness: PolitenessLevel = 'any',
  optionalWords: PracticeTargetWord[] = [],
  options: {
    category?: QuickReplyCategory | 'all';
    history?: SentenceAttemptRecord[];
    currentPromptId?: string;
    ignoredPassedIds?: Set<string>;
  } = {}
): SentencePracticePrompt {
  const { item, allPassed, isRetry } = pickNextQuickReplyItem({
    jlpt,
    category: options.category,
    history: options.history,
    currentPromptId: options.currentPromptId,
    ignoredPassedIds: options.ignoredPassedIds
  });

  const catLabel = QUICK_REPLY_CATEGORY_LABELS[item.category];

  return {
    id: `sp_reply_${item.id}_${Date.now()}`,
    promptId: item.id,
    mode: 'quick_reply',
    jlpt: item.jlpt,
    politeness,
    category: item.category,
    isRetry,
    allPassed,
    titleVi: `Phản xạ nhanh · ${catLabel}`,
    instructionVi:
      'Đọc hoặc nghe câu tiếng Nhật bên dưới rồi trả lời tự nhiên theo ý bạn (tự do thể thân mật hay lịch sự).',
    contextVi: item.contextVi,
    targetWords: optionalWords.slice(0, 1),
    sourceSentence: {
      jp: item.questionJp,
      readingJp: item.readingJp,
      vi: item.questionVi
    },
    placeholderJp: 'Gõ hoặc nói câu trả lời phản xạ của bạn...'
  };
}
