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
  Play,
  User as UserIcon
} from 'lucide-react';
import {
  SEED_KANJI,
  SEED_WORDS,
  buildReviewQueue,
  type StudyCard,
  createNewCard
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

  // Kanji Explorer search
  const [kanjiSearch, setKanjiSearch] = useState('');

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

  // Convert seed words to StudyCards
  const allCards = useMemo<StudyCard[]>(() => {
    return SEED_WORDS.map((w, idx) => ({
      id: `c_${w.id}`,
      type: 'word',
      refId: w.id,
      word: w,
      fsrsCard: createNewCard(),
      isNew: idx < 20,
      isDue: idx < 20
    }));
  }, []);

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

  const activeReviewQueue = useMemo(() => {
    return buildReviewQueue(allCards, 15, 30).queue;
  }, [allCards]);

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

        {/* TAB 1: STUDY FLASHCARDS (Mục 4 & FSRS) */}
        {activeTab === 'study' && (
          <div className="space-y-6">
            {!isStudying ? (
              <div className="space-y-6">
                {/* Hero Session Card */}
                <div className="bg-gradient-to-br from-sky-600 via-sky-700 to-indigo-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-semibold">
                      Lịch ôn FSRS hôm nay
                    </span>
                    <span className="text-xs text-white/80">Thuật toán lặp lại ngắt quãng</span>
                  </div>

                  <div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                      {activeReviewQueue.length} Thẻ Sẵn Sàng Ôn Tập
                    </h2>
                    <p className="text-xs sm:text-sm text-white/80 mt-1 max-w-lg">
                      Gõ hiragana, chấm đáp án tự động, xem giải thích Hán Việt từng chữ và xếp lịch ôn tối ưu theo FSRS.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => setIsStudying(true)}
                      className="px-6 py-3 bg-white text-sky-800 hover:bg-slate-50 font-bold text-sm rounded-2xl shadow-md transition flex items-center space-x-2 touch-target"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Bắt đầu phiên học ngay</span>
                    </button>

                    <button
                      onClick={() => setIsAiQuizModalOpen(true)}
                      className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-2xl backdrop-blur transition flex items-center space-x-1.5 touch-target"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>AI tạo bài trắc nghiệm</span>
                    </button>
                  </div>
                </div>

                {/* Metrics Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-sm">
                    <div className="text-2xl font-black text-sky-600 dark:text-sky-400">
                      {SEED_WORDS.length}
                    </div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                      Từ vựng N3
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-sm">
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      {SEED_KANJI.length}
                    </div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                      Chữ Kanji
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-sm">
                    <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                      100%
                    </div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                      Độ phủ Hán Việt
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setIsStudying(false)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center space-x-1"
                  >
                    <span>← Dừng phiên ôn tập</span>
                  </button>
                </div>

                <FlashcardStudyView
                  cards={activeReviewQueue}
                  onComplete={() => setIsStudying(false)}
                  onSelectKanji={(char) => setSelectedKanjiChar(char)}
                  onRateCard={(card, rating) => {
                    if (user) {
                      saveCardProgress(user.uid, card, rating);
                    }
                  }}
                />
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
