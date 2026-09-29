import { useState } from 'react';
import {
  X,
  Sparkles,
  AlertTriangle,
  Trash2,
  BookmarkPlus
} from 'lucide-react';
import type { Question } from '@raku/core';
import { auth } from '../services/firebase';

interface AiQuizGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveToDeck?: (questions: Question[]) => void;
}

export function AiQuizGeneratorModal({
  isOpen,
  onClose,
  onSaveToDeck
}: AiQuizGeneratorModalProps) {
  const [promptInput, setPromptInput] = useState('');
  const [jlpt, setJlpt] = useState('N3');
  const [count, setCount] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<Question[]>([]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Bạn cần đăng nhập (hoặc dùng thử ẩn danh) để gọi AI.');
      }

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: promptInput,
          jlpt,
          count
        })
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error?: string };
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { questions: Question[] };
      setDraftQuestions(data.questions || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định khi gọi AI');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDraft = (id: string) => {
    setDraftQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleSaveDeck = () => {
    if (draftQuestions.length === 0) return;
    if (onSaveToDeck) {
      onSaveToDeck(draftQuestions);
    }
    alert(`Đã lưu thành công ${draftQuestions.length} câu hỏi vào bộ ôn tập!`);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400">
            <Sparkles className="w-6 h-6" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              AI Tạo Bộ Câu Hỏi Trắc Nghiệm (Mục 8)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs text-slate-600 dark:text-slate-300">
          {/* Prompt builder form */}
          <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <label className="block font-semibold text-slate-700 dark:text-slate-200">
              Yêu cầu nội dung (từ vựng, đoạn văn tiếng Nhật, hoặc chủ đề):
            </label>
            <textarea
              rows={3}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Ví dụ: Tạo câu hỏi trắc nghiệm phân biệt cách đọc các từ có chứa chữ 生 hoặc đoạn văn ngắn về sinh hoạt hàng ngày..."
              className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5">
                  <label className="font-medium text-slate-500">Cấp độ:</label>
                  <select
                    value={jlpt}
                    onChange={(e) => setJlpt(e.target.value)}
                    className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="N5">N5</option>
                    <option value="N4">N4</option>
                    <option value="N3">N3</option>
                    <option value="N2">N2</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1.5">
                  <label className="font-medium text-slate-500">Số câu:</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-16 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-center"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={handleGenerate}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center space-x-1.5 shadow-sm touch-target"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isLoading ? 'Đang tạo câu hỏi...' : 'Tạo câu hỏi ngay'}</span>
              </button>
            </div>
          </div>

          {/* Error notice */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Draft Questions List */}
          {draftQuestions.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Danh sách câu hỏi bản nháp ({draftQuestions.length} câu)
                </h4>
                <button
                  onClick={handleSaveDeck}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center space-x-1 shadow-sm"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Lưu thành bộ ôn tập</span>
                </button>
              </div>

              <div className="space-y-3">
                {draftQuestions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>AI tạo, chưa kiểm chứng</span>
                      </span>
                      <button
                        onClick={() => handleDeleteDraft(q.id)}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded-lg"
                        title="Xóa câu hỏi này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100 font-sans">
                      {idx + 1}. {q.prompt}
                    </div>

                    {q.choices && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {q.choices.map((c, cIdx) => (
                          <div
                            key={cIdx}
                            className={`p-2 rounded-lg border text-xs ${
                              c === q.answer
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 font-semibold'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
                            }`}
                          >
                            {c} {c === q.answer && '✓ (Đáp án)'}
                          </div>
                        ))}
                      </div>
                    )}

                    {q.explanationVi && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                        Giải thích: {q.explanationVi}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
