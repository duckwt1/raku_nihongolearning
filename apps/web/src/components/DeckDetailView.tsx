import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileUp,
  Globe,
  Lock,
  Play,
  Plus,
  Search,
  Trash2,
  Volume2,
  X
} from 'lucide-react';
import {
  State,
  calculateDeckCounts,
  type Deck,
  type Folder,
  type StudyCard
} from '@raku/core';
import { speakJapanese } from '../services/speech';

type CardStatusFilter = 'all' | 'new' | 'learning' | 'due' | 'mastered';

export interface NewDeckCardPayload {
  surface: string;
  reading: string;
  meaningVi: string;
  hanViet?: string;
  pos?: string;
  exampleJp?: string;
  exampleVi?: string;
}

interface DeckDetailViewProps {
  deck: Deck;
  folder?: Folder;
  allCards: StudyCard[];
  onBack: () => void;
  onStartStudy: (deck: Deck) => void;
  onSelectKanji: (char: string) => void;
  onAddCard?: (deckId: string, cardData: NewDeckCardPayload) => void;
  onDeleteCard?: (cardId: string, deckId: string) => void;
  onNavigateToImport?: (deckId: string, folderId?: string) => void;
}

const KANJI_CHAR_REGEX = /[\u4E00-\u9FAF\u3400-\u4DBF]/;
const PAGE_SIZE = 50;

function classifyCardStatus(card: StudyCard, nowMs: number): Exclude<CardStatusFilter, 'all'> {
  const isActuallyNew =
    Boolean(card.isNew) &&
    (!card.fsrsCard.reps || card.fsrsCard.reps === 0) &&
    !card.fsrsCard.last_review;
  if (isActuallyNew) return 'new';

  if (
    card.fsrsCard.state === State.Learning ||
    card.fsrsCard.state === State.Relearning
  ) {
    return 'learning';
  }
  if (card.fsrsCard.due.getTime() <= nowMs) {
    return 'due';
  }
  return 'mastered';
}

function formatNextDueLabel(card: StudyCard, status: Exclude<CardStatusFilter, 'all'>): string {
  if (status === 'new') return 'Mới';
  if (status === 'learning') return 'Đang học';
  if (status === 'due') return 'Đến hạn';
  const diffDays = Math.max(
    1,
    Math.round((card.fsrsCard.due.getTime() - Date.now()) / 86_400_000)
  );
  return `Ôn sau ${diffDays} ngày`;
}

export function DeckDetailView({
  deck,
  folder,
  allCards,
  onBack,
  onStartStudy,
  onSelectKanji,
  onAddCard,
  onDeleteCard,
  onNavigateToImport
}: DeckDetailViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CardStatusFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [cardSurface, setCardSurface] = useState('');
  const [cardReading, setCardReading] = useState('');
  const [cardMeaningVi, setCardMeaningVi] = useState('');
  const [cardHanViet, setCardHanViet] = useState('');
  const [cardPos, setCardPos] = useState('名詞');
  const [cardExampleJp, setCardExampleJp] = useState('');
  const [cardExampleVi, setCardExampleVi] = useState('');

  const canEditCards = deck.origin === 'owned' && !deck.isDefault;

  // 100% local in-memory filtering -> 0 Firestore reads!
  const deckCards = useMemo(
    () => allCards.filter((c) => c.deckId === deck.id && Boolean(c.word)),
    [allCards, deck.id]
  );

  const deckCounts = useMemo(
    () =>
      calculateDeckCounts(allCards, deck.id, {
        newCardsPerDay: deck.newCardsPerDay,
        maxReviewsPerDay: deck.maxReviewsPerDay
      }),
    [allCards, deck.id, deck.newCardsPerDay, deck.maxReviewsPerDay]
  );

  const statusTotals = useMemo(() => {
    const nowMs = Date.now();
    const totals = { all: deckCards.length, new: 0, learning: 0, due: 0, mastered: 0 };
    for (const card of deckCards) {
      totals[classifyCardStatus(card, nowMs)]++;
    }
    return totals;
  }, [deckCards]);

  const filteredCards = useMemo(() => {
    const nowMs = Date.now();
    const q = search.trim().toLowerCase();
    return deckCards.filter((card) => {
      if (statusFilter !== 'all' && classifyCardStatus(card, nowMs) !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const w = card.word!;
      return (
        w.surface.toLowerCase().includes(q) ||
        w.meaningVi.toLowerCase().includes(q) ||
        w.readings.some((r) => r.toLowerCase().includes(q)) ||
        w.hanVietBreakdown.some((hv) => hv.toLowerCase().includes(q)) ||
        (w.exampleJp?.toLowerCase().includes(q) ?? false) ||
        (w.exampleVi?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [deckCards, search, statusFilter]);

  const visibleCards = useMemo(
    () => filteredCards.slice(0, visibleCount),
    [filteredCards, visibleCount]
  );

  const toggleExpand = (cardId: string) => {
    setExpandedCardIds((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardSurface.trim() || !cardMeaningVi.trim()) {
      alert('Vui lòng nhập từ vựng và nghĩa tiếng Việt.');
      return;
    }
    if (KANJI_CHAR_REGEX.test(cardSurface) && !cardReading.trim()) {
      alert('Từ vựng có chứa chữ Hán cần nhập Cách đọc (Hiragana) để chấm bài chính xác.');
      return;
    }
    onAddCard?.(deck.id, {
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
    setIsAddModalOpen(false);
  };

  const nowMs = Date.now();

  return (
    <section className="space-y-5 animate-raku-enter">
      {/* Top back bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Quay lại bộ thẻ</span>
        </button>

        {folder && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-raku-line bg-raku-surface px-2.5 py-1 text-xs font-medium text-raku-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: folder.color || '#245C52' }}
            />
            {folder.name}
          </span>
        )}
      </div>

      {/* Deck Summary Card */}
      <div className="raku-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-raku-ink">{deck.name}</h2>
              {deck.visibility === 'community' || deck.origin === 'community' ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-raku-accent-soft px-2 py-0.5 text-[11px] font-semibold text-raku-accent">
                  <Globe className="h-3 w-3" aria-hidden="true" />
                  Cộng đồng
                </span>
              ) : !deck.isDefault ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-raku-subtle px-2 py-0.5 text-[11px] font-medium text-raku-muted">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Riêng tư
                </span>
              ) : null}
            </div>

            {deck.description && (
              <p className="text-xs leading-relaxed text-raku-muted">{deck.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs tabular-nums">
              <span className="font-semibold text-raku-ink">{deckCards.length} từ vựng</span>
              <span className="text-raku-easy font-semibold">Mới hôm nay: {deckCounts.newCount}</span>
              <span className="text-raku-signal font-semibold">Học lại: {deckCounts.learnCount}</span>
              <span className="text-raku-accent font-semibold">Đến hạn: {deckCounts.dueCount}</span>
              <span className="text-raku-muted">Đã thuộc: {statusTotals.mastered}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onAddCard && !deck.isDefault && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="raku-btn-secondary min-h-10 px-3 text-xs"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Thêm từ</span>
              </button>
            )}
            {onNavigateToImport && !deck.isDefault && (
              <button
                type="button"
                onClick={() => onNavigateToImport(deck.id, deck.folderId ?? undefined)}
                className="raku-btn-secondary min-h-10 px-3 text-xs"
              >
                <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Nhập từ</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onStartStudy(deck)}
              disabled={deckCards.length === 0}
              className="raku-btn-primary min-h-10 px-4 text-xs disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>Học ngay</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search + Status Filter (100% local, 0 Firestore reads) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-raku-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Tìm từ, cách đọc, nghĩa, Hán Việt..."
            className="w-full rounded-xl border border-raku-line-strong bg-raku-surface py-2 pl-9 pr-8 text-sm text-raku-ink placeholder:text-raku-muted focus:border-raku-accent focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Xoá từ khoá tìm kiếm"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-raku-muted hover:text-raku-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `Tất cả (${statusTotals.all})` },
              { id: 'new', label: `Mới (${statusTotals.new})` },
              { id: 'learning', label: `Đang học (${statusTotals.learning})` },
              { id: 'due', label: `Đến hạn (${statusTotals.due})` },
              { id: 'mastered', label: `Đã thuộc (${statusTotals.mastered})` }
            ] as const
          ).map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                  active
                    ? 'bg-raku-accent text-raku-on-accent'
                    : 'border border-raku-line bg-raku-surface text-raku-muted hover:text-raku-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Vocabulary List */}
      {filteredCards.length === 0 ? (
        <div className="raku-card p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-raku-ink">
            {deckCards.length === 0
              ? 'Bộ thẻ này chưa có từ vựng nào.'
              : 'Không tìm thấy từ vựng phù hợp.'}
          </p>
          <p className="text-xs text-raku-muted">
            {deckCards.length === 0
              ? 'Bấm "Thêm từ" hoặc "Nhập từ" ở trên để bắt đầu thêm từ vựng mới.'
              : 'Thử đổi từ khoá tìm kiếm hoặc chọn bộ lọc trạng thái khác.'}
          </p>
        </div>
      ) : (
        <div className="raku-card overflow-hidden divide-y divide-raku-line">
          {visibleCards.map((card) => {
            const word = card.word!;
            const status = classifyCardStatus(card, nowMs);
            const isExpanded = Boolean(expandedCardIds[card.id]);
            const hasExample = Boolean(word.exampleJp || word.exampleVi);
            const readingText = word.readings.filter((r) => r && r !== word.surface).join(' · ');

            const statusBadgeClass =
              status === 'new'
                ? 'bg-raku-subtle text-raku-easy'
                : status === 'learning'
                  ? 'bg-raku-signal-soft text-raku-signal'
                  : status === 'due'
                    ? 'bg-raku-accent-soft text-raku-accent'
                    : 'bg-raku-subtle text-raku-muted';

            return (
              <div
                key={card.id}
                className="px-4 py-3.5 transition-colors hover:bg-raku-subtle/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="font-jp text-lg font-bold text-raku-ink">
                        {Array.from(word.surface).map((ch, idx) =>
                          KANJI_CHAR_REGEX.test(ch) ? (
                            <button
                              key={`${card.id}-k-${idx}`}
                              type="button"
                              onClick={() => onSelectKanji(ch)}
                              title={`Tra chữ Kanji ${ch}`}
                              className="rounded px-0.5 transition-colors hover:bg-raku-accent-soft hover:text-raku-accent"
                            >
                              {ch}
                            </button>
                          ) : (
                            <span key={`${card.id}-c-${idx}`}>{ch}</span>
                          )
                        )}
                      </span>

                      {readingText && (
                        <span className="font-jp text-xs font-medium text-raku-accent">
                          {readingText}
                        </span>
                      )}

                      {word.hanVietBreakdown.length > 0 && (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-raku-muted">
                          {word.hanVietBreakdown.join(' ')}
                        </span>
                      )}

                      {word.pos && (
                        <span className="rounded bg-raku-canvas px-1.5 py-0.5 text-[10px] font-medium text-raku-muted">
                          {word.pos}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-raku-ink/90">{word.meaningVi}</p>

                    {hasExample && isExpanded && (
                      <div className="mt-2 rounded-xl border border-raku-line bg-raku-canvas/70 px-3 py-2 text-xs space-y-1">
                        {word.exampleJp && (
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-jp text-raku-ink leading-relaxed">
                              {word.exampleJp}
                            </p>
                            <button
                              type="button"
                              onClick={() => speakJapanese(word.exampleJp!)}
                              aria-label="Đọc câu ví dụ"
                              className="shrink-0 rounded-md p-1 text-raku-muted hover:bg-raku-subtle hover:text-raku-accent"
                            >
                              <Volume2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        {word.exampleVi && (
                          <p className="text-raku-muted leading-relaxed">{word.exampleVi}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={`hidden rounded-md px-2 py-0.5 text-[11px] font-semibold sm:inline-flex ${statusBadgeClass}`}
                    >
                      {formatNextDueLabel(card, status)}
                    </span>

                    <button
                      type="button"
                      onClick={() => speakJapanese(word.surface)}
                      aria-label={`Phát âm ${word.surface}`}
                      title="Phát âm"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-accent"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>

                    {hasExample && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(card.id)}
                        aria-label={isExpanded ? 'Ẩn ví dụ' : 'Xem ví dụ'}
                        title={isExpanded ? 'Ẩn ví dụ' : 'Xem câu ví dụ'}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    )}

                    {canEditCards && onDeleteCard && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Xoá từ "${word.surface}" khỏi bộ thẻ "${deck.name}"?`)) {
                            onDeleteCard(card.id, deck.id);
                          }
                        }}
                        aria-label={`Xoá từ ${word.surface}`}
                        title="Xoá từ"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-raku-muted transition-colors hover:bg-raku-signal-soft hover:text-raku-signal"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {visibleCount < filteredCards.length && (
            <div className="p-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="raku-btn-secondary min-h-9 px-4 text-xs"
              >
                Xem thêm ({filteredCards.length - visibleCount} từ còn lại)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quick Add Card Modal inside Deck Detail */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsAddModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-raku-ink/45 p-4 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="raku-card w-full max-w-md space-y-4 p-6 animate-raku-enter"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-raku-ink">Thêm từ vào {deck.name}</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1 text-raku-muted hover:bg-raku-subtle hover:text-raku-ink"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3">
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
                  onClick={() => setIsAddModalOpen(false)}
                  className="raku-btn-secondary min-h-10 px-4 text-xs"
                >
                  Hủy
                </button>
                <button type="submit" className="raku-btn-primary min-h-10 px-5 text-xs">
                  Lưu từ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
