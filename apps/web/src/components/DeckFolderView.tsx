import { useState } from 'react';
import {
  Folder as FolderIcon,
  FolderOpen,
  Plus,
  Play,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Languages,
  PenTool,
  Layers,
  Trash2,
  FileUp,
  Globe,
  List,
  Lock
} from 'lucide-react';
import type { Deck, Folder, StudyCard } from '@raku/core';
import { calculateDeckCounts, calculateFolderCounts, canDeleteDeck } from '@raku/core';

interface DeckFolderViewProps {
  folders: Folder[];
  decks: Deck[];
  cards: StudyCard[];
  currentUid?: string | null;
  onSelectDeckToStudy: (deck: Deck) => void;
  onOpenDeckDetail?: (deck: Deck) => void;
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
  onToggleDeckVisibility?: (deckId: string) => void;
  onAddCard?: (
    deckId: string,
    cardData: {
      surface: string;
      reading: string;
      meaningVi: string;
      hanViet?: string;
      pos?: string;
      exampleJp?: string;
      exampleVi?: string;
    }
  ) => void;
  onNavigateToImport?: (deckId: string, folderId?: string) => void;
  onOpenImport?: () => void;
}

const FOLDER_PALETTE = ['#245C52', '#3B6D8C', '#A46822', '#B84A39', '#5E546E', '#4F6354'];

export function DeckFolderView({
  folders,
  decks,
  cards,
  currentUid,
  onSelectDeckToStudy,
  onOpenDeckDetail,
  onSelectFolderToStudy,
  onCreateFolder,
  onCreateDeck,
  onDeleteDeck,
  onDeleteFolder,
  onToggleDeckVisibility,
  onAddCard,
  onNavigateToImport,
  onOpenImport
}: DeckFolderViewProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [isNewDeckOpen, setIsNewDeckOpen] = useState(false);
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);

  const [folderName, setFolderName] = useState('');
  const [folderDesc, setFolderDesc] = useState('');
  const [folderColor, setFolderColor] = useState(FOLDER_PALETTE[0]!);

  const [deckName, setDeckName] = useState('');
  const [deckDesc, setDeckDesc] = useState('');
  const [deckFolderId, setDeckFolderId] = useState<string>('');
  const [deckCardType, setDeckCardType] = useState<
    'word' | 'kanji' | 'grammar' | 'custom' | 'mixed'
  >('word');
  const [deckNewPerDay, setDeckNewPerDay] = useState(20);
  const [deckMaxReviews, setDeckMaxReviews] = useState(50);

  const [cardTargetDeckId, setCardTargetDeckId] = useState<string>('');
  const [cardSurface, setCardSurface] = useState('');
  const [cardReading, setCardReading] = useState('');
  const [cardMeaningVi, setCardMeaningVi] = useState('');
  const [cardHanViet, setCardHanViet] = useState('');
  const [cardPos, setCardPos] = useState('名詞');
  const [cardExampleJp, setCardExampleJp] = useState('');
  const [cardExampleVi, setCardExampleVi] = useState('');

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
    const surfaceHasKanji = /[\u4E00-\u9FAF\u3400-\u4DBF]/.test(cardSurface);
    if (surfaceHasKanji && !cardReading.trim()) {
      alert('Từ vựng có chứa chữ Hán cần nhập Cách đọc (Hiragana) để chấm bài chính xác.');
      return;
    }
    const finalDeckId = cardTargetDeckId || decks[0]?.id;
    if (!finalDeckId) {
      alert('Vui lòng tạo hoặc chọn một bộ thẻ trước.');
      return;
    }

    onAddCard?.(finalDeckId, {
      surface: cardSurface.trim(),
      reading: cardReading.trim() || cardSurface.trim(),
      meaningVi: cardMeaningVi.trim(),
      hanViet: cardHanViet.trim() || undefined,
      pos: cardPos,
      exampleJp: cardExampleJp.trim() || undefined,
      exampleVi: cardExampleVi.trim() || undefined
    });

    setCardSurface('');
    setCardReading('');
    setCardMeaningVi('');
    setCardHanViet('');
    setCardExampleJp('');
    setCardExampleVi('');
    setIsAddCardOpen(false);
  };

  const getDeckIcon = (type: string) => {
    switch (type) {
      case 'word':
        return <Languages className="h-4 w-4 text-raku-muted" aria-hidden="true" />;
      case 'kanji':
        return <PenTool className="h-4 w-4 text-raku-muted" aria-hidden="true" />;
      case 'grammar':
        return <BookOpen className="h-4 w-4 text-raku-muted" aria-hidden="true" />;
      default:
        return <Layers className="h-4 w-4 text-raku-muted" aria-hidden="true" />;
    }
  };

  const unfiledDecks = decks.filter(
    (deck) => !deck.folderId || !folders.some((folder) => folder.id === deck.folderId)
  );

  const renderDeckRow = (deck: Deck) => {
    const counts = calculateDeckCounts(cards, deck.id, {
      newCardsPerDay: deck.newCardsPerDay,
      maxReviewsPerDay: deck.maxReviewsPerDay
    });
    const isBuiltin = deck.origin === 'builtin' || deck.isDefault;
    const isCommunityDeck = deck.origin === 'community';
    const showDelete = canDeleteDeck(deck, currentUid);

    return (
      <div
        key={deck.id}
        className="flex flex-col gap-2.5 px-4 py-3 transition-colors hover:bg-raku-subtle/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raku-canvas">
            {getDeckIcon(deck.cardType)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={() => (onOpenDeckDetail ? onOpenDeckDetail(deck) : onSelectDeckToStudy(deck))}
                className="truncate text-left text-sm font-semibold text-raku-ink hover:text-raku-accent"
                title={onOpenDeckDetail ? `Xem danh sách từ trong ${deck.name}` : deck.name}
              >
                {deck.name}
              </button>

              {isCommunityDeck ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-raku-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-raku-accent"
                  title={deck.authorName ? `Bộ thẻ cộng đồng của ${deck.authorName}` : 'Bộ thẻ cộng đồng'}
                >
                  <Globe className="h-2.5 w-2.5" aria-hidden="true" />
                  Cộng đồng
                </span>
              ) : !isBuiltin && onToggleDeckVisibility ? (
                <button
                  type="button"
                  onClick={() => onToggleDeckVisibility(deck.id)}
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    deck.visibility === 'community'
                      ? 'bg-raku-accent-soft text-raku-accent'
                      : 'bg-raku-subtle text-raku-muted hover:text-raku-ink'
                  }`}
                  title={
                    deck.visibility === 'community'
                      ? 'Đang chia sẻ cộng đồng (Bấm để chuyển riêng tư)'
                      : 'Đang riêng tư trên máy (Bấm để chia sẻ cộng đồng)'
                  }
                >
                  {deck.visibility === 'community' ? (
                    <Globe className="h-2.5 w-2.5" aria-hidden="true" />
                  ) : (
                    <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                  )}
                  {deck.visibility === 'community' ? 'Cộng đồng' : 'Riêng tư'}
                </button>
              ) : null}

              <span className="text-xs text-raku-muted tabular-nums">
                {counts.totalCards} thẻ
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pl-11 sm:justify-end sm:pl-0">
          {/* Calm Anki 3-count readout: New / Learn / Due */}
          <div className="flex items-center gap-3 text-xs font-semibold tabular-nums">
            <span title="Thẻ mới hôm nay" className="min-w-6 text-right text-raku-easy">
              {counts.newCount}
            </span>
            <span title="Đang học lại" className="min-w-6 text-right text-raku-signal">
              {counts.learnCount}
            </span>
            <span title="Đến hạn ôn" className="min-w-6 text-right text-raku-accent">
              {counts.dueCount}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {onOpenDeckDetail && (
              <button
                type="button"
                onClick={() => onOpenDeckDetail(deck)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
                title={`Xem danh sách từ trong ${deck.name}`}
                aria-label={`Xem danh sách từ trong ${deck.name}`}
              >
                <List className="h-4 w-4" />
              </button>
            )}

            {onAddCard && (
              <button
                type="button"
                onClick={() => {
                  setCardTargetDeckId(deck.id);
                  setIsAddCardOpen(true);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
                title={`Thêm từ vào ${deck.name}`}
                aria-label={`Thêm từ vào ${deck.name}`}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}

            {onNavigateToImport && (
              <button
                type="button"
                onClick={() => onNavigateToImport(deck.id, deck.folderId ?? undefined)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
                title={`Nhập từ vào ${deck.name}`}
                aria-label={`Nhập từ vào ${deck.name}`}
              >
                <FileUp className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onSelectDeckToStudy(deck)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-raku-line-strong bg-raku-surface px-3 text-xs font-semibold text-raku-ink transition-colors hover:border-raku-accent hover:bg-raku-accent hover:text-raku-on-accent"
              aria-label={`Học bộ thẻ ${deck.name}`}
            >
              <Play className="h-3 w-3 fill-current" aria-hidden="true" />
              <span>Học</span>
            </button>

            {showDelete && onDeleteDeck && (
              <button
                type="button"
                onClick={() => onDeleteDeck(deck.id)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-raku-muted transition-colors hover:bg-raku-signal-soft hover:text-raku-signal"
                title="Xoá bộ thẻ"
                aria-label={`Xoá bộ thẻ ${deck.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section aria-labelledby="decks-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="decks-heading" className="text-lg font-bold tracking-tight text-raku-ink">
            Bộ thẻ của bạn
          </h2>
          <p className="mt-0.5 text-xs text-raku-muted">
            Cột số theo thứ tự: <span className="font-medium text-raku-easy">Mới</span> ·{' '}
            <span className="font-medium text-raku-signal">Học lại</span> ·{' '}
            <span className="font-medium text-raku-accent">Đến hạn</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onAddCard && (
            <button
              type="button"
              onClick={() => {
                setCardTargetDeckId(decks[0]?.id || '');
                setIsAddCardOpen(true);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-raku-line-strong bg-raku-surface px-3 text-xs font-semibold text-raku-ink transition-colors hover:bg-raku-subtle"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Thêm thẻ</span>
            </button>
          )}

          {onOpenImport && (
            <button
              type="button"
              onClick={onOpenImport}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-raku-line-strong bg-raku-surface px-3 text-xs font-semibold text-raku-ink transition-colors hover:bg-raku-subtle"
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Nhập từ</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsNewFolderOpen(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-raku-line-strong bg-raku-surface px-3 text-xs font-semibold text-raku-ink transition-colors hover:bg-raku-subtle"
          >
            <FolderIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Thư mục</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDeckFolderId('');
              setIsNewDeckOpen(true);
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-raku-accent px-3.5 text-xs font-semibold text-raku-on-accent transition-colors hover:bg-raku-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Bộ thẻ mới</span>
          </button>
        </div>
      </div>

      {/* Folders & Decks list */}
      <div className="space-y-3">
        {folders.map((folder) => {
          const isCollapsed = collapsedFolders[folder.id];
          const childDecks = decks.filter((d) => d.folderId === folder.id);
          const folderCounts = calculateFolderCounts(cards, decks, folder.id);

          return (
            <div key={folder.id} className="raku-card overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-raku-line bg-raku-canvas/60 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleFolder(folder.id)}
                  aria-expanded={!isCollapsed}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-raku-muted" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-raku-muted" aria-hidden="true" />
                  )}

                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: folder.color || '#245C52' }}
                    aria-hidden="true"
                  />

                  <span className="truncate text-sm font-bold text-raku-ink">
                    {folder.name}
                  </span>
                  <span className="shrink-0 text-xs text-raku-muted tabular-nums">
                    ({childDecks.length})
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-3">
                  <div className="hidden items-center gap-3 text-xs font-semibold tabular-nums sm:flex">
                    <span className="min-w-6 text-right text-raku-easy">{folderCounts.newCount}</span>
                    <span className="min-w-6 text-right text-raku-signal">{folderCounts.learnCount}</span>
                    <span className="min-w-6 text-right text-raku-accent">{folderCounts.dueCount}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectFolderToStudy(folder)}
                    title={`Ôn cả thư mục ${folder.name}`}
                    aria-label={`Ôn cả thư mục ${folder.name}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-raku-accent-soft px-2.5 text-xs font-semibold text-raku-accent transition-colors hover:bg-raku-accent hover:text-raku-on-accent"
                  >
                    <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                    <span className="hidden sm:inline">Ôn tất cả</span>
                  </button>

                  {!folder.parentId && !folder.isDefault && onDeleteFolder && (
                    <button
                      type="button"
                      onClick={() => onDeleteFolder(folder.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-raku-muted hover:bg-raku-signal-soft hover:text-raku-signal"
                      title="Xoá thư mục"
                      aria-label={`Xoá thư mục ${folder.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {!isCollapsed && (
                <div className="divide-y divide-raku-line">
                  {childDecks.length === 0 ? (
                    <div className="px-4 py-5 text-center text-xs text-raku-muted">
                      Chưa có bộ thẻ nào trong thư mục này.
                    </div>
                  ) : (
                    childDecks.map(renderDeckRow)
                  )}
                </div>
              )}
            </div>
          );
        })}

        {unfiledDecks.length > 0 && (
          <div className="raku-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-raku-line bg-raku-canvas/60 px-4 py-3">
              <FolderOpen className="h-4 w-4 text-raku-muted" aria-hidden="true" />
              <h3 className="text-sm font-bold text-raku-ink">Chưa phân loại</h3>
              <span className="text-xs text-raku-muted tabular-nums">({unfiledDecks.length})</span>
            </div>
            <div className="divide-y divide-raku-line">{unfiledDecks.map(renderDeckRow)}</div>
          </div>
        )}
      </div>

      {/* MODAL: THÊM THẺ MỚI */}
      {isAddCardOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsAddCardOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-raku-ink/45 p-4 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="raku-card w-full max-w-md space-y-4 p-6 animate-raku-enter"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-raku-ink">Thêm thẻ mới</h3>
              <span className="text-xs text-raku-muted">Lưu trên máy</span>
            </div>

            <form onSubmit={handleAddCardSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">Bộ thẻ</label>
                <select
                  value={cardTargetDeckId}
                  onChange={(e) => setCardTargetDeckId(e.target.value)}
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-sm text-raku-ink focus:border-raku-accent focus:outline-none"
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">
                  Từ vựng / Kanji <span className="text-raku-signal">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={cardSurface}
                  onChange={(e) => setCardSurface(e.target.value)}
                  placeholder="Ví dụ: 荷物, 預かる..."
                  autoFocus
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 font-jp text-sm text-raku-ink focus:border-raku-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">
                  Cách đọc (Hiragana)
                </label>
                <input
                  type="text"
                  value={cardReading}
                  onChange={(e) => setCardReading(e.target.value)}
                  placeholder="Ví dụ: にもつ, あずかる..."
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 font-jp text-sm text-raku-ink focus:border-raku-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">
                  Nghĩa tiếng Việt <span className="text-raku-signal">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={cardMeaningVi}
                  onChange={(e) => setCardMeaningVi(e.target.value)}
                  placeholder="Ví dụ: hành lý; đồ đạc mang theo..."
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-sm text-raku-ink focus:border-raku-accent focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-raku-muted">
                    Hán Việt (tuỳ chọn)
                  </label>
                  <input
                    type="text"
                    value={cardHanViet}
                    onChange={(e) => setCardHanViet(e.target.value)}
                    placeholder="HÀ VẬT"
                    className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-xs text-raku-ink focus:border-raku-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-raku-muted">Loại từ</label>
                  <select
                    value={cardPos}
                    onChange={(e) => setCardPos(e.target.value)}
                    className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-xs text-raku-ink focus:border-raku-accent focus:outline-none"
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

              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">
                  Ví dụ tiếng Nhật (tuỳ chọn)
                </label>
                <input
                  type="text"
                  value={cardExampleJp}
                  onChange={(e) => setCardExampleJp(e.target.value)}
                  placeholder="荷物をフロントに預ける。"
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 font-jp text-xs text-raku-ink focus:border-raku-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">
                  Nghĩa câu ví dụ (tuỳ chọn)
                </label>
                <input
                  type="text"
                  value={cardExampleVi}
                  onChange={(e) => setCardExampleVi(e.target.value)}
                  placeholder="Gửi hành lý ở quầy lễ tân."
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-xs text-raku-ink focus:border-raku-accent focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-raku-line pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddCardOpen(false)}
                  className="raku-btn-secondary min-h-10 px-4 text-xs"
                >
                  Hủy
                </button>
                <button type="submit" className="raku-btn-primary min-h-10 px-5 text-xs">
                  Lưu thẻ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TẠO THƯ MỤC */}
      {isNewFolderOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsNewFolderOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-raku-ink/45 p-4 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="raku-card w-full max-w-md space-y-4 p-6 animate-raku-enter"
          >
            <h3 className="text-base font-bold text-raku-ink">Tạo thư mục mới</h3>

            <form onSubmit={handleCreateFolderSubmit} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">
                  Tên thư mục
                </label>
                <input
                  type="text"
                  required
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Ví dụ: JLPT N2, Từ vựng IT..."
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-sm text-raku-ink focus:border-raku-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">
                  Mô tả (tuỳ chọn)
                </label>
                <input
                  type="text"
                  value={folderDesc}
                  onChange={(e) => setFolderDesc(e.target.value)}
                  placeholder="Ghi chú ngắn..."
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-sm text-raku-ink focus:border-raku-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-raku-muted">
                  Màu dấu chấm
                </label>
                <div className="flex items-center gap-2.5">
                  {FOLDER_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFolderColor(c)}
                      className={`h-6 w-6 rounded-full transition-transform ${
                        folderColor === c ? 'scale-110 ring-2 ring-raku-ink ring-offset-2 ring-offset-raku-surface' : ''
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Chọn màu ${c}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-raku-line pt-3">
                <button
                  type="button"
                  onClick={() => setIsNewFolderOpen(false)}
                  className="raku-btn-secondary min-h-10 px-4 text-xs"
                >
                  Hủy
                </button>
                <button type="submit" className="raku-btn-primary min-h-10 px-5 text-xs">
                  Tạo thư mục
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TẠO BỘ THẺ */}
      {isNewDeckOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsNewDeckOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-raku-ink/45 p-4 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="raku-card w-full max-w-md space-y-4 p-6 animate-raku-enter"
          >
            <h3 className="text-base font-bold text-raku-ink">Tạo bộ thẻ mới</h3>

            <form onSubmit={handleCreateDeckSubmit} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">Thư mục</label>
                <select
                  value={deckFolderId}
                  onChange={(e) => setDeckFolderId(e.target.value)}
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-sm text-raku-ink focus:border-raku-accent focus:outline-none"
                >
                  <option value="">Không thuộc thư mục nào</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">
                  Tên bộ thẻ
                </label>
                <input
                  type="text"
                  required
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  placeholder="Ví dụ: Mimikara Bài 1-5..."
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-sm text-raku-ink focus:border-raku-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-raku-muted">Loại thẻ</label>
                <select
                  value={deckCardType}
                  onChange={(e) => setDeckCardType(e.target.value as any)}
                  className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-sm text-raku-ink focus:border-raku-accent focus:outline-none"
                >
                  <option value="word">Từ vựng</option>
                  <option value="kanji">Chữ Hán (Kanji)</option>
                  <option value="grammar">Ngữ pháp</option>
                  <option value="custom">Tự do</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-raku-muted">
                    Thẻ mới / ngày
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={deckNewPerDay}
                    onChange={(e) => setDeckNewPerDay(Number(e.target.value))}
                    className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-sm text-raku-ink tabular-nums focus:border-raku-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-raku-muted">
                    Ôn tối đa / ngày
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={deckMaxReviews}
                    onChange={(e) => setDeckMaxReviews(Number(e.target.value))}
                    className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-3 py-2 text-sm text-raku-ink tabular-nums focus:border-raku-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-raku-line pt-3">
                <button
                  type="button"
                  onClick={() => setIsNewDeckOpen(false)}
                  className="raku-btn-secondary min-h-10 px-4 text-xs"
                >
                  Hủy
                </button>
                <button type="submit" className="raku-btn-primary min-h-10 px-5 text-xs">
                  Tạo bộ thẻ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
