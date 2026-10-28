import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  FileJson,
  Globe,
  Lock,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users
} from 'lucide-react';
import {
  SEED_GRAMMAR,
  generateSeedGrammarExercises,
  type Grammar,
  type GrammarExerciseRecord,
  type Question
} from '@raku/core';
import type { User } from '../services/firebase';
import {
  createGrammarExerciseId,
  deleteGrammarExerciseFromCloud,
  fetchPublicGrammarExercises,
  loadLocalGrammarExercises,
  mergeGrammarExercises,
  publishGrammarExercise,
  saveLocalGrammarExercises,
  unpublishGrammarExercise
} from '../services/grammarExerciseStore';
import { GrammarExerciseFormModal } from './GrammarExerciseFormModal';
import { GrammarExerciseImportModal } from './GrammarExerciseImportModal';
import { GrammarExercisePlayer } from './GrammarExercisePlayer';
import { GrammarAiGeneratorModal } from './GrammarAiGeneratorModal';

interface GrammarPracticeViewProps {
  user: User | null;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

type ExerciseTab = 'mine' | 'community' | 'samples';
type ExerciseSource = ExerciseTab;

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

function seedRecord(grammarId: string, question: Question): GrammarExerciseRecord {
  return {
    ...question,
    grammarId,
    ownerUid: 'seed',
    authorName: 'Raku',
    visibility: 'public',
    createdAt: '',
    updatedAt: ''
  };
}

export function GrammarPracticeView({ user, onNotify }: GrammarPracticeViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrammarId, setSelectedGrammarId] = useState<string>(
    () => SEED_GRAMMAR[0]?.id || ''
  );
  const [localExercises, setLocalExercises] = useState<GrammarExerciseRecord[]>([]);
  const [publicExercises, setPublicExercises] = useState<GrammarExerciseRecord[]>([]);
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [activeTab, setActiveTab] = useState<ExerciseTab>('mine');
  const [practice, setPractice] = useState<{
    title: string;
    exercises: GrammarExerciseRecord[];
  } | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<GrammarExerciseRecord | null>(null);
  const [initialDraft, setInitialDraft] = useState<Question | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);

  const ownerUid = user?.uid || 'guest';
  const authorName =
    user?.displayName || user?.email?.split('@')[0] || 'Thành viên';
  const canPublish = Boolean(user && !user.isAnonymous);

  const notify = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    onNotify?.(message, type);
  };

  const selectedGrammar: Grammar | null = useMemo(() => {
    return SEED_GRAMMAR.find((grammar) => grammar.id === selectedGrammarId) || SEED_GRAMMAR[0] || null;
  }, [selectedGrammarId]);

  const refreshPublic = async () => {
    setIsLoadingPublic(true);
    const remote = await fetchPublicGrammarExercises();
    setPublicExercises(remote);
    setIsLoadingPublic(false);
  };

  useEffect(() => {
    setLocalExercises(loadLocalGrammarExercises(ownerUid));
  }, [ownerUid]);

  useEffect(() => {
    void refreshPublic();
    // Chỉ tải một lần khi mở tab; dữ liệu public không phụ thuộc user.
  }, []);

  const filteredGrammar = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return SEED_GRAMMAR;
    return SEED_GRAMMAR.filter(
      (grammar) =>
        grammar.title.toLowerCase().includes(query) ||
        grammar.explanationVi.toLowerCase().includes(query) ||
        grammar.examples.some(
          (example) =>
            example.jp.includes(searchQuery) || example.vi.toLowerCase().includes(query)
        )
    );
  }, [searchQuery]);

  const mergedExercises = useMemo(
    () => mergeGrammarExercises(localExercises, publicExercises),
    [localExercises, publicExercises]
  );

  const exerciseCountByGrammar = useMemo(() => {
    const counts = new Map<string, number>();
    for (const exercise of mergedExercises) {
      counts.set(exercise.grammarId, (counts.get(exercise.grammarId) || 0) + 1);
    }
    return counts;
  }, [mergedExercises]);

  const grammarExercises = useMemo(
    () =>
      selectedGrammar
        ? mergedExercises.filter((exercise) => exercise.grammarId === selectedGrammar.id)
        : [],
    [mergedExercises, selectedGrammar]
  );

  const mineExercises = useMemo(
    () => grammarExercises.filter((exercise) => exercise.ownerUid === ownerUid),
    [grammarExercises, ownerUid]
  );

  const communityExercises = useMemo(
    () =>
      grammarExercises.filter(
        (exercise) => exercise.visibility === 'public' && exercise.ownerUid !== ownerUid
      ),
    [grammarExercises, ownerUid]
  );

  const sampleExercises = useMemo(() => {
    if (!selectedGrammar) return [];
    const existingPrompts = new Set(grammarExercises.map((exercise) => exercise.prompt));
    return generateSeedGrammarExercises(selectedGrammar, SEED_GRAMMAR)
      .filter((exercise) => !existingPrompts.has(exercise.prompt))
      .map((exercise) => seedRecord(selectedGrammar.id, exercise));
  }, [selectedGrammar, grammarExercises]);

  const allExercisesForPractice = useMemo(
    () => [...mineExercises, ...communityExercises, ...sampleExercises],
    [mineExercises, communityExercises, sampleExercises]
  );

  const persistLocal = (records: GrammarExerciseRecord[]) => {
    setLocalExercises(records);
    saveLocalGrammarExercises(ownerUid, records);
  };

  const upsertLocal = (record: GrammarExerciseRecord) => {
    persistLocal([...localExercises.filter((item) => item.id !== record.id), record]);
  };

  const removeLocal = (exerciseId: string) => {
    persistLocal(localExercises.filter((item) => item.id !== exerciseId));
  };

  const handleSaveExercise = async (
    record: GrammarExerciseRecord,
    options: { publish: boolean }
  ) => {
    const previous = localExercises.find((item) => item.id === record.id);
    const nextRecord: GrammarExerciseRecord = {
      ...record,
      visibility: options.publish ? 'public' : 'private',
      updatedAt: new Date().toISOString()
    };
    upsertLocal(nextRecord);

    try {
      if (options.publish) {
        await publishGrammarExercise(nextRecord);
        await refreshPublic();
        notify('✓ Đã lưu và công khai bài tập lên ngân hàng.', 'success');
      } else {
        if (previous?.visibility === 'public') {
          await unpublishGrammarExercise(record.id);
          await refreshPublic();
        }
        notify('✓ Đã lưu bài tập.', 'success');
      }
    } catch (err) {
      if (previous) {
        upsertLocal(previous);
      } else {
        removeLocal(record.id);
      }
      notify(
        `Không thể đồng bộ bài tập lên ngân hàng: ${err instanceof Error ? err.message : err}`,
        'warning'
      );
      throw err;
    }
  };

  const handleToggleVisibility = async (record: GrammarExerciseRecord) => {
    if (record.ownerUid !== ownerUid) return;

    if (record.visibility === 'public') {
      const next = { ...record, visibility: 'private' as const, updatedAt: new Date().toISOString() };
      upsertLocal(next);
      try {
        await unpublishGrammarExercise(record.id);
        await refreshPublic();
        notify('✓ Đã gỡ bài tập khỏi ngân hàng chung.', 'info');
      } catch (err) {
        upsertLocal(record);
        notify(`Không thể gỡ bài tập: ${err instanceof Error ? err.message : err}`, 'warning');
      }
      return;
    }

    if (!canPublish) {
      notify('Đăng nhập bằng tài khoản (không phải ẩn danh) để công khai bài tập.', 'warning');
      return;
    }

    const next = { ...record, visibility: 'public' as const, updatedAt: new Date().toISOString() };
    upsertLocal(next);
    try {
      await publishGrammarExercise(next);
      await refreshPublic();
      notify('✓ Đã công khai bài tập lên ngân hàng chung.', 'success');
    } catch (err) {
      upsertLocal(record);
      notify(`Không thể công khai bài tập: ${err instanceof Error ? err.message : err}`, 'warning');
    }
  };

  const handleDeleteExercise = async (record: GrammarExerciseRecord) => {
    if (record.ownerUid !== ownerUid) return;
    if (!window.confirm('Xoá bài tập này? Thao tác không thể hoàn tác.')) return;

    removeLocal(record.id);
    if (record.visibility === 'public') {
      try {
        await deleteGrammarExerciseFromCloud(record.id);
        await refreshPublic();
      } catch (err) {
        notify(`Đã xoá trên máy nhưng chưa xoá được bản công khai: ${err instanceof Error ? err.message : err}`, 'warning');
        return;
      }
    }
    notify('✓ Đã xoá bài tập.', 'success');
  };

  const handleCopyExercise = (record: GrammarExerciseRecord) => {
    const now = new Date().toISOString();
    const copy: GrammarExerciseRecord = {
      ...record,
      id: createGrammarExerciseId(ownerUid),
      ownerUid,
      authorName,
      visibility: 'private',
      copyOf: record.id,
      createdAt: now,
      updatedAt: now
    };
    upsertLocal(copy);
    setActiveTab('mine');
    notify('✓ Đã lưu bài tập vào bộ của bạn.', 'success');
  };

  const handleImport = async (
    records: GrammarExerciseRecord[],
    options: { publish: boolean }
  ) => {
    const next = [...localExercises];
    for (const record of records) {
      const index = next.findIndex((item) => item.id === record.id);
      if (index >= 0) next[index] = record;
      else next.push(record);
    }
    persistLocal(next);

    if (options.publish) {
      for (const record of records) {
        await publishGrammarExercise(record);
      }
      await refreshPublic();
    }
    notify(`✓ Đã lưu ${records.length} bài tập.`, 'success');
  };

  const openCreate = () => {
    setEditingExercise(null);
    setInitialDraft(null);
    setIsFormOpen(true);
  };

  const openEdit = (record: GrammarExerciseRecord) => {
    setEditingExercise(record);
    setInitialDraft(null);
    setIsFormOpen(true);
  };

  const startPractice = (exercises: GrammarExerciseRecord[], title: string) => {
    if (exercises.length === 0) return;
    setPractice({ title, exercises });
  };

  const activeExercises =
    activeTab === 'mine'
      ? mineExercises
      : activeTab === 'community'
        ? communityExercises
        : sampleExercises;

  const renderExerciseCard = (record: GrammarExerciseRecord, source: ExerciseSource) => {
    const isOwner = record.ownerUid === ownerUid;
    const prompt =
      record.type === 'fill_blank'
        ? record.prompt.replace(/\{\{blank\}\}/g, '（　　　）')
        : record.prompt;

    return (
      <div
        key={record.id}
        className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {typeLabel(record.type)}
          </span>
          {record.provenance.origin === 'ai' && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
              AI hỗ trợ
            </span>
          )}
          {record.provenance.origin === 'seed' && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Bài mẫu
            </span>
          )}
          {source === 'mine' && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                record.visibility === 'public'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {record.visibility === 'public' ? (
                <Globe className="h-2.5 w-2.5" />
              ) : (
                <Lock className="h-2.5 w-2.5" />
              )}
              {record.visibility === 'public' ? 'Công khai' : 'Riêng tư'}
            </span>
          )}
          {record.authorName && (
            <span className="text-[10px] text-slate-400">· {record.authorName}</span>
          )}
        </div>

        <p className="mt-2 whitespace-pre-line text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-100">
          {prompt}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => startPractice([record], selectedGrammar?.title || 'Ngữ pháp')}
            className="flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-sky-700"
          >
            <Play className="h-3 w-3 fill-current" />
            Luyện
          </button>

          {source === 'mine' && isOwner && (
            <>
              <button
                type="button"
                onClick={() => openEdit(record)}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Pencil className="h-3 w-3" />
                Sửa
              </button>
              <button
                type="button"
                onClick={() => void handleToggleVisibility(record)}
                className="flex items-center gap-1 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
              >
                {record.visibility === 'public' ? (
                  <>
                    <Lock className="h-3 w-3" />
                    Gỡ công khai
                  </>
                ) : (
                  <>
                    <Globe className="h-3 w-3" />
                    Công khai
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteExercise(record)}
                className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"
              >
                <Trash2 className="h-3 w-3" />
                Xoá
              </button>
            </>
          )}

          {source !== 'mine' && (
            <button
              type="button"
              onClick={() => handleCopyExercise(record)}
              className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Plus className="h-3 w-3" />
              Lưu vào bộ của tôi
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center space-x-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              <BookOpen className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              <span>Tổng Hợp Ngữ Pháp N3 ({SEED_GRAMMAR.length} điểm)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Chọn một mẫu ngữ pháp để xem giải thích, ví dụ và luyện bài tập.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm ngữ pháp (ví dụ: うちに, わけ, ため...)"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-64"
            />
          </div>
        </div>

        <div className="grid max-h-80 grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3">
          {filteredGrammar.map((grammar) => {
            const isSelected = selectedGrammar?.id === grammar.id;
            const count = exerciseCountByGrammar.get(grammar.id) || 0;
            return (
              <button
                key={grammar.id}
                onClick={() => {
                  setSelectedGrammarId(grammar.id);
                  setPractice(null);
                  setActiveTab('mine');
                }}
                className={`flex flex-col justify-between rounded-2xl border p-3.5 text-left transition touch-target ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-400 dark:bg-sky-950/60'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {grammar.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                    {grammar.jlpt || 'N3'}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {grammar.explanationVi}
                  </p>
                  <span className="shrink-0 text-[10px] font-mono text-slate-400">
                    {count > 0 ? `${count} bài` : 'Bài mẫu'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedGrammar && (
        <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              {selectedGrammar.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {selectedGrammar.explanationVi}
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Ví dụ
            </h4>
            <div className="space-y-2">
              {selectedGrammar.examples.map((example, index) => (
                <div
                  key={`${selectedGrammar.id}_${index}`}
                  className="space-y-1 rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/60"
                >
                  <div className="text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-100">
                    {example.jp}
                  </div>
                  {example.vi && !example.vi.startsWith('Ví dụ minh họa cho mẫu câu') && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">{example.vi}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-base font-bold text-slate-800 dark:text-slate-100">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Ngân hàng bài tập
              </h4>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => startPractice(allExercisesForPractice, selectedGrammar.title)}
                  disabled={allExercisesForPractice.length === 0}
                  className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Play className="h-3 w-3 fill-current" />
                  Luyện tất cả ({allExercisesForPractice.length})
                </button>
                <button
                  type="button"
                  onClick={openCreate}
                  className="flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm bài
                </button>
                <button
                  type="button"
                  onClick={() => setIsImportOpen(true)}
                  className="flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  Nhập JSON
                </button>
                <button
                  type="button"
                  onClick={() => setIsAiOpen(true)}
                  className="flex items-center gap-1 rounded-xl border border-violet-300 px-3 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI tạo
                </button>
              </div>
            </div>

            {practice ? (
              <GrammarExercisePlayer
                exercises={practice.exercises}
                title={practice.title}
                onExit={() => setPractice(null)}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveTab('mine')}
                    className={`rounded-lg px-3 py-1.5 transition ${
                      activeTab === 'mine'
                        ? 'bg-white font-bold text-sky-600 shadow-sm dark:bg-slate-700 dark:text-sky-300'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Bài của tôi ({mineExercises.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('community')}
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 transition ${
                      activeTab === 'community'
                        ? 'bg-white font-bold text-sky-600 shadow-sm dark:bg-slate-700 dark:text-sky-300'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Users className="h-3 w-3" />
                    Cộng đồng ({communityExercises.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('samples')}
                    className={`rounded-lg px-3 py-1.5 transition ${
                      activeTab === 'samples'
                        ? 'bg-white font-bold text-sky-600 shadow-sm dark:bg-slate-700 dark:text-sky-300'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Bài mẫu ({sampleExercises.length})
                  </button>
                </div>

                {isLoadingPublic && activeTab === 'community' ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    Đang tải bài tập cộng đồng...
                  </p>
                ) : activeExercises.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      Chưa có bài tập trong mục này.
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Thêm bài thủ công, nhập JSON hoặc lưu bài mẫu về bộ của bạn.
                    </p>
                    {activeTab === 'mine' && (
                      <button
                        type="button"
                        onClick={openCreate}
                        className="mt-3 inline-flex items-center gap-1 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Thêm bài tập đầu tiên
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {activeExercises.map((record) => renderExerciseCard(record, activeTab))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {selectedGrammar && (
        <>
          <GrammarExerciseFormModal
            isOpen={isFormOpen}
            grammar={selectedGrammar}
            allGrammar={SEED_GRAMMAR}
            ownerUid={ownerUid}
            authorName={authorName}
            canPublish={canPublish}
            editing={editingExercise}
            initialDraft={initialDraft}
            onClose={() => {
              setIsFormOpen(false);
              setEditingExercise(null);
              setInitialDraft(null);
            }}
            onSave={handleSaveExercise}
          />

          <GrammarExerciseImportModal
            isOpen={isImportOpen}
            grammar={selectedGrammar}
            ownerUid={ownerUid}
            authorName={authorName}
            canPublish={canPublish}
            onClose={() => setIsImportOpen(false)}
            onImport={handleImport}
          />

          <GrammarAiGeneratorModal
            isOpen={isAiOpen}
            grammar={selectedGrammar}
            ownerUid={ownerUid}
            authorName={authorName}
            onClose={() => setIsAiOpen(false)}
            onSave={async (records) => {
              await handleImport(records, { publish: false });
            }}
          />
        </>
      )}
    </div>
  );
}
