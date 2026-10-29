import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Save, Sparkles, X } from 'lucide-react';
import {
  GRAMMAR_BLANK_MARKER,
  validateGrammarExercise,
  type Grammar,
  type GrammarExercise,
  type GrammarExerciseType
} from '@raku/core';
import { createGrammarExerciseId } from '../services/grammarExerciseStore';

interface GrammarExerciseFormModalProps {
  isOpen: boolean;
  grammarPoints: Grammar[];
  initialGrammarId?: string | null;
  editing?: GrammarExercise | null;
  createdByUid: string;
  createdByName?: string;
  onClose: () => void;
  onSave: (exercise: GrammarExercise) => Promise<void> | void;
}

function splitLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function splitTokens(text: string): string[] {
  return text.split('|').map((token) => token.trim()).filter(Boolean);
}

function tokenizeJapanese(sentence: string): string[] {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (
      locale: string,
      options: { granularity: string }
    ) => { segment: (text: string) => Iterable<{ segment: string }> };
  }).Segmenter;

  if (typeof Segmenter === 'function') {
    try {
      const segmenter = new Segmenter('ja', { granularity: 'word' });
      const parts = Array.from(segmenter.segment(sentence), (item) => item.segment);
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
      // fallback
    }
  }

  return sentence
    .replace(/([。、？！])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);
}

function findPatternSpan(grammar: Grammar, sentence: string): string | null {
  const literal = grammar.pattern.replace(/[〜~]/g, '').trim();
  if (literal && sentence.includes(literal)) return literal;
  return null;
}

export function GrammarExerciseFormModal({
  isOpen,
  grammarPoints,
  initialGrammarId,
  editing,
  createdByUid,
  createdByName,
  onClose,
  onSave
}: GrammarExerciseFormModalProps) {
  const [grammarId, setGrammarId] = useState(initialGrammarId || grammarPoints[0]?.id || '');
  const [type, setType] = useState<GrammarExerciseType>('fill_blank');
  const [sentence, setSentence] = useState('');
  const [blankAnswer, setBlankAnswer] = useState('');
  const [distractorsText, setDistractorsText] = useState('');
  const [orderSentence, setOrderSentence] = useState('');
  const [tokensText, setTokensText] = useState('');
  const [translatePrompt, setTranslatePrompt] = useState('');
  const [translateAnswers, setTranslateAnswers] = useState('');
  const [prompt, setPrompt] = useState('');
  const [choicesText, setChoicesText] = useState('');
  const [correctChoice, setCorrectChoice] = useState('');
  const [explanationVi, setExplanationVi] = useState('');
  const [difficulty, setDifficulty] = useState(2);
  const [tagsText, setTagsText] = useState('');
  const [sourceExampleId, setSourceExampleId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedGrammar =
    grammarPoints.find((grammar) => grammar.id === grammarId) || grammarPoints[0] || null;

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsSaving(false);

    if (editing) {
      setGrammarId(editing.grammarId);
      setType(editing.type);
      setExplanationVi(editing.explanationVi);
      setDifficulty(editing.difficulty);
      setTagsText(editing.tags.join(', '));
      setSourceExampleId(editing.sourceExampleId);

      if (editing.type === 'fill_blank') {
        const answer = typeof editing.answer === 'string' ? editing.answer : '';
        setSentence(editing.prompt.replace(GRAMMAR_BLANK_MARKER, answer));
        setBlankAnswer(answer);
        setDistractorsText(
          (editing.choices || []).filter((choice) => choice !== answer).join('\n')
        );
        setOrderSentence('');
        setTokensText('');
        setTranslatePrompt('');
        setTranslateAnswers('');
        setPrompt('');
        setChoicesText('');
        setCorrectChoice('');
        return;
      }

      if (editing.type === 'order') {
        setOrderSentence(typeof editing.answer === 'string' ? editing.answer : '');
        setTokensText((editing.tokens || []).join(' | '));
        setSentence('');
        setBlankAnswer('');
        setDistractorsText('');
        setTranslatePrompt('');
        setTranslateAnswers('');
        setPrompt('');
        setChoicesText('');
        setCorrectChoice('');
        return;
      }

      setPrompt(editing.prompt);
      setTranslatePrompt(editing.prompt);
      setTranslateAnswers(
        Array.isArray(editing.answer) ? editing.answer.join('\n') : editing.answer
      );
      setChoicesText((editing.choices || []).join('\n'));
      setCorrectChoice(typeof editing.answer === 'string' ? editing.answer : '');
      setSentence('');
      setBlankAnswer('');
      setDistractorsText('');
      setOrderSentence('');
      setTokensText('');
      return;
    }

    setGrammarId(initialGrammarId || grammarPoints[0]?.id || '');
    setType('fill_blank');
    setSentence('');
    setBlankAnswer('');
    setDistractorsText('');
    setOrderSentence('');
    setTokensText('');
    setTranslatePrompt('');
    setTranslateAnswers('');
    setPrompt('');
    setChoicesText('');
    setCorrectChoice('');
    setExplanationVi('');
    setDifficulty(2);
    setTagsText('');
    setSourceExampleId(undefined);
  }, [isOpen, editing, initialGrammarId, grammarPoints]);

  const choices = useMemo(() => splitLines(choicesText), [choicesText]);
  const tags = useMemo(
    () => tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tagsText]
  );

  const generatedDistractors = useMemo(() => {
    if (!selectedGrammar) return [];
    const answer = blankAnswer.trim();
    const result: string[] = [];
    for (const grammar of grammarPoints) {
      if (grammar.id === selectedGrammar.id) continue;
      const key = grammar.pattern.replace(/[〜~]/g, '').trim();
      if (key && key !== answer && !result.includes(key) && key.length >= 2) {
        result.push(key);
      }
    }
    return result;
  }, [grammarPoints, selectedGrammar, blankAnswer]);

  if (!isOpen) return null;

  const fillFromExample = () => {
    if (!selectedGrammar) return;
    const example = selectedGrammar.examples[0];
    if (!example) {
      setError('Grammar point chưa có ví dụ.');
      return;
    }

    if (type === 'fill_blank') {
      const answer = example.highlight?.trim() || findPatternSpan(selectedGrammar, example.jp);
      if (!answer || !example.jp.includes(answer)) {
        setError('Không tìm thấy cụm ngữ pháp trong ví dụ. Hãy nhập tay.');
        return;
      }
      setSentence(example.jp);
      setBlankAnswer(answer);
      setSourceExampleId(example.id);
      setError(null);
    } else if (type === 'order') {
      setOrderSentence(example.jp);
      setTokensText(tokenizeJapanese(example.jp).join(' | '));
      setSourceExampleId(example.id);
      setError(null);
    }
  };

  const buildExercise = (): GrammarExercise => {
    if (!selectedGrammar) throw new Error('Chưa chọn grammar point.');
    if (!createdByUid) throw new Error('Bạn cần đăng nhập.');

    let builtPrompt = prompt;
    let answer: string | string[] = '';
    let builtChoices: string[] | undefined;
    let builtTokens: string[] | undefined;

    if (type === 'fill_blank') {
      const trimmedAnswer = blankAnswer.trim();
      if (!trimmedAnswer || !sentence.includes(trimmedAnswer)) {
        throw new Error('Đáp án không xuất hiện trong câu.');
      }
      builtPrompt = sentence.replace(trimmedAnswer, GRAMMAR_BLANK_MARKER);
      answer = trimmedAnswer;
      const uniqueDistractors = Array.from(
        new Set([
          ...splitLines(distractorsText).filter((choice) => choice !== trimmedAnswer),
          ...generatedDistractors.filter((choice) => choice !== trimmedAnswer)
        ])
      );
      builtChoices = [trimmedAnswer, ...uniqueDistractors.slice(0, 3)];
    } else if (type === 'order') {
      builtTokens = splitTokens(tokensText);
      if (builtTokens.length < 2) {
        throw new Error('Cần ít nhất 2 mảnh ghép.');
      }
      answer = orderSentence.trim() || builtTokens.join('');
      builtPrompt = prompt.trim() || 'Sắp xếp các mảnh ghép thành câu đúng.';
    } else if (type === 'translate_jp_vi' || type === 'translate_vi_jp') {
      const answers = splitLines(translateAnswers);
      if (!translatePrompt.trim() || answers.length === 0) {
        throw new Error('Cần nhập câu nguồn và ít nhất một đáp án.');
      }
      builtPrompt = translatePrompt.trim();
      answer = answers.length === 1 ? answers[0]! : answers;
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

    const validation = validateGrammarExercise({
      type,
      prompt: builtPrompt,
      answer,
      choices: builtChoices,
      tokens: builtTokens
    });
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'));
    }

    const now = new Date().toISOString();
    return {
      id: editing?.id || createGrammarExerciseId(),
      grammarId: selectedGrammar.id,
      grammarPattern: selectedGrammar.pattern,
      grammarTitle: selectedGrammar.title,
      jlpt: selectedGrammar.jlpt,
      type,
      prompt: builtPrompt,
      answer,
      choices: builtChoices,
      tokens: builtTokens,
      explanationVi: explanationVi.trim(),
      difficulty,
      tags,
      sourceExampleId,
      createdByUid,
      createdByName,
      origin: editing?.origin || 'admin',
      visibility: 'public',
      createdAt: editing?.createdAt || now,
      updatedAt: now
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const exercise = buildExercise();
      setIsSaving(true);
      await onSave(exercise);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể lưu bài tập.');
    } finally {
      setIsSaving(false);
    }
  };

  const typeLabel = (value: GrammarExerciseType) => {
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
              {editing ? 'Sửa bài tập' : 'Tạo bài tập ngữ pháp'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Bài tập sẽ được công khai cho mọi người luyện.
            </p>
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
              Grammar point
            </label>
            <select
              value={grammarId}
              onChange={(e) => setGrammarId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {grammarPoints.map((grammar) => (
                <option key={grammar.id} value={grammar.id}>
                  {grammar.pattern} — {grammar.meaningVi.join(' / ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Loại bài tập
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as GrammarExerciseType)}
              disabled={Boolean(editing)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {(
                ['fill_blank', 'order', 'translate_jp_vi', 'translate_vi_jp', 'K7'] as GrammarExerciseType[]
              ).map((value) => (
                <option key={value} value={value}>
                  {typeLabel(value)}
                </option>
              ))}
            </select>
          </div>

          {(type === 'fill_blank' || type === 'order') && (
            <button
              type="button"
              onClick={fillFromExample}
              className="flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Lấy từ ví dụ của grammar point
            </button>
          )}

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
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Phần cần điền
                </label>
                <input
                  value={blankAnswer}
                  onChange={(e) => setBlankAnswer(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Đáp án nhiễu (mỗi dòng một đáp án)
                </label>
                <textarea
                  rows={3}
                  value={distractorsText}
                  onChange={(e) => setDistractorsText(e.target.value)}
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
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Mảnh ghép (cách nhau bằng |)
                </label>
                <textarea
                  rows={3}
                  value={tokensText}
                  onChange={(e) => setTokensText(e.target.value)}
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
                  Câu nguồn
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
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tags (cách nhau bằng dấu phẩy)
              </label>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="bai-01, thoi-gian, kho"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
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
          </div>

          {selectedGrammar && (
            <p className="rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <strong>{selectedGrammar.pattern}</strong> · {selectedGrammar.meaningVi.join(' / ')}
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
              {isSaving ? 'Đang lưu...' : 'Lưu & công khai'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
