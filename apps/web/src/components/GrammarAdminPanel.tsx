import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload
} from 'lucide-react';
import type { User } from '../services/firebase';
import type { GrammarLevel, JlptLevel } from '@raku/core';
import {
  JLPT_LEVELS,
  clearGrammarCache,
  fetchGrammarLevels,
  fetchGrammarPoints,
  importGrammarPoints,
  isGrammarAdmin,
  purgeGrammarData
} from '../services/grammarStore';
import {
  createCsvBundleZip,
  createGrammarCsvTemplateZip,
  parseGrammarCsvBundle,
  readGrammarCsvBundle,
  type GrammarCsvParseResult
} from '../services/grammarCsv';

interface GrammarAdminPanelProps {
  user: User | null;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function GrammarAdminPanel({ user, onNotify }: GrammarAdminPanelProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [level, setLevel] = useState<JlptLevel>('N3');
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [levels, setLevels] = useState<GrammarLevel[]>([]);
  const [bundleResult, setBundleResult] = useState<GrammarCsvParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    onNotify?.(message, type);
  };

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setChecking(true);
      const admin = await isGrammarAdmin(user?.uid);
      if (cancelled) return;
      setIsAdmin(admin);
      setChecking(false);
      if (admin) {
        const list = await fetchGrammarLevels();
        if (!cancelled) setLevels(list);
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const points = useMemo(() => {
    if (!bundleResult) return [];
    return bundleResult.points.filter((point) => point.jlpt === level);
  }, [bundleResult, level]);

  const levelMismatch = useMemo(() => {
    if (!bundleResult) return false;
    return bundleResult.points.some((point) => point.jlpt !== level);
  }, [bundleResult, level]);

  if (checking || !isAdmin) return null;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsParsing(true);
    setError(null);
    setStatus(null);
    setBundleResult(null);
    try {
      const bundle = await readGrammarCsvBundle(Array.from(files));
      const result = parseGrammarCsvBundle(bundle);
      setBundleResult(result);
      if (result.issues.length > 0) {
        setError(`Có ${result.issues.length} lỗi cần sửa trước khi import.`);
      } else {
        setStatus(
          `Đã đọc ${result.stats.points} grammar point, ${result.stats.examples} ví dụ, ${result.stats.formation} cấu trúc.`
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể đọc file CSV/ZIP.');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await createGrammarCsvTemplateZip();
      downloadBlob(blob, 'raku-grammar-template.zip');
      notify('Đã tải template CSV.', 'success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tạo template.');
    }
  };

  const handleExport = async () => {
    try {
      const all = await fetchGrammarPoints(level);
      if (all.length === 0) {
        setError(`Chưa có dữ liệu ${level} để xuất.`);
        return;
      }
      const blob = await createCsvBundleZip(all);
      downloadBlob(blob, `raku-grammar-${level}.zip`);
      notify(`Đã xuất ${all.length} grammar point ${level}.`, 'success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể xuất CSV.');
    }
  };

  const handleImport = async () => {
    if (!bundleResult || points.length === 0) return;
    if (bundleResult.issues.length > 0) {
      setError('Còn lỗi validation, chưa thể import.');
      return;
    }
    if (levelMismatch) {
      setError(`File có grammar point khác level ${level}. Chọn đúng level hoặc sửa CSV.`);
      return;
    }

    setIsImporting(true);
    setError(null);
    setStatus(null);
    try {
      const result = await importGrammarPoints(points, { mode });
      clearGrammarCache();
      const list = await fetchGrammarLevels();
      setLevels(list);
      setStatus(
        `Đã import ${result.imported} grammar point ${result.level}. Đã xoá ${result.deleted} point cũ.`
      );
      notify(`✓ Đã import ${result.imported} grammar point ${result.level}.`, 'success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import thất bại.');
    } finally {
      setIsImporting(false);
    }
  };

  const handlePurge = async () => {
    if (purgeConfirm !== 'XOA GRAMMAR' && purgeConfirm !== 'XOÁ GRAMMAR') {
      setError('Gõ "XOÁ GRAMMAR" để xác nhận.');
      return;
    }
    if (!window.confirm('Xoá toàn bộ grammar point, level và bài tập grammar cũ? Không thể hoàn tác.')) {
      return;
    }
    setIsPurging(true);
    setError(null);
    setStatus(null);
    try {
      const result = await purgeGrammarData();
      clearGrammarCache();
      setLevels(await fetchGrammarLevels());
      setPurgeConfirm('');
      setStatus(
        `Đã xoá: ${result.grammarPoints} grammar point, ${result.grammarLevels} level, ${result.legacyGrammar} grammar cũ, ${result.legacyExercises} bài tập cũ.`
      );
      notify('Đã xoá dữ liệu grammar.', 'success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể xoá dữ liệu grammar.');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-300 bg-white dark:border-violet-900 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900 dark:bg-violet-950/30 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Quản trị ngữ pháp
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Import CSV theo JLPT level, xuất backup và xoá dữ liệu grammar cũ.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {levels.map((item) => (
            <span
              key={item.level}
              className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-300"
            >
              {item.level}: {item.pointCount}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            JLPT level
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as JlptLevel)}
              className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {JLPT_LEVELS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Chế độ
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'replace' | 'merge')}
              className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="replace">Thay thế toàn bộ level</option>
              <option value="merge">Ghi đè / bổ sung</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => void handleDownloadTemplate()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Tải template CSV
          </button>

          <button
            type="button"
            onClick={() => void handleExport()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileJson className="h-3.5 w-3.5" />
            Xuất {level}
          </button>
        </div>

        <div className="rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/40 p-5 text-center dark:border-violet-800 dark:bg-violet-950/20">
          <Upload className="mx-auto h-6 w-6 text-violet-500" />
          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Chọn ZIP hoặc 7 file CSV
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            grammar_points, grammar_examples, grammar_formation, grammar_usage,
            grammar_mistakes, grammar_comparisons, grammar_relations
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.zip"
            multiple
            onChange={(e) => void handleFiles(e.target.files)}
            className="mt-3 block w-full cursor-pointer text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-violet-700"
          />
        </div>

        {isParsing && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Đang đọc file...</p>
        )}

        {bundleResult && (
          <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {bundleResult.stats.points} point
              </span>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                {bundleResult.stats.examples} ví dụ
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {bundleResult.stats.formation} cấu trúc
              </span>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {bundleResult.issues.length} lỗi
              </span>
            </div>

            {levelMismatch && (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                File có point không thuộc {level}. Chọn đúng level hoặc tách file theo level.
              </p>
            )}

            {bundleResult.issues.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-rose-50 p-3 text-[11px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {bundleResult.issues.slice(0, 30).map((issue, index) => (
                  <p key={index} className="flex items-start gap-1">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      {issue.file}
                      {issue.row ? ` · dòng ${issue.row}` : ''}: {issue.message}
                    </span>
                  </p>
                ))}
                {bundleResult.issues.length > 30 && (
                  <p>... và {bundleResult.issues.length - 30} lỗi khác</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={
                isImporting ||
                points.length === 0 ||
                bundleResult.issues.length > 0 ||
                levelMismatch
              }
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isImporting ? 'animate-spin' : ''}`} />
              {isImporting ? 'Đang import...' : `Import ${points.length} point ${level}`}
            </button>
          </div>
        )}

        {status && (
          <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {status}
          </p>
        )}

        {error && (
          <p className="flex items-start gap-1.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <details className="group rounded-2xl border border-rose-200 dark:border-rose-900">
          <summary className="cursor-pointer list-none p-3 text-xs font-bold text-rose-700 dark:text-rose-300">
            Vùng nguy hiểm · xoá toàn bộ grammar
          </summary>
          <div className="space-y-2 border-t border-rose-200 p-3 dark:border-rose-900">
            <p className="text-[11px] text-rose-700 dark:text-rose-300">
              Xoá grammarPoints, grammarLevels, collection grammar cũ và grammarExercises cũ.
              Hãy xuất CSV backup trước.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={purgeConfirm}
                onChange={(e) => setPurgeConfirm(e.target.value)}
                placeholder="Gõ XOÁ GRAMMAR"
                className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs dark:border-rose-800 dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => void handlePurge()}
                disabled={isPurging}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isPurging ? 'Đang xoá...' : 'Xoá toàn bộ grammar'}
              </button>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
