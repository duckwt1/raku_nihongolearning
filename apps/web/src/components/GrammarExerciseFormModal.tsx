import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Save, X } from 'lucide-react';
import {
  GRAMMAR_BLANK_MARKER,
  extractGrammarKeys,
  tokenizeJapaneseSentence,
  validateGrammarExercise,
  type Grammar,
  type GrammarExerciseRecord,
  type Question
} from '@raku/core';
import { buildGrammarExerciseRecord } from '../services/grammarExerciseStore';

export type EditableExerciseType =
  | 'fill_blank'
  | 'order'
  | 'translate_jp_vi'
  | 'translate_vi_jp'
  | 'K7';

interface GrammarExerciseFormModalProps {
  isOpen: boolean;
  grammar: Grammar;
  allGrammar: Grammar[];
  ownerUid?: string | null;
  authorName?: string;
  canPublish: boolean;
  editing?: GrammarExerciseRecord | null;
  initialDraft?: Question | null;
  onClose: () => void;
  onSave: (
    record: GrammarExerciseRecord,
    options: { publish: boolean }
  ) => Promise<void> | void;
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitTokens(text: string): string[] {
  return text
    .split('|')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function GrammarExerciseFormModal({
  isOpen,
  grammar,
  allGrammar,
  ownerUid,
  authorName,
  canPublish,
  editing,
  initialDraft,
  onClose,
  onSave
}: GrammarExerciseFormModalProps) {
  const [type, setType] = useState<EditableExerciseType>('fill_blank');
  const [sentence, setSentence] = useState('');
  const [blankAnswer, setBlankAnswer] = useState('');
  const [prompt, setPrompt] = useState('');
  const [choicesText, setChoicesText] = useState('');
  const [correctChoice, setCorrectChoice] = useState('');
  const [orderSentence, setOrderSentence] = useState('');
  const [tokensText, setTokensText] = useState('');
  const [translatePrompt, setTranslatePrompt] = useState('');
  const [translateAnswers, setTranslateAnswers] = useState('');
  const [explanationVi, setExplanationVi] = useState('');
  const [difficulty, setDifficulty] = useState(2);
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const editingType = (editing?.type as EditableExerciseType | undefined) ?? null;

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsSaving(false);

    const source = editing ?? initialDraft;
    if (!source) {
      setType('fill_blank');
      setSentence('');
      setBlankAnswer('');
      setPrompt('');
      setChoicesText('');
      setCorrectChoice('');
      setOrderSentence('');
      setTokensText('');
      setTranslatePrompt('');
      setTranslateAnswers('');
      setExplanationVi('');
      setDifficulty(2);
      setPublish(false);
      return;
    }

    const question = source as Question & { visibility?: 'private' | 'public' };
    const nextType = (question.type as EditableExerciseType) || 'fill_blank';
    setType(nextType);
    setExplanationVi(question.explanationVi || '');
    setDifficulty(question.difficulty || 2);
    setPublish(question.visibility === 'public' || editing?.visibility === 'public');

    if (nextType === 'fill_blank') {
      const answer = typeof question.answer === 'string' ? question.answer : '';
      const sourceSentence =
        question.sourceExample ||
        (answer ? question.prompt.replace(GRAMMAR_BLANK_MARKER, answer) : question.prompt);
      setSentence(sourceSentence);
      setBlankAnswer(answer);
      setPrompt(
        answer && sourceSentence.includes(answer)
          ? sourceSentence.replace(answer, GRAMMAR_BLANK_MARKER)
          : sourceSentence
      );
      setChoicesText(
        (question.choices || []).filter((choice) => choice !== answer).join('\n')
      );
      setCorrectChoice('');
      setOrderSentence('');
      setTokensText('');
      setTranslatePrompt('');
      setTranslateAnswers('');
      return;
    }

    if (nextType === 'order') {
      setOrderSentence(typeof question.answer === 'string' ? question.answer : '');
      setTokensText((question.tokens || []).join(' | '));
      setPrompt(question.prompt || '');
      setSentence('');
      setBlankAnswer('');
      setChoicesText('');
      setCorrectChoice('');
      setTranslatePrompt('');
      setTranslateAnswers('');
      return;
    }

    setPrompt(question.prompt);
    setChoicesText((question.choices || []).join('\n'));
    setCorrectChoice(
      typeof question.answer === 'string' ? question.answer : question.answer[0] || ''
    );
    setTranslatePrompt(question.prompt);
    setTranslateAnswers(
      Array.isArray(question.answer) ? question.answer.join('\n') : question.answer
    );
    setSentence('');
    setBlankAnswer('');
    setOrderSentence('');
    setTokensText('');
  }, [isOpen, editing, initialDraft]);

  const choices = useMemo(() => splitLines(choicesText), [choicesText]);
  const baseProvenance =
    editing?.provenance ||
    initialDraft?.provenance ||
    ({ origin: 'user', verified: true } as const);
  const provenance = { ...baseProvenance, verified: true };
  const generatedDistractors = useMemo(() => {
    const answer = blankAnswer.trim();
    const result: string[] = [];
    for (const item of allGrammar) {
      if (item.id === grammar.id) continue;
      for (const key of extractGrammarKeys(item.title)) {
        if (key === answer || key.length < 2 || result.includes(key)) continue;
        result.push(key);
      }
    }
    return result;
  }, [allGrammar, grammar.id, blankAnswer]);

  if (!isOpen) return null;

  const handleAutoTokenize = () => {
    if (!orderSentence.trim()) return;
    setTokensText(tokenizeJapaneseSentence(orderSentence).join(' | '));
  };

  const handleBlankFromSentence = () => {
    if (!sentence.trim() || !blankAnswer.trim()) return;
    if (!sentence.includes(blankAnswer.trim())) {
      setError('Đáp án không xuất hiện trong câu. Hãy nhập đúng phần cần điền.');
      return;
    }
    setError(null);
    setPrompt(sentence.replace(blankAnswer.trim(), GRAMMAR_BLANK_MARKER));
  };

  const buildQuestion = (): Question => {
    let builtPrompt = prompt;
    let answer: string | string[] = '';
    let builtChoices: string[] | undefined;

    if (type === 'fill_blank') {
      const trimmedAnswer = blankAnswer.trim();
      if (!sentence.includes(trimmedAnswer)) {
        throw new Error('Đáp án không xuất hiện trong câu.');
      }
      builtPrompt = sentence.replace(trimmedAnswer, GRAMMAR_BLANK_MARKER);
      answer = trimmedAnswer;
      const uniqueDistractors = Array.from(
        new Set([
          ...choices.filter((choice) => choice !== trimmedAnswer),
          ...generatedDistractors.filter((choice) => choice !== trimmedAnswer)
        ])
      );
      builtChoices = [trimmedAnswer, ...uniqueDistractors.slice(0, 3)];
    } else if (type === 'order') {
      const tokens = splitTokens(tokensText);
      if (tokens.length < 2) {
        throw new Error('Cần ít nhất 2 mảnh ghép. Bấm "Tách từ" hoặc nhập cách nhau bằng dấu |.');
      }
      answer = orderSentence.trim() || tokens.join('');
      builtPrompt = prompt.trim() || 'Sắp xếp các mảnh ghép thành câu đúng.';
      return {
        id: editing?.id || `q_temp_${Date.now()}`,
        type: 'order',
        prompt: builtPrompt,
        tokens,
        answer,
        explanationVi: explanationVi.trim(),
        kanjiRefs: [],
        wordRefs: [],
        grammarRefs: [grammar.id],
        grammarId: grammar.id,
        sourceExample: orderSentence.trim() || undefined,
        difficulty,
        provenance
      };
    } else if (type === 'translate_jp_vi' || type === 'translate_vi_jp') {
      const answers = splitLines(translateAnswers);
      if (!translatePrompt.trim() || answers.length === 0) {
        throw new Error('Cần nhập câu nguồn và ít nhất một đáp án.');
      }
      answer = answers.length === 1 ? answers[0]! : answers;
      builtPrompt = translatePrompt.trim();
    } else {
      if (!prompt.trim() || choices.length < 3) {
        throw new Error('Câu hỏi cần prompt và ít nhất 3 lựa chọn.');
      }
      if (!correctChoice || !choices.includes(correctChoice)) {
        throw new Error('Hãy chọn đáp án đúng trong danh sách lựa chọn.');
      }
      builtPrompt = prompt.trim();
      answer = correctChoice;
      builtChoices = choices;
    }

    return {
      id: editing?.id || `q_temp_${Date.now()}`,
      type,
      prompt: builtPrompt,
      choices: builtChoices,
      answer,
      explanationVi: explanationVi.trim(),
      kanjiRefs: [],
      wordRefs: [],
      grammarRefs: [grammar.id],
      grammarId: grammar.id,
      sourceExample: type === 'fill_blank' ? sentence.trim() : undefined,
      difficulty,
      provenance
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const question = buildQuestion();
      const validation = validateGrammarExercise(question);
      if (!validation.valid) {
        setError(validation.errors.join('\n'));
        return;
      }
      if (!ownerUid) {
        setError('Bạn cần đăng nhập để lưu bài tập.');
        return;
      }
      if (publish && !canPublish) {
        setError('Bạn cần đăng nhập bằng tài khoản (không phải ẩn danh) để công khai bài tập.');
        return;
      }

      const record = buildGrammarExerciseRecord({
        draft: {
          ...question,
          id: editing?.id,
          grammarId: grammar.id,
          visibility: publish ? 'public' : 'private',
          copyOf: editing?.copyOf
        },
        ownerUid,
        authorName,
        existing: editing || undefined
      });

      setIsSaving(true);
      await onSave(record, { publish });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể lưu bài tập.');
    } finally {
      setIsSaving(false);
    }
  };

  const typeLabel = (value: EditableExerciseType) => {
    switch (value) {
      case 'fill_blank':
        return 'Điền chỗ trống';
      case 'order':
        return 'Sắp xếp câu';
      case 'translate_jp_vi':
        return 'Dịch Nhật → Việt';
      case 'translate_vi_jp':
        return 'Dịch Việt → Nhật';
      default:
        return 'Trắc nghiệm ngữ pháp';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {editing ? 'Sửa bài tập' : 'Thêm bài tập ngữ pháp'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{grammar.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Loại bài tập
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EditableExerciseType)}
              disabled={Boolean(editingType)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {(
                ['fill_blank', 'order', 'translate_jp_vi', 'translate_vi_jp', 'K7'] as EditableExerciseType[]
              ).map((value) => (
                <option key={value} value={value}>
                  {typeLabel(value)}
                </option>
              ))}
            </select>
          </div>

          {type === 'fill_blank' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Câu tiếng Nhật đầy đủ
                </label>
                <textarea
                  rows={3}
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  placeholder="Ví dụ: 毎日話しているうちに、好きになりました。"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Phần cần điền (đáp án)
                </label>
                <input
                  value={blankAnswer}
                  onChange={(e) => setBlankAnswer(e.target.value)}
                  placeholder="Ví dụ: うちに"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleBlankFromSentence}
                  className="mt-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
                >
                  Kiểm tra & tạo chỗ trống
                </button>
                {prompt && prompt.includes(GRAMMAR_BLANK_MARKER) && (
                  <p className="mt-2 rounded-lg bg-slate-100 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Xem trước: {prompt.replace(GRAMMAR_BLANK_MARKER, '（　　　）')}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Đáp án nhiễu (mỗi dòng một đáp án, không cần nhập đáp án đúng)
                </label>
                <textarea
                  rows={3}
                  value={choicesText}
                  onChange={(e) => setChoicesText(e.target.value)}
                  placeholder={'ために\nながら\nたびに'}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </>
          )}

          {type === 'order' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Câu đúng
                </label>
                <textarea
                  rows={3}
                  value={orderSentence}
                  onChange={(e) => setOrderSentence(e.target.value)}
                  placeholder="Ví dụ: 毎日話しているうちに、好きになりました。"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleAutoTokenize}
                  className="mt-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
                >
                  Tách từ tự động
                </button>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Các mảnh ghép (cách nhau bằng dấu |)
                </label>
                <textarea
                  rows={3}
                  value={tokensText}
                  onChange={(e) => setTokensText(e.target.value)}
                  placeholder="毎日 | 話している | うちに、 | 好きに | なりました。"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Hướng dẫn (tuỳ chọn)
                </label>
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Sắp xếp các mảnh ghép thành câu đúng."
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </>
          )}

          {(type === 'translate_jp_vi' || type === 'translate_vi_jp') && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {type === 'translate_jp_vi' ? 'Câu tiếng Nhật' : 'Câu tiếng Việt'}
                </label>
                <textarea
                  rows={3}
                  value={translatePrompt}
                  onChange={(e) => setTranslatePrompt(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Đáp án được chấp nhận (mỗi dòng một đáp án)
                </label>
                <textarea
                  rows={3}
                  value={translateAnswers}
                  onChange={(e) => setTranslateAnswers(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </>
          )}

          {type === 'K7' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Câu hỏi
                </label>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Lựa chọn (mỗi dòng một lựa chọn)
                </label>
                <textarea
                  rows={4}
                  value={choicesText}
                  onChange={(e) => setChoicesText(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Đáp án đúng
                </label>
                <select
                  value={correctChoice}
                  onChange={(e) => setCorrectChoice(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Chọn đáp án</option>
                  {choices.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Giải thích tiếng Việt
            </label>
            <textarea
              rows={2}
              value={explanationVi}
              onChange={(e) => setExplanationVi(e.target.value)}
              placeholder="Vì sao đáp án này đúng..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Độ khó
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                disabled={!canPublish}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Công khai lên ngân hàng chung</span>
            </label>
          </div>

          {!canPublish && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Đăng nhập bằng tài khoản (không phải ẩn danh) để công khai bài tập.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 whitespace-pre-line rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? 'Đang lưu...' : publish ? 'Lưu & công khai' : 'Lưu bài tập'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
