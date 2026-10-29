import { useEffect, useMemo, useState } from 'react';
import {
  ListChecks,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react';
import {
  JLPT_LEVELS,
  fetchGrammarPoints,
  isGrammarAdmin
} from '../services/grammarStore';
import {
  deleteGrammarExercise,
  fetchGrammarExercises,
  saveGrammarExercise
} from '../services/grammarExerciseStore';
import type { User } from '../services/firebase';
import type {
  Grammar,
  GrammarExercise,
  GrammarExerciseType,
  JlptLevel
} from '@raku/core';
import { GrammarExerciseFormModal } from './GrammarExerciseFormModal';
import { GrammarExercisePlayer } from './GrammarExercisePlayer';

interface GrammarExerciseViewProps {
  user: User | null;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning') => void;
  initialTarget?: { grammarId: string; level: JlptLevel } | null;
}

const TYPE_OPTIONS: Array<{ value: GrammarExerciseType | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả loại' },
  { value: 'fill_blank', label: 'Điền chỗ trống' },
  { value: 'order', label: 'Sắp xếp câu' },
  { value: 'translate_jp_vi', label: 'Dịch Nhật → Việt' },
  { value: 'translate_vi_jp', label: 'Dịch Việt → Nhật' },
  { value: 'K7', label: 'Trắc nghiệm' }
];

function typeLabel(type: string): string {
  return TYPE_OPTIONS.find((option) => option.value === type)?.label || 'Trắc nghiệm';
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function GrammarExerciseView({
  user,
  onNotify,
  initialTarget
}: GrammarExerciseViewProps) {
  const [exercises, setExercises] = useState<GrammarExercise[]>([]);
  const [grammarPoints, setGrammarPoints] = useState<Grammar[]>([]);
  const [level, setLevel] = useState<JlptLevel>(initialTarget?.level || 'N3');
  const [grammarFilter, setGrammarFilter] = useState<string>(initialTarget?.grammarId || 'all');
  const [typeFilter, setTypeFilter] = useState<GrammarExerciseType | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<GrammarExercise | null>(null);
  const [practice, setPractice] = useState<{
    title: string;
    exercises: GrammarExercise[];
    pool: GrammarExercise[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const notify = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    onNotify?.(message, type);
  };

  const loadExercises = async () => {
    setIsLoading(true);
    const list = await fetchGrammarExercises();
    setExercises(list);
    setIsLoading(false);
  };

  useEffect(() => {
    void loadExercises();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const admin = await isGrammarAdmin(user?.uid);
      if (!cancelled) setIsAdmin(admin);
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;
    const loadGrammar = async () => {
      const list = await fetchGrammarPoints(level);
      if (cancelled) return;
      setGrammarPoints(list);
      setGrammarFilter((current) =>
        current === 'all' || list.some((grammar) => grammar.id === current) ? current : 'all'
      );
    };
    void loadGrammar();
    return () => {
      cancelled = true;
    };
  }, [level]);

  useEffect(() => {
    if (!initialTarget) return;
    setLevel(initialTarget.level);
    setGrammarFilter(initialTarget.grammarId);
    setPractice(null);
  }, [initialTarget]);

  const levelCounts = useMemo(() => {
    const map = new Map<JlptLevel, number>();
    for (const exercise of exercises) {
      map.set(exercise.jlpt, (map.get(exercise.jlpt) || 0) + 1);
    }
    return map;
  }, [exercises]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const exercise of exercises) {
      if (exercise.jlpt !== level) continue;
      for (const tag of exercise.tags) set.add(tag);
    }
    return Array.from(set).sort();
  }, [exercises, level]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return exercises.filter((exercise) => {
      if (exercise.jlpt !== level) return false;
      if (grammarFilter !== 'all' && exercise.grammarId !== grammarFilter) return false;
      if (typeFilter !== 'all' && exercise.type !== typeFilter) return false;
      if (tagFilter !== 'all' && !exercise.tags.includes(tagFilter)) return false;
      if (!query) return true;
      return (
        exercise.grammarPattern.toLowerCase().includes(query) ||
        exercise.grammarTitle.toLowerCase().includes(query) ||
        exercise.prompt.toLowerCase().includes(query) ||
        exercise.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [exercises, level, grammarFilter, typeFilter, tagFilter, searchQuery]);

  const selectedGrammarName =
    grammarFilter === 'all'
      ? 'Bài tập'
      : grammarPoints.find((grammar) => grammar.id === grammarFilter)?.pattern || 'Bài tập';

  const startPractice = (items: GrammarExercise[], title: string) => {
    if (items.length === 0) return;
    setPractice({ title, exercises: items, pool: items });
  };

  const startRandom = () => {
    const selected = shuffle(filtered).slice(0, 10);
    startPractice(selected, `${level} · 10 câu ngẫu nhiên`);
  };

  const loadMore = () => {
    if (!practice) return;
    const existing = new Set(practice.exercises.map((exercise) => exercise.id));
    const next = practice.pool
      .filter((exercise) => !existing.has(exercise.id))
      .slice(0, 10);
    if (next.length === 0) {
      notify('Đã hết bài trong bộ lọc hiện tại.', 'info');
      return;
    }
    setPractice({
      ...practice,
      exercises: [...practice.exercises, ...next]
    });
  };

  const handleSave = async (exercise: GrammarExercise) => {
    await saveGrammarExercise(exercise);
    await loadExercises();
    notify(`✓ Đã lưu bài tập cho ${exercise.grammarPattern}.`, 'success');
  };

  const handleDelete = async (exercise: GrammarExercise) => {
    if (!window.confirm(`Xoá bài tập "${exercise.grammarPattern}"?`)) return;
    try {
      await deleteGrammarExercise(exercise.id);
      await loadExercises();
      notify('✓ Đã xoá bài tập.', 'success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể xoá bài tập.');
    }
  };

  const openCreate = () => {
    if (grammarPoints.length === 0) {
      setError(`Chưa có grammar point ${level}. Import grammar trước.`);
      return;
    }
    setEditingExercise(null);
    setIsFormOpen(true);
  };

  const renderCard = (exercise: GrammarExercise) => {
    const prompt =
      exercise.type === 'fill_blank'
        ? exercise.prompt.replace(/\{\{blank\}\}/g, '（　　　）')
        : exercise.prompt;

    return (
      <div
        key={exercise.id}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {typeLabel(exercise.type)}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {exercise.grammarPattern}
          </span>
          <span className="text-[10px] text-slate-400">Độ khó {exercise.difficulty}</span>
          {exercise.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-600 dark:bg-violet-950/60 dark:text-violet-300"
            >
              #{tag}
            </span>
          ))}
        </div>

        <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-100">
          {prompt}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => startPractice([exercise], exercise.grammarPattern)}
            className="flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-sky-700"
          >
            <Play className="h-3 w-3 fill-current" />
            Luyện
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditingExercise(exercise);
                  setIsFormOpen(true);
                }}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Pencil className="h-3 w-3" />
                Sửa
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(exercise)}
                className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"
              >
                <Trash2 className="h-3 w-3" />
                Xoá
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              <ListChecks className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span>Bài tập ngữ pháp</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Luyện theo cấp độ, grammar point, loại bài hoặc tag.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadExercises()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Tạo bài tập
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          {JLPT_LEVELS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setLevel(item);
                setGrammarFilter('all');
                setTagFilter('all');
                setPractice(null);
              }}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition ${
                level === item
                  ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {item}
              <span className="ml-1 font-mono text-[10px] font-normal text-slate-400">
                {levelCounts.get(item) || 0}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm bài tập..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <select
            value={grammarFilter}
            onChange={(e) => setGrammarFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">Tất cả grammar point</option>
            {grammarPoints.map((grammar) => (
              <option key={grammar.id} value={grammar.id}>
                {grammar.pattern}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as GrammarExerciseType | 'all')}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">Tất cả tag</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => startPractice(filtered, `${level} · ${selectedGrammarName}`)}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Luyện tất cả ({filtered.length})
          </button>
          <button
            type="button"
            onClick={startRandom}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-sky-300 px-3.5 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950"
          >
            10 câu ngẫu nhiên
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </p>
        )}
      </div>

      {practice ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <GrammarExercisePlayer
            exercises={practice.exercises}
            title={practice.title}
            canLoadMore={practice.pool.length > practice.exercises.length}
            onLoadMore={loadMore}
            onExit={() => setPractice(null)}
          />
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white py-12 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Đang tải bài tập...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <ListChecks className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            Chưa có bài tập cho mục này.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {isAdmin
              ? 'Bấm "Tạo bài tập" để thêm bài đầu tiên.'
              : 'Admin sẽ bổ sung bài tập sau.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filtered.map(renderCard)}
        </div>
      )}

      {isFormOpen && (
        <GrammarExerciseFormModal
          isOpen={isFormOpen}
          grammarPoints={grammarPoints}
          initialGrammarId={grammarFilter === 'all' ? null : grammarFilter}
          editing={editingExercise}
          createdByUid={user?.uid || ''}
          createdByName={user?.displayName || user?.email?.split('@')[0]}
          onClose={() => {
            setIsFormOpen(false);
            setEditingExercise(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
