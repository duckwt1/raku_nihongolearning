import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Plus, RotateCcw, XCircle } from 'lucide-react';
import type { GrammarExercise } from '@raku/core';

interface GrammarExercisePlayerProps {
  exercises: GrammarExercise[];
  title: string;
  onExit: () => void;
  onLoadMore?: () => void;
  canLoadMore?: boolean;
  onComplete?: (
    results: Array<{
      exerciseId: string;
      grammarId: string;
      jlpt: GrammarExercise['jlpt'];
      correct: boolean;
    }>
  ) => void;
}

function normalizeAnswer(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[。、,.!?！？]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOrderAnswer(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[。、,.!?！？]/g, '')
    .replace(/[\s\u3000]+/g, '');
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function typeLabel(type: string): string {
  switch (type) {
    case 'fill_blank':
      return 'Điền chỗ trống';
    case 'order':
      return 'Sắp xếp câu';
    case 'translate_jp_vi':
      return 'Dịch Nhật → Việt';
    case 'translate_vi_jp':
      return 'Dịch Việt → Nhật';
    default:
      return 'Trắc nghiệm';
  }
}

export function GrammarExercisePlayer({
  exercises,
  title,
  onExit,
  onLoadMore,
  canLoadMore,
  onComplete
}: GrammarExercisePlayerProps) {
  const [index, setIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [assembledKeys, setAssembledKeys] = useState<number[]>([]);
  const [translateInput, setTranslateInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [results, setResults] = useState<
    Array<{
      exerciseId: string;
      grammarId: string;
      jlpt: GrammarExercise['jlpt'];
      correct: boolean;
    }>
  >([]);

  const exercise = exercises[index];
  const shuffledChoices = useMemo(() => {
    if (!exercise?.choices) return [];
    return shuffle(exercise.choices);
  }, [exercise?.id, exercise?.choices]);

  const tokenItems = useMemo(() => {
    if (!exercise?.tokens) return [];
    return shuffle(exercise.tokens.map((token, tokenIndex) => ({ token, tokenIndex })));
  }, [exercise?.id, exercise?.tokens]);

  if (!exercise) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Chưa có bài tập để luyện.
      </div>
    );
  }

  const answerText = Array.isArray(exercise.answer) ? exercise.answer : [exercise.answer];
  const assembledTokens = assembledKeys
    .map((key) => tokenItems.find((item) => item.tokenIndex === key)?.token)
    .filter((token): token is string => Boolean(token));

  const isCorrect = (() => {
    if (
      exercise.type === 'fill_blank' ||
      exercise.type === 'K7'
    ) {
      return selectedChoice !== null && selectedChoice === exercise.answer;
    }
    if (exercise.type === 'order') {
      return (
        normalizeOrderAnswer(assembledTokens.join('')) ===
        normalizeOrderAnswer(String(exercise.answer))
      );
    }
    return answerText.some(
      (answer) => normalizeAnswer(answer) === normalizeAnswer(translateInput)
    );
  })();

  const reset = () => {
    setSelectedChoice(null);
    setAssembledKeys([]);
    setTranslateInput('');
    setChecked(false);
  };

  const retryCurrent = () => {
    setResults((prev) => prev.filter((result) => result.exerciseId !== exercise.id));
    reset();
  };

  const handleCheck = () => {
    if (checked) return;
    setResults((prev) => [
      ...prev.filter((result) => result.exerciseId !== exercise.id),
      {
        exerciseId: exercise.id,
        grammarId: exercise.grammarId,
        jlpt: exercise.jlpt,
        correct: isCorrect
      }
    ]);
    setChecked(true);
  };

  const handleNext = () => {
    if (index + 1 >= exercises.length) {
      onComplete?.(results);
      setIsSessionComplete(true);
      return;
    }
    setIndex((prev) => prev + 1);
    reset();
  };

  const restartSession = () => {
    setResults([]);
    setIndex(0);
    reset();
    setIsSessionComplete(false);
  };

  const correctCount = results.filter((result) => result.correct).length;

  const canCheck =
    exercise.type === 'fill_blank' || exercise.type === 'K7'
      ? selectedChoice !== null
      : exercise.type === 'order'
        ? assembledTokens.length > 0
        : translateInput.trim().length > 0;

  if (isSessionComplete) {
    const total = results.length;
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-950/40">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">
          Hoàn thành phiên luyện tập!
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Đúng <strong>{correctCount}</strong> / {total} câu · {percentage}%
        </p>
        <p className="mt-1 text-xs text-slate-400">{title}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={restartSession}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Làm lại từ đầu
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Thoát
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-600 dark:text-sky-400">
            Luyện tập · {title}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Câu {index + 1} / {exercises.length}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {onLoadMore && canLoadMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className="flex items-center gap-1 rounded-xl border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950"
            >
              <Plus className="h-3.5 w-3.5" />
              Học thêm 10 câu
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Thoát
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {typeLabel(exercise.type)}
          </span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {exercise.grammarPattern}
          </span>
          {exercise.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-400 dark:bg-slate-900"
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="whitespace-pre-line text-base font-medium leading-relaxed text-slate-800 dark:text-slate-100">
          {exercise.type === 'fill_blank'
            ? exercise.prompt.replace(/\{\{blank\}\}/g, '（　　　）')
            : exercise.prompt}
        </div>

        {exercise.type === 'order' && (
          <div className="mt-4 space-y-3">
            <div className="flex min-h-[52px] flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 dark:border-slate-600 dark:bg-slate-900">
              {assembledTokens.length === 0 ? (
                <span className="text-xs italic text-slate-400">
                  Chạm vào các mảnh bên dưới để ghép câu...
                </span>
              ) : (
                assembledKeys.map((key) => {
                  const item = tokenItems.find((entry) => entry.tokenIndex === key);
                  if (!item) return null;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={checked}
                      onClick={() =>
                        setAssembledKeys((prev) => prev.filter((entry) => entry !== key))
                      }
                      className="rounded-lg border border-sky-300 bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
                    >
                      {item.token} ✕
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tokenItems.map((item) => {
                const used = assembledKeys.includes(item.tokenIndex);
                return (
                  <button
                    key={item.tokenIndex}
                    type="button"
                    disabled={used || checked}
                    onClick={() => setAssembledKeys((prev) => [...prev, item.tokenIndex])}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      used
                        ? 'border-dashed border-slate-300 text-slate-300 dark:border-slate-700 dark:text-slate-600'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {item.token}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {(exercise.type === 'fill_blank' || exercise.type === 'K7') &&
          shuffledChoices.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {shuffledChoices.map((choice) => {
                const selected = selectedChoice === choice;
                const correct = checked && choice === exercise.answer;
                const wrong = checked && selected && choice !== exercise.answer;
                return (
                  <button
                    key={choice}
                    type="button"
                    disabled={checked}
                    onClick={() => setSelectedChoice(choice)}
                    className={`rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition ${
                      correct
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
                        : wrong
                          ? 'border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200'
                          : selected
                            ? 'border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                    }`}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          )}

        {(exercise.type === 'translate_jp_vi' || exercise.type === 'translate_vi_jp') && (
          <textarea
            rows={3}
            value={translateInput}
            onChange={(e) => setTranslateInput(e.target.value)}
            disabled={checked}
            placeholder="Nhập bản dịch của bạn..."
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        )}

        {checked && (
          <div
            className={`mt-4 rounded-xl border p-3 text-sm ${
              isCorrect
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold">
              {isCorrect ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <span>
                {isCorrect ? 'Chính xác!' : `Chưa đúng. Đáp án: ${answerText.join(' / ')}`}
              </span>
            </div>
            {exercise.explanationVi && (
              <p className="mt-1.5 whitespace-pre-line text-xs opacity-90">
                {exercise.explanationVi}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={retryCurrent}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Làm lại
          </button>
          {!checked ? (
            <button
              type="button"
              disabled={!canCheck}
              onClick={handleCheck}
              className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-sky-700 disabled:opacity-50"
            >
              Kiểm tra đáp án
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
            >
              {index + 1 >= exercises.length ? 'Làm lại từ đầu' : 'Câu tiếp theo'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
