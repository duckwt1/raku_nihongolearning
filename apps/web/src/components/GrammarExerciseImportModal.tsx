import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, Upload, X } from 'lucide-react';
import type { Grammar, GrammarExercise } from '@raku/core';
import {
  EXERCISE_CSV_TEMPLATE,
  downloadExerciseCsvTemplate,
  parseExerciseCsv
} from '../services/grammarExerciseCsv';

interface GrammarExerciseImportModalProps {
  isOpen: boolean;
  grammarPoints: Grammar[];
  createdByUid: string;
  createdByName?: string;
  onClose: () => void;
  onImport: (exercises: GrammarExercise[]) => Promise<void> | void;
}

export function GrammarExerciseImportModal({
  isOpen,
  grammarPoints,
  createdByUid,
  createdByName,
  onClose,
  onImport
}: GrammarExerciseImportModalProps) {
  const [csvText, setCsvText] = useState(EXERCISE_CSV_TEMPLATE);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    if (!isOpen || !csvText.trim()) return { exercises: [], issues: [] };
    return parseExerciseCsv(csvText, grammarPoints, createdByUid, createdByName);
  }, [isOpen, csvText, grammarPoints, createdByUid, createdByName]);

  if (!isOpen) return null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setCsvText(await file.text());
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể đọc file CSV.');
    }
  };

  const handleImport = async () => {
    setError(null);
    if (parsed.exercises.length === 0) {
      setError('Không có bài tập hợp lệ để import.');
      return;
    }
    setIsImporting(true);
    try {
      await onImport(parsed.exercises);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import thất bại.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Import bài tập bằng CSV
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chỉ dùng grammar_id thuộc level đang chọn.
              </p>
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadExerciseCsvTemplate}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Tải template CSV
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950">
              <Upload className="h-3.5 w-3.5" />
              Chọn file CSV
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </label>
            <span className="text-[11px] text-slate-400">
              Cột: grammar_id, type, prompt, answer, choices, tokens, explanation_vi, difficulty, tags
            </span>
          </div>

          <textarea
            rows={13}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            spellCheck={false}
            className="w-full rounded-xl border border-slate-300 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {parsed.exercises.length} hợp lệ
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {parsed.issues.length} lỗi
            </span>
          </div>

          {parsed.issues.length > 0 && (
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {parsed.issues.slice(0, 20).map((issue, index) => (
                <p key={index}>
                  {issue.row ? `Dòng ${issue.row}: ` : ''}
                  {issue.message}
                </p>
              ))}
              {parsed.issues.length > 20 && <p>... và {parsed.issues.length - 20} lỗi khác</p>}
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
            onClick={() => void handleImport()}
            disabled={isImporting || parsed.exercises.length === 0}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
          >
            {isImporting ? 'Đang import...' : `Import ${parsed.exercises.length} bài`}
          </button>
        </div>
      </div>
    </div>
  );
}
