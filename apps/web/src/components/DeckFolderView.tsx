import { useState } from 'react';
import {
  Folder as FolderIcon,
  FolderOpen,
  Layers,
  Plus,
  Play,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Languages,
  PenTool,
  Sparkles,
  Trash2
} from 'lucide-react';
import type { Deck, Folder } from '@raku/core';
import type { StudyCard } from '@raku/core';
import { calculateDeckCounts, calculateFolderCounts } from '@raku/core';

interface DeckFolderViewProps {
  folders: Folder[];
  decks: Deck[];
  cards: StudyCard[];
  onSelectDeckToStudy: (deck: Deck) => void;
  onSelectFolderToStudy: (folder: Folder) => void;
  onCreateFolder: (name: string, description?: string, color?: string) => void;
  onCreateDeck: (
    folderId: string | null,
    name: string,
    description?: string,
    cardType?: 'word' | 'kanji' | 'grammar' | 'custom' | 'mixed',
    newCardsPerDay?: number,
    maxReviewsPerDay?: number
  ) => void;
  onDeleteDeck?: (deckId: string) => void;
  onDeleteFolder?: (folderId: string) => void;
}

export function DeckFolderView({
  folders,
  decks,
  cards,
  onSelectDeckToStudy,
  onSelectFolderToStudy,
  onCreateFolder,
  onCreateDeck,
  onDeleteDeck,
  onDeleteFolder
}: DeckFolderViewProps) {
  // Collapsed/expanded folders state
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  // Modals state
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [isNewDeckOpen, setIsNewDeckOpen] = useState(false);

  // New Folder form state
  const [folderName, setFolderName] = useState('');
  const [folderDesc, setFolderDesc] = useState('');
  const [folderColor, setFolderColor] = useState('#0284c7');

  // New Deck form state
  const [deckName, setDeckName] = useState('');
  const [deckDesc, setDeckDesc] = useState('');
  const [deckFolderId, setDeckFolderId] = useState<string>('');
  const [deckCardType, setDeckCardType] = useState<
    'word' | 'kanji' | 'grammar' | 'custom' | 'mixed'
  >('word');
  const [deckNewPerDay, setDeckNewPerDay] = useState(20);
  const [deckMaxReviews, setDeckMaxReviews] = useState(50);

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    onCreateFolder(folderName.trim(), folderDesc.trim() || undefined, folderColor);
    setFolderName('');
    setFolderDesc('');
    setIsNewFolderOpen(false);
  };

  const handleCreateDeckSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckName.trim()) return;
    onCreateDeck(
      deckFolderId || null,
      deckName.trim(),
      deckDesc.trim() || undefined,
      deckCardType,
      deckNewPerDay,
      deckMaxReviews
    );
    setDeckName('');
    setDeckDesc('');
    setIsNewDeckOpen(false);
  };

  const getDeckIcon = (type: string) => {
    switch (type) {
      case 'word':
        return <Languages className="w-4 h-4 text-sky-500" />;
      case 'kanji':
        return <PenTool className="w-4 h-4 text-emerald-500" />;
      case 'grammar':
        return <BookOpen className="w-4 h-4 text-amber-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-purple-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top action buttons: Add Folder & Add Deck */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
            <Layers className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            <span>Bộ Thẻ & Thư Mục (Kiểu Anki)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Quản lý và ôn tập theo từng Deck riêng biệt hoặc cả Thư mục JLPT
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsNewFolderOpen(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 transition flex items-center space-x-1.5 touch-target shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Thư Mục</span>
          </button>

          <button
            onClick={() => {
              setDeckFolderId(folders[0]?.id || '');
              setIsNewDeckOpen(true);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-semibold shadow-xs transition flex items-center space-x-1.5 touch-target"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Deck Mới</span>
          </button>
        </div>
      </div>

      {/* Folders & Decks Tree List */}
      <div className="space-y-3">
        {folders.map((folder) => {
          const isCollapsed = collapsedFolders[folder.id];
          const childDecks = decks.filter((d) => d.folderId === folder.id);
          const folderCounts = calculateFolderCounts(cards, decks, folder.id);

          return (
            <div
              key={folder.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs"
            >
              {/* Folder Header */}
              <div className="p-3.5 sm:p-4 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/80">
                <div
                  onClick={() => toggleFolder(folder.id)}
                  className="flex items-center space-x-2.5 cursor-pointer flex-1 select-none"
                >
                  <button
                    aria-label="Toggle folder"
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs shadow-xs"
                    style={{ backgroundColor: folder.color || '#0284c7' }}
                  >
                    {isCollapsed ? (
                      <FolderIcon className="w-4 h-4" />
                    ) : (
                      <FolderOpen className="w-4 h-4" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {folder.name}
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                        {childDecks.length} deck
                      </span>
                    </div>
                    {folder.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                        {folder.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Folder right actions: 3 Anki numbers + Play button */}
                <div className="flex items-center space-x-3 shrink-0 ml-2">
                  {/* Anki 3 counts: Blue (New), Red (Learn), Green (Due) */}
                  <div className="flex items-center space-x-2 text-xs font-mono font-bold">
                    <span
                      title="Thẻ mới (New)"
                      className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900"
                    >
                      {folderCounts.newCount}
                    </span>
                    <span
                      title="Đang học lại (Learn)"
                      className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900"
                    >
                      {folderCounts.learnCount}
                    </span>
                    <span
                      title="Đến hạn ôn (Due)"
                      className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900"
                    >
                      {folderCounts.dueCount}
                    </span>
                  </div>

                  {/* Study Folder Button */}
                  <button
                    onClick={() => onSelectFolderToStudy(folder)}
                    title={`Học toàn bộ thư mục ${folder.name}`}
                    className="p-2 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-xs touch-target flex items-center space-x-1"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>

                  {!folder.parentId && folder.id.startsWith('custom_') && onDeleteFolder && (
                    <button
                      onClick={() => onDeleteFolder(folder.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                      title="Xóa thư mục"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Child Decks in Folder */}
              {!isCollapsed && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 pl-6 sm:pl-8">
                  {childDecks.length === 0 ? (
                    <div className="py-4 pr-4 text-center text-xs text-slate-400">
                      Chưa có deck nào trong thư mục này. Bấm "Thêm Deck Mới" để tạo.
                    </div>
                  ) : (
                    childDecks.map((deck) => {
                      const counts = calculateDeckCounts(cards, deck.id, {
                        newCardsPerDay: deck.newCardsPerDay,
                        maxReviewsPerDay: deck.maxReviewsPerDay
                      });

                      return (
                        <div
                          key={deck.id}
                          className="py-3 pr-4 flex items-center justify-between hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition rounded-r-xl"
                        >
                          <div className="flex items-center space-x-3 flex-1 min-w-0 pr-2">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                              {getDeckIcon(deck.cardType)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                  {deck.name}
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                  ({counts.totalCards} thẻ)
                                </span>
                              </div>
                              {deck.description && (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                  {deck.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Deck Anki 3 counts + Play button */}
                          <div className="flex items-center space-x-2.5 shrink-0">
                            <div className="flex items-center space-x-1.5 text-xs font-mono font-bold">
                              <span
                                title="Thẻ mới hôm nay"
                                className="w-8 text-center py-0.5 rounded text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 text-xs"
                              >
                                {counts.newCount}
                              </span>
                              <span
                                title="Đang học lại"
                                className="w-8 text-center py-0.5 rounded text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 text-xs"
                              >
                                {counts.learnCount}
                              </span>
                              <span
                                title="Đến hạn ôn hôm nay"
                                className="w-8 text-center py-0.5 rounded text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 text-xs"
                              >
                                {counts.dueCount}
                              </span>
                            </div>

                            <button
                              onClick={() => onSelectDeckToStudy(deck)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-sky-600 hover:text-white dark:bg-slate-800 dark:hover:bg-sky-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition flex items-center space-x-1 touch-target shadow-xs"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span className="hidden sm:inline">Học</span>
                            </button>

                            {!deck.isDefault && onDeleteDeck && (
                              <button
                                onClick={() => onDeleteDeck(deck.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                                title="Xóa deck"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MODAL: TẠO THƯ MỤC MỚI */}
      {isNewFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <FolderIcon className="w-5 h-5 text-sky-600" />
              <span>Tạo Thư Mục Mới (Folder)</span>
            </h3>

            <form onSubmit={handleCreateFolderSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tên Thư Mục (Ví dụ: JLPT N2, Từ Vựng IT...)
                </label>
                <input
                  type="text"
                  required
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Nhập tên thư mục..."
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mô Tả (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={folderDesc}
                  onChange={(e) => setFolderDesc(e.target.value)}
                  placeholder="Mô tả nội dung thư mục..."
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Màu Sắc Đại Diện
                </label>
                <div className="flex items-center space-x-2">
                  {['#0284c7', '#059669', '#d97706', '#dc2626', '#8b5cf6', '#ec4899'].map(
                    (c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFolderColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-7 h-7 rounded-full transition ${
                          folderColor === c ? 'ring-3 ring-sky-400 ring-offset-2' : ''
                        }`}
                      />
                    )
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewFolderOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-xs"
                >
                  Tạo Thư Mục
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TẠO DECK MỚI */}
      {isNewDeckOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <Layers className="w-5 h-5 text-sky-600" />
              <span>Tạo Deck Mới</span>
            </h3>

            <form onSubmit={handleCreateDeckSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Thuộc Thư Mục
                </label>
                <select
                  value={deckFolderId}
                  onChange={(e) => setDeckFolderId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                >
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tên Deck (Ví dụ: Mimikara Bài 1-5, Kanji Bộ Thủ...)
                </label>
                <input
                  type="text"
                  required
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  placeholder="Nhập tên deck..."
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Loại Thẻ Trong Deck
                </label>
                <select
                  value={deckCardType}
                  onChange={(e) => setDeckCardType(e.target.value as any)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                >
                  <option value="word">Từ vựng (Word)</option>
                  <option value="kanji">Chữ Hán (Kanji)</option>
                  <option value="grammar">Ngữ pháp (Grammar)</option>
                  <option value="custom">Tự do / Nhập ngoài (Custom)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Thẻ Mới / Ngày
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={deckNewPerDay}
                    onChange={(e) => setDeckNewPerDay(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ôn Tối Đa / Ngày
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={deckMaxReviews}
                    onChange={(e) => setDeckMaxReviews(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewDeckOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-xs"
                >
                  Tạo Deck
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
