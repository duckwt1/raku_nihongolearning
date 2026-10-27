import { useState, useMemo, useEffect, ChangeEvent } from 'react';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Sparkles,
  Download,
  RotateCcw,
  Folder as FolderIcon,
  Layers,
  Plus,
  Play,
  HardDrive
} from 'lucide-react';
import {
  parseAndFilterImport,
  exportRecordsToDelimited,
  createNewCard,
  type Delimiter,
  type ImportRecord,
  type Folder,
  type Deck,
  type StudyCard
} from '@raku/core';
import { auth } from '../services/firebase';
import { getApiUrl } from '../services/apiClient';

interface ImportViewProps {
  folders?: Folder[];
  decks?: Deck[];
  initialFolderId?: string;
  initialDeckId?: string;
  onImportSuccess?: (count: number) => void;
  onImportCards?: (
    cards: StudyCard[],
    targetDeckId: string,
    newDeck?: Deck,
    newFolder?: Folder
  ) => void;
  onUndoImportCards?: (cardIds: string[]) => void;
  onNavigateToStudy?: (deckId: string) => void;
}

export function ImportView({
  folders = [],
  decks = [],
  initialFolderId,
  initialDeckId,
  onImportSuccess,
  onImportCards,
  onUndoImportCards,
  onNavigateToStudy
}: ImportViewProps) {
  const [inputText, setInputText] = useState('');
  const [delimiter, setDelimiter] = useState<Delimiter>('\t');
  const [hasHeader, setHasHeader] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiConfirm, setShowAiConfirm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'ok' | 'warning' | 'error' | 'duplicate'>('all');

  // Target Folder & Deck Selection State
  const defaultFolderId =
    initialFolderId ||
    folders.find((f) => f.id === 'folder_custom')?.id ||
    folders[0]?.id ||
    '';
  const [selectedFolderId, setSelectedFolderId] = useState<string>(defaultFolderId);

  const availableDecks = useMemo(() => {
    if (!selectedFolderId) return decks;
    return decks.filter((d) => d.folderId === selectedFolderId);
  }, [decks, selectedFolderId]);

  const defaultDeckId = useMemo(() => {
    if (initialDeckId && decks.some((d) => d.id === initialDeckId)) return initialDeckId;
    const customImportDeck = availableDecks.find((d) => d.id === 'deck_custom_import');
    if (customImportDeck) return customImportDeck.id;
    return availableDecks[0]?.id || '';
  }, [availableDecks, initialDeckId, decks]);

  const [selectedDeckId, setSelectedDeckId] = useState<string>(defaultDeckId);

  // Sync selected deck when folder changes
  useEffect(() => {
    if (!availableDecks.some((d) => d.id === selectedDeckId)) {
      setSelectedDeckId(availableDecks[0]?.id || '');
    }
  }, [availableDecks, selectedDeckId]);

  // Create new folder / deck inline state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckType, setNewDeckType] = useState<'word' | 'custom' | 'mixed'>('word');

  // Success Feedback Banner
  const [importSuccessBanner, setImportSuccessBanner] = useState<{
    deckId: string;
    deckName: string;
    count: number;
  } | null>(null);

  // Import History for Undo
  const [importHistory, setImportHistory] = useState<
    Array<{
      id: string;
      deckId: string;
      deckName: string;
      cardIds: string[];
      count: number;
      date: string;
    }>
  >([]);

  // Parse result computed from text and options
  const parseResult = useMemo(() => {
    if (!inputText.trim()) return null;
    return parseAndFilterImport(inputText, {
      delimiter,
      hasHeaderRow: hasHeader
    });
  }, [inputText, delimiter, hasHeader]);

  const [records, setRecords] = useState<ImportRecord[]>([]);

  // Synchronize records when parseResult updates
  useEffect(() => {
    if (parseResult) {
      setRecords(parseResult.records);
    } else {
      setRecords([]);
    }
  }, [parseResult]);

  // Filter records based on active tab
  const filteredRecords = useMemo(() => {
    if (filterStatus === 'all') return records;
    return records.filter((r) => {
      const isDup = r.issues.some((i) => i.includes('Trùng lặp'));
      const isErr = !r.surface || (r.issues.length > 0 && r.confidence < 0.5);
      const isWarn = r.issues.length > 0 && !isErr && !isDup;
      const isOk = r.issues.length === 0;

      if (filterStatus === 'duplicate') return isDup;
      if (filterStatus === 'error') return isErr;
      if (filterStatus === 'warning') return isWarn;
      if (filterStatus === 'ok') return isOk;
      return true;
    });
  }, [records, filterStatus]);

  // Handle file drop / upload (.csv, .tsv, .txt)
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      alert('Tệp vượt quá giới hạn 1 MB. Vui lòng chia nhỏ tệp.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setInputText(text);
    };
    reader.readAsText(file, 'utf-8');
  };

  // AI Import Analysis (Section 5B.4)
  const handleRunAiAnalysis = async () => {
    setShowAiConfirm(false);
    setIsAiLoading(true);
    setAiError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Bạn cần đăng nhập để gửi phân tích AI.');
      }

      const res = await fetch(getApiUrl('/api/ai/import-analyze'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text: inputText })
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error?: string };
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { records: ImportRecord[] };
      if (data.records && data.records.length > 0) {
        setRecords(data.records);
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Lỗi khi gọi AI');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Commit batch import to local storage
  const handleCommitImport = () => {
    const validRecords = records.filter((r) => r.surface.trim().length > 0);
    if (validRecords.length === 0) {
      alert('Không có mục từ hợp lệ nào để nhập.');
      return;
    }

    let finalFolderId = selectedFolderId;
    let newFolderObj: Folder | undefined;
    if (isCreatingFolder || selectedFolderId === '__new__') {
      if (!newFolderName.trim()) {
        alert('Vui lòng nhập tên thư mục mới.');
        return;
      }
      finalFolderId = `folder_custom_${Date.now()}`;
      newFolderObj = {
        id: finalFolderId,
        name: newFolderName.trim(),
        description: 'Thư mục tự tạo từ nhập từ vựng',
        color: '#8b5cf6',
        parentId: null,
        createdAt: new Date().toISOString()
      };
    }

    let finalDeckId = selectedDeckId;
    let newDeckObj: Deck | undefined;
    if (isCreatingDeck || selectedDeckId === '__new__' || !finalDeckId) {
      if (!newDeckName.trim()) {
        alert('Vui lòng nhập tên bộ thẻ (Deck) mới.');
        return;
      }
      finalDeckId = `deck_custom_${Date.now()}`;
      newDeckObj = {
        id: finalDeckId,
        folderId: finalFolderId || null,
        name: newDeckName.trim(),
        description: 'Bộ thẻ tự tạo từ nhập từ vựng',
        cardType: newDeckType,
        cardIds: [],
        newCardsPerDay: 20,
        maxReviewsPerDay: 50,
        isDefault: false,
        createdAt: new Date().toISOString()
      };
    }

    // Convert records to StudyCards
    const createdCards: StudyCard[] = validRecords.map((r, i) => {
      const cardId = `c_word_imp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      const wordId = `w_imp_${Date.now()}_${i}`;
      return {
        id: cardId,
        type: 'word' as const,
        refId: wordId,
        word: {
          id: wordId,
          surface: r.surface,
          readings: r.readings && r.readings.length > 0 ? r.readings : [r.surface],
          meaningVi: r.meaningVi,
          pos: r.pos || '名詞',
          hanVietBreakdown: r.hanViet || [],
          kanji: [],
          exampleIds: [],
          tags: r.tags || ['import']
        },
        deckId: finalDeckId,
        fsrsCard: createNewCard(),
        isNew: true,
        isDue: false
      };
    });

    const newImportId = `imp_${Date.now()}`;
    const targetDeckName =
      newDeckObj?.name ||
      decks.find((d) => d.id === finalDeckId)?.name ||
      'Bộ thẻ đã chọn';

    setImportHistory((prev) => [
      {
        id: newImportId,
        deckId: finalDeckId,
        deckName: targetDeckName,
        cardIds: createdCards.map((c) => c.id),
        count: createdCards.length,
        date: new Date().toLocaleTimeString()
      },
      ...prev
    ]);

    if (onImportCards) {
      onImportCards(createdCards, finalDeckId, newDeckObj, newFolderObj);
    } else if (onImportSuccess) {
      onImportSuccess(createdCards.length);
    }

    setImportSuccessBanner({
      deckId: finalDeckId,
      deckName: targetDeckName,
      count: createdCards.length
    });

    // Reset inputs
    setInputText('');
    setIsCreatingFolder(false);
    setIsCreatingDeck(false);
    setNewFolderName('');
    setNewDeckName('');
  };

  // Undo import batch
  const handleUndoImport = (importId: string) => {
    const item = importHistory.find((h) => h.id === importId);
    if (!item) return;

    if (onUndoImportCards && item.cardIds.length > 0) {
      onUndoImportCards(item.cardIds);
    }

    setImportHistory((prev) => prev.filter((h) => h.id !== importId));
    if (importSuccessBanner?.deckId === item.deckId) {
      setImportSuccessBanner(null);
    }
    alert(`Đã hoàn tác lượt nhập (${item.count} từ) khỏi bộ thẻ "${item.deckName}".`);
  };

  // Export current list to TSV/CSV
  const handleExport = () => {
    if (records.length === 0) return;
    const content = exportRecordsToDelimited(records, delimiter);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raku_vocabulary_export_${Date.now()}.${delimiter === ',' ? 'csv' : 'tsv'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Target Folder & Deck Selection Panel (Local-First) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 bg-sky-50 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400 rounded-2xl border border-sky-100 dark:border-sky-900">
              <FolderIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Chọn Thư mục &amp; Bộ thẻ đích
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Từ vựng khi thêm sẽ được lưu hoàn toàn trên máy (Local-first)
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
            <HardDrive className="w-3.5 h-3.5" />
            <span>Lưu trữ Cục bộ (Local)</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Folder Select */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FolderIcon className="w-3.5 h-3.5 text-sky-600" />
                <span>Thư mục (Folder):</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingFolder(!isCreatingFolder);
                  if (!isCreatingFolder) {
                    setIsCreatingDeck(true);
                  }
                }}
                className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                <span>{isCreatingFolder ? 'Chọn thư mục có sẵn' : 'Tạo thư mục mới'}</span>
              </button>
            </div>

            {isCreatingFolder ? (
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Ví dụ: JLPT N2, Từ vựng chuyên ngành..."
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-sky-400 bg-sky-50/40 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
              />
            ) : (
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100 font-medium"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Deck Select */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>Bộ thẻ (Deck):</span>
              </label>
              <button
                type="button"
                onClick={() => setIsCreatingDeck(!isCreatingDeck)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                <span>{isCreatingDeck ? 'Chọn bộ thẻ có sẵn' : 'Tạo bộ thẻ mới'}</span>
              </button>
            </div>

            {isCreatingDeck ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="Ví dụ: Bài 1 - Từ vựng Mimikara..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-indigo-400 bg-indigo-50/40 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                />
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-slate-500">Loại thẻ:</span>
                  <select
                    value={newDeckType}
                    onChange={(e) => setNewDeckType(e.target.value as any)}
                    className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="word">Từ vựng (Word)</option>
                    <option value="custom">Tự do (Custom)</option>
                    <option value="mixed">Hỗn hợp (Mixed)</option>
                  </select>
                </div>
              </div>
            ) : (
              <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100 font-medium"
              >
                {availableDecks.length === 0 ? (
                  <option value="">(Chưa có deck nào trong thư mục này - Bấm Tạo bộ thẻ mới)</option>
                ) : (
                  availableDecks.map((d) => (
                    <option key={d.id} value={d.id}>
                      🗂️ {d.name}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>
        </div>

        {/* Success Banner if just imported */}
        {importSuccessBanner && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Đã thêm thành công <strong>{importSuccessBanner.count} từ vựng</strong> vào bộ thẻ "
                <strong>{importSuccessBanner.deckName}</strong>" (Lưu an toàn trên máy).
              </span>
            </div>
            {onNavigateToStudy && (
              <button
                onClick={() => onNavigateToStudy(importSuccessBanner.deckId)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Ôn tập ngay</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Input Card: Paste Text / File Upload / AI */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
          <Upload className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          <span>Nhập từ vựng (Kiểu Quizlet &amp; AI)</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Dán văn bản nhiều dòng, tải tệp CSV/TSV, hoặc dùng AI để trích xuất tự động từ bài học tự do.
        </p>

        {/* Input Text Area & Upload */}
        <div className="mt-4 space-y-3">
          <textarea
            rows={5}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Dán văn bản vào đây, ví dụ kiểu Quizlet (Tab):
預かる	あずかる	nhận giữ; chăm sóc	動詞
荷物	にもつ	hành lý	名詞`}
            className="w-full p-4 font-mono text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <label className="font-semibold text-slate-700 dark:text-slate-300">Ký tự tách:</label>
              <select
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value as Delimiter)}
                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              >
                <option value={'\t'}>Tab (\t - Quizlet)</option>
                <option value={','}>Dấu phẩy (CSV)</option>
                <option value={';'}>Dấu chấm phẩy (;)</option>
                <option value={'|'}>Dấu gạch đứng (|)</option>
              </select>

              <label className="flex items-center space-x-1.5 ml-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-slate-600 dark:text-slate-300">Dòng đầu là tiêu đề</span>
              </label>
            </div>

            <div className="flex items-center space-x-2">
              {/* File upload button */}
              <label className="cursor-pointer px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium flex items-center space-x-1 transition touch-target">
                <FileText className="w-4 h-4" />
                <span>Tải tệp (.csv / .tsv / .txt)</span>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {/* AI Analyze trigger */}
              <button
                type="button"
                onClick={() => setShowAiConfirm(true)}
                disabled={isAiLoading || !inputText.trim()}
                className="px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white rounded-xl font-semibold flex items-center space-x-1 shadow-xs transition touch-target disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>AI Phân Tích</span>
              </button>
            </div>
          </div>
        </div>

        {/* AI Error Alert */}
        {aiError && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{aiError}</span>
          </div>
        )}
      </div>

      {/* AI Confirmation / Cost Estimate Modal */}
      {showAiConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400">
              <Sparkles className="w-6 h-6" />
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Xác nhận phân tích bằng AI
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Mô hình AI sẽ trích xuất danh sách từ vựng từ văn bản tự do, bổ sung cách đọc và nghĩa tiếng Việt.
            </p>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
              <div>Số ký tự gửi đi: <strong>{inputText.length}</strong></div>
              <div>Ước tính token: <strong>~{Math.round(inputText.length / 3)} tokens</strong></div>
              <div className="text-[11px] text-slate-400 mt-1">
                Lưu ý: Nội dung sẽ được gửi tới nhà cung cấp mô hình AI để xử lý. Bạn luôn có thể sửa hoặc bỏ qua trước khi lưu.
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowAiConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleRunAiAnalysis}
                className="px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-xs"
              >
                Tiến hành gửi AI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Preview & Screening Table */}
      {records.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Bảng xem trước &amp; Sàng lọc ({records.length} mục)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Đích: <strong>{decks.find((d) => d.id === selectedDeckId)?.name || newDeckName || 'Bộ thẻ mới'}</strong> · Lưu cục bộ trên máy
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleExport}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1 transition"
                title="Xuất danh sách ra tệp"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Xuất tệp</span>
              </button>
              <button
                onClick={handleCommitImport}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Lưu {records.length} từ vào máy</span>
              </button>
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-2 text-xs">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filterStatus === 'all'
                  ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Tất cả ({records.length})
            </button>
            <button
              onClick={() => setFilterStatus('ok')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filterStatus === 'ok'
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Hợp lệ ({records.filter((r) => r.issues.length === 0).length})
            </button>
            <button
              onClick={() => setFilterStatus('warning')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filterStatus === 'warning'
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Cảnh báo ({records.filter((r) => r.issues.length > 0 && r.confidence >= 0.5).length})
            </button>
            <button
              onClick={() => setFilterStatus('duplicate')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filterStatus === 'duplicate'
                  ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Trùng lặp ({records.filter((r) => r.issues.some((i) => i.includes('Trùng'))).length})
            </button>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto max-h-96 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-50 dark:bg-slate-800/80 uppercase text-[10px] text-slate-400 font-semibold sticky top-0">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Chữ Hán / Từ</th>
                  <th className="p-3">Cách đọc</th>
                  <th className="p-3">Nghĩa tiếng Việt</th>
                  <th className="p-3">Hán Việt</th>
                  <th className="p-3">Nguồn</th>
                  <th className="p-3">Tình trạng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRecords.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-3 text-slate-400">{r.sourceRow}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-slate-100 font-sans text-sm">
                      {r.surface}
                    </td>
                    <td className="p-3 text-sky-600 dark:text-sky-400 font-medium">
                      {r.readings.join(', ')}
                    </td>
                    <td className="p-3">{r.meaningVi}</td>
                    <td className="p-3 text-slate-400">{r.hanViet?.join(' ') || '-'}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800">
                        {r.provenance.readings || r.provenance.surface || 'user'}
                      </span>
                    </td>
                    <td className="p-3">
                      {r.issues.length === 0 ? (
                        <span className="inline-flex items-center text-emerald-600 text-[11px] font-medium">
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />
                          Hợp lệ
                        </span>
                      ) : (
                        <span className="text-amber-600 text-[11px]" title={r.issues.join(', ')}>
                          {r.issues[0]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import History & Undo */}
      {importHistory.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-3">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
            <RotateCcw className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>Lịch sử nhập &amp; Khả năng hoàn tác</span>
          </h3>
          <div className="space-y-2">
            {importHistory.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Lần nhập lúc {item.date}
                  </span>
                  <span className="text-slate-500 ml-2">
                    ({item.count} từ vào bộ thẻ "{item.deckName}")
                  </span>
                </div>
                <button
                  onClick={() => handleUndoImport(item.id)}
                  className="px-3 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-semibold transition"
                >
                  Hoàn tác lần nhập này
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
