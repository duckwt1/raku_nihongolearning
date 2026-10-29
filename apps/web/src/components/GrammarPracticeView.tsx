import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search
} from 'lucide-react';
import type { Grammar, GrammarLevel, JlptLevel } from '@raku/core';
import type { User } from '../services/firebase';
import {
  JLPT_LEVELS,
  fetchGrammarLevels,
  fetchGrammarPoints
} from '../services/grammarStore';

interface GrammarPracticeViewProps {
  user: User | null;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

function Section({
  title,
  children,
  defaultOpen = false
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!children) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-left dark:bg-slate-800/60"
        aria-expanded={open}
      >
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        )}
      </button>
      {open && <div className="space-y-3 p-4">{children}</div>}
    </div>
  );
}

export function GrammarPracticeView({ user, onNotify }: GrammarPracticeViewProps) {
  const [levels, setLevels] = useState<GrammarLevel[]>([]);
  const [level, setLevel] = useState<JlptLevel>('N3');
  const [points, setPoints] = useState<Grammar[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLevels = useCallback(async () => {
    const list = await fetchGrammarLevels();
    setLevels(list);
  }, []);

  const loadPoints = useCallback(async (targetLevel: JlptLevel) => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchGrammarPoints(targetLevel);
      setPoints(list);
      setSelectedId((current) => {
        if (current && list.some((point) => point.id === current)) return current;
        return list[0]?.id || null;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu ngữ pháp.');
      setPoints([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLevels();
  }, [loadLevels]);

  useEffect(() => {
    void loadPoints(level);
  }, [level, loadPoints]);

  const levelCount = useMemo(() => {
    const map = new Map<JlptLevel, number>();
    for (const item of levels) map.set(item.level, item.pointCount);
    return map;
  }, [levels]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return points;
    return points.filter(
      (point) =>
        point.pattern.toLowerCase().includes(query) ||
        point.title.toLowerCase().includes(query) ||
        point.meaningVi.some((meaning) => meaning.toLowerCase().includes(query)) ||
        point.explanationVi.toLowerCase().includes(query) ||
        point.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [points, searchQuery]);

  const selected = points.find((point) => point.id === selectedId) || null;

  const refresh = async () => {
    await loadLevels();
    await loadPoints(level);
    onNotify?.('Đã làm mới dữ liệu ngữ pháp.', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              <BookOpen className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              <span>Ngữ pháp theo JLPT</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Chọn cấp độ, sau đó chọn mẫu ngữ pháp để xem cấu trúc, cách dùng, so sánh và ví dụ.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          {JLPT_LEVELS.map((item) => {
            const active = item === level;
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setLevel(item);
                  setSearchQuery('');
                }}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition ${
                  active
                    ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-700 dark:text-sky-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {item}
                <span className="ml-1 font-mono text-[10px] font-normal text-slate-400">
                  {levelCount.get(item) || 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Tìm ngữ pháp ${level}...`}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Đang tải ngữ pháp {level}...
          </div>
        ) : error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {points.length === 0
                ? `Chưa có dữ liệu ngữ pháp ${level}.`
                : 'Không tìm thấy mẫu phù hợp.'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {points.length === 0
                ? user
                  ? 'Admin có thể vào Cài đặt → Quản trị ngữ pháp để import CSV.'
                  : 'Dữ liệu sẽ xuất hiện sau khi admin import CSV.'
                : 'Thử từ khóa khác.'}
            </p>
          </div>
        ) : (
          <div className="mt-4 grid max-h-80 grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3">
            {filtered.map((point) => {
              const active = point.id === selectedId;
              return (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => setSelectedId(point.id)}
                  className={`rounded-2xl border p-3.5 text-left transition ${
                    active
                      ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-400 dark:bg-sky-950/60'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {point.pattern}
                    </span>
                    {point.lesson && (
                      <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        Bài {point.lesson}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {point.meaningVi.join(' · ')}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  {selected.pattern}
                </h3>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                  {selected.jlpt}
                </span>
                {selected.lesson && (
                  <span className="text-[11px] text-slate-400">Bài {selected.lesson}</span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                {selected.title}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {selected.meaningVi.map((meaning) => (
              <span
                key={meaning}
                className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                {meaning}
              </span>
            ))}
          </div>

          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {selected.explanationVi}
          </p>

          <div className="space-y-2">
            <Section title="Cấu trúc" defaultOpen>
              {selected.formation.map((item, index) => (
                <div
                  key={`${item.rule}_${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {item.rule}
                  </p>
                  {item.example && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Ví dụ: {item.example}
                    </p>
                  )}
                  {item.note && (
                    <p className="mt-1 text-xs italic text-amber-700 dark:text-amber-300">
                      Lưu ý: {item.note}
                    </p>
                  )}
                </div>
              ))}
            </Section>

            {selected.usage.length > 0 && (
              <Section title="Cách dùng">
                {selected.usage.map((item, index) => (
                  <div
                    key={`${item.situation}_${index}`}
                    className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {item.situation}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.explanationVi}
                    </p>
                    {item.exampleIds.length > 0 && (
                      <p className="mt-1 font-mono text-[10px] text-slate-400">
                        Ví dụ: {item.exampleIds.join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {(selected.nuanceVi || selected.notes.length > 0) && (
              <Section title="Sắc thái & lưu ý">
                {selected.nuanceVi && (
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {selected.nuanceVi}
                  </p>
                )}
                {selected.notes.map((note, index) => (
                  <p
                    key={index}
                    className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    • {note}
                  </p>
                ))}
              </Section>
            )}

            {selected.commonMistakes.length > 0 && (
              <Section title="Lỗi thường gặp">
                {selected.commonMistakes.map((item, index) => (
                  <div
                    key={`${item.mistake}_${index}`}
                    className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900 dark:bg-rose-950/30"
                  >
                    <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                      ✗ {item.mistake}
                    </p>
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                      ✓ {item.correction}
                    </p>
                    {item.explanationVi && (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.explanationVi}
                      </p>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {selected.comparisons.length > 0 && (
              <Section title="So sánh với mẫu gần nghĩa">
                {selected.comparisons.map((item, index) => (
                  <div
                    key={`${item.pattern}_${index}`}
                    className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {item.pattern}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.differenceVi}
                    </p>
                    {item.example && (
                      <div className="mt-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                        <p className="text-xs text-slate-700 dark:text-slate-200">{item.example.jp}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.example.vi}</p>
                      </div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            <Section title="Ví dụ" defaultOpen>
              {selected.examples.map((example, index) => (
                <div
                  key={example.id || index}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <p className="text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-100">
                    {example.jp}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{example.vi}</p>
                  {example.highlight && (
                    <p className="mt-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                      Ngữ pháp: {example.highlight}
                    </p>
                  )}
                  {example.breakdown && (
                    <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {example.breakdown}
                    </p>
                  )}
                  {example.note && (
                    <p className="mt-1 text-[11px] italic text-slate-400">{example.note}</p>
                  )}
                </div>
              ))}
            </Section>
          </div>

          {selected.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {selected.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
