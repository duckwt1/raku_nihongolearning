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
  Trash2,
  FileUp,
  HardDrive
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
  onAddCard?: (
    deckId: string,
    cardData: {
      surface: string;
      reading: string;
      meaningVi: string;
      hanViet?: string;
      pos?: string;
    }
  ) => void;
  onNavigateToImport?: (deckId: string, folderId?: string) => void;
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
  onDeleteFolder,
  onAddCard,
  onNavigateToImport
}: DeckFolderViewProps) {
  // Collapsed/expanded folders state
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  // Modals state
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [isNewDeckOpen, setIsNewDeckOpen] = useState(false);
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);

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

  // Add Card form state
  const [cardTargetDeckId, setCardTargetDeckId] = useState<string>('');
  const [cardSurface, setCardSurface] = useState('');
  const [cardReading, setCardReading] = useState('');
  const [cardMeaningVi, setCardMeaningVi] = useState('');
  const [cardHanViet, setCardHanViet] = useState('');
  const [cardPos, setCardPos] = useState('名詞');

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

  const handleAddCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardSurface.trim() || !cardMeaningVi.trim()) {
      alert('Vui lòng nhập từ vựng và nghĩa tiếng Việt.');
      return;
    }
    const finalDeckId = cardTargetDeckId || decks[0]?.id;
    if (!finalDeckId) {
      alert('Vui lòng tạo hoặc chọn một bộ thẻ (Deck) trước.');
      return;
    }

    if (onAddCard) {
      onAddCard(finalDeckId, {
        surface: cardSurface.trim(),
        reading: cardReading.trim() || cardSurface.trim(),
        meaningVi: cardMeaningVi.trim(),
        hanViet: cardHanViet.trim() || undefined,
        pos: cardPos
      });
    }

    setCardSurface('');
    setCardReading('');
    setCardMeaningVi('');
    setCardHanViet('');
    setIsAddCardOpen(false);
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
      {/* Top action buttons: Add Folder & Add Deck & Add Card */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-raku-accent">Chọn một chặng</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight text-raku-ink">
            <Layers className="h-5 w-5 text-raku-accent" aria-hidden="true" />
            <span>Bộ học tập của bạn</span>
          </h2>
          <p className="mt-1 text-sm text-raku-muted">
            Học theo chủ đề, cấp độ hoặc bộ thẻ bạn tự tạo. Lưu trữ cục bộ trên máy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Add Card Button */}
          {onAddCard && (
            <button
              onClick={() => {
                setCardTargetDeckId(decks[0]?.id || '');
                setIsAddCardOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 transition flex items-center space-x-1.5 touch-target shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Thẻ Mới</span>
            </button>
          )}

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
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 p-3.5 sm:flex sm:items-center sm:justify-between sm:gap-0 sm:p-4 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/80">
                <div
                  onClick={() => toggleFolder(folder.id)}
                  className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 cursor-pointer select-none sm:flex-1 sm:order-1"
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

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100" title={folder.name}>
                        {folder.name}
                      </h3>
                      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                        {childDecks.length} deck
                      </span>
                    </div>
                  </div>
                </div>

                {/* Anki 3 counts: Blue (New), Red (Learn), Green (Due) */}
                <div className="col-start-1 row-start-2 ml-10 flex min-w-0 items-center gap-1.5 text-xs font-mono font-bold sm:order-2 sm:ml-0 sm:gap-2">
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

                {/* Folder actions */}
                <div className="col-start-2 row-span-2 flex flex-col items-center justify-center gap-1 sm:order-3 sm:ml-2 sm:flex-row sm:gap-2">
                  {/* Study Folder Button */}
                  <button
                    onClick={() => onSelectFolderToStudy(folder)}
                    title={`Học toàn bộ thư mục ${folder.name}`}
                    className="p-2 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-xs touch-target flex items-center space-x-1"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>

                  {!folder.parentId && folder.id.startsWith('folder_custom_') && onDeleteFolder && (
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
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 pl-2 sm:pl-8">
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
                          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 py-3 pl-2 pr-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition rounded-r-xl sm:flex sm:justify-between sm:gap-0 sm:pl-0 sm:pr-4"
                        >
                          <div className="row-span-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 sm:mr-3">
                            {getDeckIcon(deck.cardType)}
                          </div>
                          <div className="col-start-2 row-start-1 min-w-0 sm:flex-1 sm:pr-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100" title={deck.name}>
                                {deck.name}
                              </span>
                              <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                ({counts.totalCards} thẻ)
                              </span>
                            </div>
                          </div>

                          {/* Deck Anki counts */}
                          <div className="col-start-2 row-start-2 flex min-w-0 items-center gap-1.5 text-xs font-mono font-bold sm:order-2 sm:shrink-0 sm:gap-1.5">
                            <span
                              title="Thẻ mới hôm nay"
                              className="min-w-8 px-1 text-center py-0.5 rounded text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 text-xs tabular-nums"
                            >
                              {counts.newCount}
                            </span>
                            <span
                              title="Đang học lại"
                              className="min-w-8 px-1 text-center py-0.5 rounded text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 text-xs tabular-nums"
                            >
                              {counts.learnCount}
                            </span>
                            <span
                              title="Đến hạn ôn hôm nay"
                              className="min-w-8 px-1 text-center py-0.5 rounded text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 text-xs tabular-nums"
                            >
                              {counts.dueCount}
                            </span>
                          </div>

                          {/* Deck Actions */}
                          <div className="col-start-3 row-span-2 flex items-center gap-1 sm:order-3 sm:shrink-0 sm:gap-2">
                            {/* Quick Add Card to this deck */}
                            {onAddCard && (
                              <button
                                onClick={() => {
                                  setCardTargetDeckId(deck.id);
                                  setIsAddCardOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
                                title={`Thêm từ vựng vào deck ${deck.name}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Quick Jump to Import for this deck */}
                            {onNavigateToImport && (
                              <button
                                onClick={() => onNavigateToImport(deck.id, folder.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition"
                                title={`Nhập danh sách từ vào deck ${deck.name}`}
                              >
                                <FileUp className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Start Study */}
                            <button
                              onClick={() => onSelectDeckToStudy(deck)}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 shadow-xs transition hover:bg-sky-600 hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-sky-600 sm:h-auto sm:w-auto sm:space-x-1 sm:px-3 sm:py-1.5 sm:text-xs sm:font-bold touch-target"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span className="hidden sm:inline">Học</span>
                            </button>

                            {!deck.isDefault && onDeleteDeck && (
                              <button
                                onClick={() => onDeleteDeck(deck.id)}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 sm:h-auto sm:w-auto sm:p-1.5"
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

      {/* MODAL: THÊM THẺ / TỪ MỚI (LƯU LOCAL) */}
      {isAddCardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <span>Thêm Thẻ Mới (Lưu Cục Bộ)</span>
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                <span>Lưu trên máy</span>
              </span>
            </div>

            <form onSubmit={handleAddCardSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Bộ Thẻ (Deck)
                </label>
                <select
                  value={cardTargetDeckId}
                  onChange={(e) => setCardTargetDeckId(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 font-medium"
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      🗂️ {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Từ Vựng / Kanji <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={cardSurface}
                  onChange={(e) => setCardSurface(e.target.value)}
                  placeholder="Ví dụ: 荷物, 預かる..."
                  autoFocus
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Cách Đọc (Hiragana)
                </label>
                <input
                  type="text"
                  value={cardReading}
                  onChange={(e) => setCardReading(e.target.value)}
                  placeholder="Ví dụ: にもつ, あずかる..."
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nghĩa Tiếng Việt <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={cardMeaningVi}
                  onChange={(e) => setCardMeaningVi(e.target.value)}
                  placeholder="Ví dụ: hành lý; đồ đạc mang theo..."
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Âm Hán Việt (Tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={cardHanViet}
                    onChange={(e) => setCardHanViet(e.target.value)}
                    placeholder="Ví dụ: HÀ VẬT"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Loại Từ
                  </label>
                  <select
                    value={cardPos}
                    onChange={(e) => setCardPos(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100"
                  >
                    <option value="名詞">Danh từ (名詞)</option>
                    <option value="動詞">Động từ (動詞)</option>
                    <option value="い形容詞">Tính từ -i (い形容詞)</option>
                    <option value="な形容詞">Tính từ -na (な形容詞)</option>
                    <option value="副詞">Phó từ (副詞)</option>
                    <option value="慣用語">Thành ngữ / Quán dụng ngữ</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddCardOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition"
                >
                  Lưu Thẻ Vào Máy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
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
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Màu Nhận Diện
                </label>
                <div className="flex items-center gap-2 pt-0.5">
                  {['#0284c7', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFolderColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${folderColor === c ? 'scale-125 ring-2 ring-offset-2 ring-sky-500' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Chọn màu ${c}`}
                    />
                  ))}
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
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
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
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Loại Thẻ Trong Deck
                </label>
                <select
                  value={deckCardType}
                  onChange={(e) => setDeckCardType(e.target.value as any)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
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
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
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
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
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
