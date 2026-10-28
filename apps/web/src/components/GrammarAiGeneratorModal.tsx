import { useState } from 'react';
import { AlertTriangle, Sparkles, X } from 'lucide-react';
import type { Grammar, GrammarExerciseRecord, Question } from '@raku/core';
import { auth } from '../services/firebase';
import { getApiUrl } from '../services/apiClient';
import { createGrammarExerciseId } from '../services/grammarExerciseStore';

type AiGrammarType =
  | 'fill_blank'
  | 'order'
  | 'translate_jp_vi'
  | 'translate_vi_jp'
  | 'K7';

interface GrammarAiGeneratorModalProps {
  isOpen: boolean;
  grammar: Grammar;
  ownerUid?: string | null;
  authorName?: string;
  onClose: () => void;
  onSave: (records: GrammarExerciseRecord[]) => Promise<void> | void;
}

const TYPE_OPTIONS: Array<{ value: AiGrammarType; label: string }> = [
  { value: 'fill_blank', label: 'Điền chỗ trống' },
  { value: 'order', label: 'Sắp xếp câu' },
  { value: 'translate_jp_vi', label: 'Dịch Nhật → Việt' },
  { value: 'translate_vi_jp', label: 'Dịch Việt → Nhật' },
  { value: 'K7', label: 'Trắc nghiệm' }
];

export function GrammarAiGeneratorModal({
  isOpen,
  grammar,
  ownerUid,
  authorName,
  onClose,
  onSave
}: GrammarAiGeneratorModalProps) {
  const [types, setTypes] = useState<AiGrammarType[]>(['fill_blank', 'order']);
  const [count, setCount] = useState(3);
  const [difficulty, setDifficulty] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<GrammarExerciseRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const toggleType = (type: AiGrammarType) => {
    setTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
    );
  };

  const handleGenerate = async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (types.length === 0) throw new Error('Chọn ít nhất một loại bài tập.');
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Bạn cần đăng nhập để sử dụng AI.');
      if (!ownerUid) throw new Error('Bạn cần đăng nhập để lưu bài tập.');

      const res = await fetch(getApiUrl('/api/ai/grammar-exercises'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          grammar: {
            id: grammar.id,
            title: grammar.title,
            explanationVi: grammar.explanationVi,
            examples: grammar.examples,
            jlpt: grammar.jlpt
          },
          template: {
            types,
            count,
            difficulty,
            choiceCount: 4
          },
          avoidPrompts: drafts.map((draft) => draft.prompt)
        })
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        questions?: Question[];
        rejected?: Array<{ index: number; reason: string }>;
      };
      const now = new Date().toISOString();
      const records: GrammarExerciseRecord[] = (data.questions || []).map((question) => ({
        ...question,
        id: createGrammarExerciseId(ownerUid),
        grammarId: grammar.id,
        ownerUid,
        authorName,
        visibility: 'private',
        createdAt: now,
        updatedAt: now
      }));

      if (records.length === 0) {
        const reasons = (data.rejected || [])
          .slice(0, 3)
          .map((item) => item.reason)
          .join('; ');
        throw new Error(
          reasons
            ? `AI không tạo được bài hợp lệ: ${reasons}`
            : 'AI không trả về bài tập hợp lệ.'
        );
      }

      setDrafts(records);
      setSelectedIds(new Set(records.map((record) => record.id)));
      if (data.rejected && data.rejected.length > 0) {
        setError(
          `Đã bỏ qua ${data.rejected.length} câu không hợp lệ: ${data.rejected
            .slice(0, 2)
            .map((item) => item.reason)
            .join('; ')}`
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi gọi AI.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    const selected = drafts.filter((draft) => selectedIds.has(draft.id));
    if (selected.length === 0) {
      setError('Chọn ít nhất một bài để lưu.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(selected);
      setDrafts([]);
      setSelectedIds(new Set());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể lưu bài tập.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                AI tạo bài tập ngữ pháp
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{grammar.title}</p>
            </div>
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

        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Loại bài tập
              </p>
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map((option) => {
                  const selected = types.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleType(option.value)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                        selected
                          ? 'border-sky-400 bg-sky-100 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200'
                          : 'border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                Số câu:
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-16 rounded-lg border border-slate-300 bg-white p-1.5 text-center text-xs dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                Độ khó:
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isLoading}
                className="ml-auto flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isLoading ? 'Đang tạo...' : 'Tạo bài tập'}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {drafts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Bản nháp ({selectedIds.size}/{drafts.length})
                </h3>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSaving ? 'Đang lưu...' : 'Lưu bài đã chọn'}
                </button>
              </div>

              {drafts.map((draft, index) => {
                const selected = selectedIds.has(draft.id);
                const answerText = Array.isArray(draft.answer)
                  ? draft.answer.join(' / ')
                  : draft.answer;
                return (
                  <div
                    key={draft.id}
                    className={`rounded-2xl border p-3.5 ${
                      selected
                        ? 'border-violet-300 bg-violet-50/60 dark:border-violet-800 dark:bg-violet-950/30'
                        : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(draft.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                            AI · chưa kiểm chứng
                          </span>
                          <span className="text-[10px] text-slate-400">#{index + 1}</span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-line text-sm font-medium text-slate-800 dark:text-slate-100">
                          {draft.prompt.replace(/\{\{blank\}\}/g, '（　　　）')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Đáp án: {answerText}
                        </p>
                        {draft.explanationVi && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            {draft.explanationVi}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
