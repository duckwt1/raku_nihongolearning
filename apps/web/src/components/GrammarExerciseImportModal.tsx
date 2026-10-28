import { useMemo, useState } from 'react';
import { AlertTriangle, FileJson, X } from 'lucide-react';
import {
  validateGrammarExercise,
  type Grammar,
  type GrammarExerciseRecord,
  type Question
} from '@raku/core';
import { createGrammarExerciseId } from '../services/grammarExerciseStore';

interface GrammarExerciseImportModalProps {
  isOpen: boolean;
  grammar: Grammar;
  ownerUid?: string | null;
  authorName?: string;
  canPublish: boolean;
  onClose: () => void;
  onImport: (
    records: GrammarExerciseRecord[],
    options: { publish: boolean }
  ) => Promise<void> | void;
}

const TEMPLATE = `[
  {
    "type": "fill_blank",
    "prompt": "毎日話している{{blank}}、好きになりました。",
    "answer": "うちに",
    "choices": ["うちに", "ために", "ながら", "たびに"],
    "explanationVi": "うちに: trong lúc...",
    "difficulty": 2
  },
  {
    "type": "order",
    "prompt": "Sắp xếp câu đúng.",
    "tokens": ["毎日", "話している", "うちに、", "好きに", "なりました。"],
    "answer": "毎日話しているうちに、好きになりました。",
    "explanationVi": "...",
    "difficulty": 2
  }
]`;

export function GrammarExerciseImportModal({
  isOpen,
  grammar,
  ownerUid,
  authorName,
  canPublish,
  onClose,
  onImport
}: GrammarExerciseImportModalProps) {
  const [jsonText, setJsonText] = useState(TEMPLATE);
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const parsed = useMemo(() => {
    if (!isOpen) return { valid: [] as GrammarExerciseRecord[], errors: [] as string[] };

    if (!jsonText.trim()) {
      return { valid: [], errors: ['Chưa có nội dung JSON.'] };
    }

    if (!ownerUid) {
      return { valid: [], errors: ['Bạn cần đăng nhập để nhập bài tập.'] };
    }

    try {
      const raw = JSON.parse(jsonText) as unknown;
      const items = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { exercises?: unknown[] }).exercises)
          ? (raw as { exercises: unknown[] }).exercises
          : null;

      if (!items) {
        return { valid: [], errors: ['JSON phải là một mảng bài tập hoặc object có trường "exercises".'] };
      }

      const valid: GrammarExerciseRecord[] = [];
      const errors: string[] = [];
      const now = new Date().toISOString();

      items.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
          errors.push(`Mục ${index + 1}: không phải object.`);
          return;
        }
        const rawItem = item as Record<string, unknown>;
        const allowedTypes: Question['type'][] = [
          'K2',
          'K7',
          'fill_blank',
          'order',
          'translate_jp_vi',
          'translate_vi_jp'
        ];
        const type = String(rawItem.type || '');
        if (!allowedTypes.includes(type as Question['type'])) {
          errors.push(`Mục ${index + 1}: loại bài "${type}" không hợp lệ.`);
          return;
        }

        const rawAnswer = rawItem.answer;
        const answer: string | string[] =
          typeof rawAnswer === 'string'
            ? rawAnswer
            : Array.isArray(rawAnswer)
              ? rawAnswer.map(String)
              : '';
        const choices = Array.isArray(rawItem.choices)
          ? rawItem.choices.map(String)
          : undefined;
        const tokens = Array.isArray(rawItem.tokens) ? rawItem.tokens.map(String) : undefined;
        const rawProvenance =
          rawItem.provenance && typeof rawItem.provenance === 'object'
            ? (rawItem.provenance as Partial<Question['provenance']>)
            : {};
        const question: Question = {
          id: createGrammarExerciseId(ownerUid),
          type: type as Question['type'],
          prompt: typeof rawItem.prompt === 'string' ? rawItem.prompt : '',
          answer,
          choices,
          tokens,
          explanationVi:
            typeof rawItem.explanationVi === 'string' ? rawItem.explanationVi : '',
          kanjiRefs: [],
          wordRefs: [],
          grammarRefs: [grammar.id],
          grammarId: grammar.id,
          sourceExample:
            typeof rawItem.sourceExample === 'string' ? rawItem.sourceExample : undefined,
          difficulty:
            typeof rawItem.difficulty === 'number'
              ? Math.min(5, Math.max(1, Math.round(rawItem.difficulty)))
              : 2,
          provenance: {
            origin:
              rawProvenance.origin === 'ai' || rawProvenance.origin === 'seed'
                ? rawProvenance.origin
                : 'user',
            model: rawProvenance.model,
            generatedAt: rawProvenance.generatedAt,
            verified: rawProvenance.verified ?? true,
            notes: rawProvenance.notes || 'Nhập từ JSON'
          }
        };

        const check = validateGrammarExercise(question);
        if (!check.valid) {
          errors.push(`Mục ${index + 1}: ${check.errors.join('; ')}`);
          return;
        }

        valid.push({
          ...question,
          grammarId: grammar.id,
          ownerUid,
          authorName,
          visibility: publish ? 'public' : 'private',
          createdAt: now,
          updatedAt: now
        });
      });

      return { valid, errors };
    } catch (err: unknown) {
      return {
        valid: [],
        errors: [err instanceof Error ? err.message : 'JSON không hợp lệ.']
      };
    }
  }, [jsonText, grammar.id, ownerUid, authorName, isOpen, publish]);

  if (!isOpen) return null;

  const handleImport = async () => {
    setError(null);
    if (parsed.valid.length === 0) {
      setError('Không có bài tập hợp lệ để nhập.');
      return;
    }
    if (publish && !canPublish) {
      setError('Bạn cần đăng nhập bằng tài khoản (không phải ẩn danh) để công khai bài tập.');
      return;
    }
    setIsImporting(true);
    try {
      await onImport(parsed.valid, { publish });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể nhập bài tập.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-sky-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Nhập bài tập bằng JSON
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

        <div className="flex-1 space-y-3 overflow-y-auto p-5 sm:p-6">
          <textarea
            rows={14}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
            className="w-full rounded-xl border border-slate-300 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                disabled={!canPublish}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Công khai các bài hợp lệ
            </label>
            <span className="text-xs text-slate-500">
              Hợp lệ: <strong className="text-emerald-600">{parsed.valid.length}</strong>
              {parsed.errors.length > 0 && (
                <>
                  {' '}· Lỗi: <strong className="text-rose-600">{parsed.errors.length}</strong>
                </>
              )}
            </span>
          </div>

          {parsed.errors.length > 0 && (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {parsed.errors.slice(0, 10).map((err, index) => (
                <p key={index} className="flex items-start gap-1">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{err}</span>
                </p>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting || parsed.valid.length === 0}
            className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 disabled:opacity-50"
          >
            {isImporting ? 'Đang nhập...' : `Nhập ${parsed.valid.length} bài`}
          </button>
        </div>
      </div>
    </div>
  );
}
