import { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Layers,
  FileUp,
  Sparkles,
  Settings,
  Wifi,
  WifiOff,
  Moon,
  Sun,
  Search,
  User as UserIcon
} from 'lucide-react';
import {
  SEED_KANJI,
  buildReviewQueue,
  type StudyCard,
  type Deck,
  type Folder,
  type UserStudyStats,
  DEFAULT_FOLDERS,
  DEFAULT_DECKS,
  buildDefaultCards,
  recordStudyActivity,
  createInitialStudyStats
} from '@raku/core';
import { auth, signInAnonymously, onAuthStateChanged, type User } from './services/firebase';
import { syncUserProfile, saveCardProgress } from './services/firestoreSync';
import { DataLicensesModal } from './components/DataLicensesModal';
import { FlashcardStudyView } from './components/FlashcardStudyView';
import { ImportView } from './components/ImportView';
import { GrammarPracticeView } from './components/GrammarPracticeView';
import { AiQuizGeneratorModal } from './components/AiQuizGeneratorModal';
import { AuthModal } from './components/AuthModal';
import { KanjiModal } from './components/KanjiModal';
import { TodayStatsBar } from './components/TodayStatsBar';
import { DeckFolderView } from './components/DeckFolderView';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [activeTab, setActiveTab] = useState<'study' | 'kanji' | 'grammar' | 'import' | 'settings'>('study');

  // Modals state
  const [isLicenseOpen, setIsLicenseOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAiQuizModalOpen, setIsAiQuizModalOpen] = useState(false);
  const [selectedKanjiChar, setSelectedKanjiChar] = useState<string | null>(null);

  // Active study session state
  const [isStudying, setIsStudying] = useState(false);
  const [activeStudyTarget, setActiveStudyTarget] = useState<{
    type: 'deck' | 'folder' | 'all';
    id?: string;
    title: string;
  } | null>(null);

  // Folders & Decks state (with LocalStorage persistence)
  const [folders, setFolders] = useState<Folder[]>(() => {
    try {
      const saved = localStorage.getItem('raku_folders');
      return saved ? JSON.parse(saved) : DEFAULT_FOLDERS;
    } catch {
      return DEFAULT_FOLDERS;
    }
  });

  const [decks, setDecks] = useState<Deck[]>(() => {
    try {
      const saved = localStorage.getItem('raku_decks');
      return saved ? JSON.parse(saved) : DEFAULT_DECKS;
    } catch {
      return DEFAULT_DECKS;
    }
  });

  // Daily Study Stats state (with LocalStorage persistence)
  const [studyStats, setStudyStats] = useState<UserStudyStats>(() => {
    try {
      const saved = localStorage.getItem('raku_study_stats');
      if (saved) {
        return recordStudyActivity(JSON.parse(saved), 0);
      }
    } catch {}
    return createInitialStudyStats();
  });

  // StudyCards state (Words, Kanji, Grammar initialized)
  const [allCards, setAllCards] = useState<StudyCard[]>(() => {
    try {
      const saved = localStorage.getItem('raku_cards');
      if (saved) {
        const parsed: StudyCard[] = JSON.parse(saved);
        return parsed.map((c) => ({
          ...c,
          fsrsCard: {
            ...c.fsrsCard,
            due: new Date(c.fsrsCard.due),
            last_review: c.fsrsCard.last_review ? new Date(c.fsrsCard.last_review) : undefined
          }
        }));
      }
    } catch {}
    return buildDefaultCards();
  });

  // Kanji Explorer search
  const [kanjiSearch, setKanjiSearch] = useState('');

  // Active study timer: track active seconds spent in study session
  useEffect(() => {
    if (!isStudying) return;

    const timer = setInterval(() => {
      setStudyStats((prev) => {
        const next = recordStudyActivity(prev, 1);
        try {
          localStorage.setItem('raku_study_stats', JSON.stringify(next));
        } catch {}
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isStudying]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        syncUserProfile(currentUser);
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark');
  };

  // Filtered Kanji list for Kanji tab
  const filteredKanji = useMemo(() => {
    const q = kanjiSearch.trim().toLowerCase();
    if (!q) return SEED_KANJI.slice(0, 120);
    return SEED_KANJI.filter((k) => {
      return (
        k.char.includes(q) ||
        k.hanViet.some((hv) => hv.toLowerCase().includes(q)) ||
        k.meaningVi.toLowerCase().includes(q)
      );
    });
  }, [kanjiSearch]);

  // Overall totals due and new across all cards
  const { totalDueToday, totalNewToday } = useMemo(() => {
    let due = 0;
    let nw = 0;
    const now = new Date();
    for (const card of allCards) {
      if (card.fsrsCard.state === 0 || card.isNew) {
        nw++;
      } else if (card.fsrsCard.due.getTime() <= now.getTime()) {
        due++;
      }
    }
    return { totalDueToday: due, totalNewToday: nw };
  }, [allCards]);

  // Target cards for active study session
  const targetCards = useMemo(() => {
    if (!activeStudyTarget || activeStudyTarget.type === 'all') {
      return allCards;
    }
    if (activeStudyTarget.type === 'deck') {
      return allCards.filter((c) => c.deckId === activeStudyTarget.id);
    }
    if (activeStudyTarget.type === 'folder') {
      const childDeckIds = new Set(
        decks.filter((d) => d.folderId === activeStudyTarget.id).map((d) => d.id)
      );
      return allCards.filter((c) => c.deckId && childDeckIds.has(c.deckId));
    }
    return allCards;
  }, [allCards, activeStudyTarget, decks]);

  const activeReviewQueue = useMemo(() => {
    const deck =
      activeStudyTarget?.type === 'deck'
        ? decks.find((d) => d.id === activeStudyTarget.id)
        : undefined;

    const newLimit = deck ? deck.newCardsPerDay : 20;
    const dueLimit = deck ? deck.maxReviewsPerDay : 50;

    return buildReviewQueue(targetCards, newLimit, dueLimit).queue;
  }, [targetCards, activeStudyTarget, decks]);

  // Handle deck & folder actions
  const handleSelectDeckToStudy = (deck: Deck) => {
    setActiveStudyTarget({
      type: 'deck',
      id: deck.id,
      title: deck.name
    });
    setIsStudying(true);
  };

  const handleSelectFolderToStudy = (folder: Folder) => {
    setActiveStudyTarget({
      type: 'folder',
      id: folder.id,
      title: folder.name
    });
    setIsStudying(true);
  };

  const handleCreateFolder = (name: string, description?: string, color?: string) => {
    const newFolder: Folder = {
      id: `folder_custom_${Date.now()}`,
      name,
      description,
      color: color || '#0284c7',
      parentId: null,
      createdAt: new Date().toISOString()
    };
    const updated = [...folders, newFolder];
    setFolders(updated);
    try {
      localStorage.setItem('raku_folders', JSON.stringify(updated));
    } catch {}
  };

  const handleCreateDeck = (
    folderId: string | null,
    name: string,
    description?: string,
    cardType?: 'word' | 'kanji' | 'grammar' | 'custom' | 'mixed',
    newCardsPerDay = 20,
    maxReviewsPerDay = 50
  ) => {
    const newDeck: Deck = {
      id: `deck_custom_${Date.now()}`,
      folderId,
      name,
      description,
      cardType: cardType || 'word',
      cardIds: [],
      newCardsPerDay,
      maxReviewsPerDay,
      isDefault: false,
      createdAt: new Date().toISOString()
    };
    const updated = [...decks, newDeck];
    setDecks(updated);
    try {
      localStorage.setItem('raku_decks', JSON.stringify(updated));
    } catch {}
  };

  const handleDeleteFolder = (folderId: string) => {
    const updated = folders.filter((f) => f.id !== folderId);
    setFolders(updated);
    try {
      localStorage.setItem('raku_folders', JSON.stringify(updated));
    } catch {}
  };

  const handleDeleteDeck = (deckId: string) => {
    const updated = decks.filter((d) => d.id !== deckId);
    setDecks(updated);
    try {
      localStorage.setItem('raku_decks', JSON.stringify(updated));
    } catch {}
  };

  const handleRateCard = (card: StudyCard, rating: number) => {
    // 1. Update daily study stats
    setStudyStats((prev) => {
      const next = recordStudyActivity(prev, 0, rating);
      try {
        localStorage.setItem('raku_study_stats', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. Update card in allCards
    setAllCards((prevCards) => {
      const updated = prevCards.map((c) => (c.id === card.id ? card : c));
      try {
        localStorage.setItem('raku_cards', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // 3. Sync to Firestore
    if (user) {
      saveCardProgress(user.uid, card, rating);
    }
  };

  return (
    <div className={`min-h-full flex flex-col ${darkMode ? 'dark' : ''}`}>
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
            楽
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-none">
              Raku Nihongo
            </h1>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Kanji – Từ vựng – Ngữ pháp
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Online/Offline status */}
          <span
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                Online
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                Offline
              </>
            )}
          </span>

          {/* AI Quiz generator button */}
          <button
            onClick={() => setIsAiQuizModalOpen(true)}
            className="p-2 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 touch-target flex items-center justify-center"
            title="AI tạo bộ câu hỏi"
            aria-label="AI tạo câu hỏi"
          >
            <Sparkles className="w-5 h-5" />
          </button>

          {/* User profile / login button */}
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 touch-target flex items-center justify-center"
            title={user ? (user.isAnonymous ? 'Khách ẩn danh' : user.email || 'Tài khoản') : 'Đăng nhập'}
            aria-label="Tài khoản"
          >
            <UserIcon className="w-5 h-5" />
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 touch-target flex items-center justify-center"
            aria-label="Chuyển chế độ sáng/tối"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-24">
        {/* User Auth banner for anonymous or unauthenticated users */}
        {!user && (
          <div className="mb-6 p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div>
              <p className="font-semibold text-sky-900 dark:text-sky-200">
                Chào mừng bạn đến với Raku Nihongo!
              </p>
              <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">
                Bạn có thể dùng thử ẩn danh ngay để lưu tiến độ ôn tập offline, hoặc đăng nhập để đồng bộ các thiết bị.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => signInAnonymously(auth)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-semibold rounded-xl shadow-sm touch-target"
              >
                Dùng thử ngay
              </button>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl hover:bg-slate-50 touch-target"
              >
                Đăng nhập
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: STUDY FLASHCARDS & ANKI-STYLE DECKS/FOLDERS */}
        {activeTab === 'study' && (
          <div className="space-y-6">
            {!isStudying ? (
              <div className="space-y-6">
                {/* 1. Today Study Statistics Bar */}
                <TodayStatsBar
                  stats={studyStats}
                  totalDueToday={totalDueToday}
                  totalNewToday={totalNewToday}
                  onQuickStudy={() => {
                    const firstDeck = decks[0];
                    if (firstDeck) {
                      handleSelectDeckToStudy(firstDeck);
                    }
                  }}
                />

                {/* 2. Hierarchical Decks & Folders View (Anki style) */}
                <DeckFolderView
                  folders={folders}
                  decks={decks}
                  cards={allCards}
                  onSelectDeckToStudy={handleSelectDeckToStudy}
                  onSelectFolderToStudy={handleSelectFolderToStudy}
                  onCreateFolder={handleCreateFolder}
                  onCreateDeck={handleCreateDeck}
                  onDeleteDeck={handleDeleteDeck}
                  onDeleteFolder={handleDeleteFolder}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                  <button
                    onClick={() => setIsStudying(false)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center space-x-1"
                  >
                    <span>← Dừng phiên ôn tập</span>
                  </button>

                  <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
                    Đang học: {activeStudyTarget?.title || 'Tất cả thẻ'}
                  </span>
                </div>

                {activeReviewQueue.length === 0 ? (
                  <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                    <div className="text-3xl">🎉</div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      Tuyệt vời! Bạn đã hoàn thành tất cả thẻ cần học hôm nay!
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                      Không còn thẻ nào đến hạn trong bộ thẻ này. Thuật toán FSRS sẽ tự động tính toán lịch nhắc nhở tối ưu tiếp theo cho bạn.
                    </p>
                    <button
                      onClick={() => setIsStudying(false)}
                      className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-xs touch-target"
                    >
                      Trở về danh sách Deck
                    </button>
                  </div>
                ) : (
                  <FlashcardStudyView
                    cards={activeReviewQueue}
                    onComplete={() => setIsStudying(false)}
                    onSelectKanji={(char) => setSelectedKanjiChar(char)}
                    onRateCard={handleRateCard}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: KANJI EXPLORER */}
        {activeTab === 'kanji' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  Mạng Liên Kết Kanji ({SEED_KANJI.length} chữ)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Bấm vào từng chữ để xem các từ vựng liên quan, Hán Việt và chữ dễ nhầm
                </p>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={kanjiSearch}
                  onChange={(e) => setKanjiSearch(e.target.value)}
                  placeholder="Tìm Kanji, Hán Việt, nghĩa..."
                  className="pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100 w-full sm:w-64"
                />
              </div>
            </div>

            {/* Kanji Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {filteredKanji.map((k) => (
                <button
                  key={k.char}
                  onClick={() => setSelectedKanjiChar(k.char)}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-400 text-center transition flex flex-col items-center justify-center touch-target shadow-sm"
                >
                  <span className="text-2xl font-bold text-slate-900 dark:text-slate-50 font-sans">
                    {k.char}
                  </span>
                  <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 mt-1">
                    {k.hanViet[0] || ''}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate max-w-full">
                    {k.meaningVi}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: GRAMMAR & EXERCISES (G4) */}
        {activeTab === 'grammar' && <GrammarPracticeView />}

        {/* TAB 4: IMPORT (G2b & G5b) */}
        {activeTab === 'import' && <ImportView />}

        {/* TAB 5: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Cài đặt ứng dụng</h3>

            <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800">
                <div>
                  <div className="font-semibold">Nguồn dữ liệu &amp; Giấy phép bản quyền</div>
                  <div className="text-[11px] text-slate-400">KANJIDIC2, JMdict, từ điển Hán-Việt</div>
                </div>
                <button
                  onClick={() => setIsLicenseOpen(true)}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-semibold touch-target"
                >
                  Xem chi tiết
                </button>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800">
                <div>
                  <div className="font-semibold">Thuật toán FSRS</div>
                  <div className="text-[11px] text-slate-400">Request retention: 0.9 (mặc định)</div>
                </div>
                <span className="font-bold text-sky-600 dark:text-sky-400">ts-fsrs v4</span>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800">
                <div>
                  <div className="font-semibold">Đồng bộ Offline IndexedDB</div>
                  <div className="text-[11px] text-slate-400">Hỗ trợ đa tab và tiếp tục ôn khi mất mạng</div>
                </div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">Đang bật</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Kanji Detail Modal */}
      <KanjiModal
        char={selectedKanjiChar}
        onClose={() => setSelectedKanjiChar(null)}
      />

      {/* Data Licenses Modal */}
      <DataLicensesModal
        isOpen={isLicenseOpen}
        onClose={() => setIsLicenseOpen(false)}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* AI Quiz Generator Modal */}
      <AiQuizGeneratorModal
        isOpen={isAiQuizModalOpen}
        onClose={() => setIsAiQuizModalOpen(false)}
      />

      {/* Bottom Navigation Bar */}
      <nav
        aria-label="Thanh điều hướng chính"
        className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-2 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))]"
      >
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button
            onClick={() => {
              setIsStudying(false);
              setActiveTab('study');
            }}
            className={`flex flex-col items-center justify-center p-2 rounded-xl touch-target ${
              activeTab === 'study'
                ? 'text-sky-600 dark:text-sky-400 font-bold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <BookOpen className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Ôn từ</span>
          </button>

          <button
            onClick={() => {
              setIsStudying(false);
              setActiveTab('kanji');
            }}
            className={`flex flex-col items-center justify-center p-2 rounded-xl touch-target ${
              activeTab === 'kanji'
                ? 'text-sky-600 dark:text-sky-400 font-bold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Layers className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Kanji</span>
          </button>

          <button
            onClick={() => {
              setIsStudying(false);
              setActiveTab('grammar');
            }}
            className={`flex flex-col items-center justify-center p-2 rounded-xl touch-target ${
              activeTab === 'grammar'
                ? 'text-sky-600 dark:text-sky-400 font-bold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Sparkles className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Ngữ pháp</span>
          </button>

          <button
            onClick={() => {
              setIsStudying(false);
              setActiveTab('import');
            }}
            className={`flex flex-col items-center justify-center p-2 rounded-xl touch-target ${
              activeTab === 'import'
                ? 'text-sky-600 dark:text-sky-400 font-bold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <FileUp className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Nhập từ</span>
          </button>

          <button
            onClick={() => {
              setIsStudying(false);
              setActiveTab('settings');
            }}
            className={`flex flex-col items-center justify-center p-2 rounded-xl touch-target ${
              activeTab === 'settings'
                ? 'text-sky-600 dark:text-sky-400 font-bold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Settings className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Cài đặt</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
