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
  ShieldCheck,
  Search
} from 'lucide-react';
import { SEED_KANJI, SEED_WORDS, SEED_SENTENCES, getWordsByKanji } from '@raku/core';
import { auth, signInAnonymously, onAuthStateChanged, type User } from './services/firebase';
import { DataLicensesModal } from './components/DataLicensesModal';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [activeTab, setActiveTab] = useState<'study' | 'kanji' | 'grammar' | 'import' | 'settings'>('study');
  const [isLicenseOpen, setIsLicenseOpen] = useState<boolean>(false);

  // Kanji Explorer search & filter state
  const [kanjiSearch, setKanjiSearch] = useState<string>('');
  const [selectedKanji, setSelectedKanji] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const handleAnonymousSignIn = async () => {
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.error('Sign in failed:', err);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark');
  };

  // Filtered Kanji list for Kanji tab
  const filteredKanji = useMemo(() => {
    const q = kanjiSearch.trim().toLowerCase();
    if (!q) return SEED_KANJI.slice(0, 120); // first 120 kanji for smooth rendering
    return SEED_KANJI.filter((k) => {
      return (
        k.char.includes(q) ||
        k.hanViet.some((hv) => hv.toLowerCase().includes(q)) ||
        k.meaningVi.toLowerCase().includes(q)
      );
    });
  }, [kanjiSearch]);

  // Words containing selected kanji
  const linkedWords = useMemo(() => {
    if (!selectedKanji) return [];
    return getWordsByKanji(selectedKanji);
  }, [selectedKanji]);

  return (
    <div className={`min-h-full flex flex-col ${darkMode ? 'dark' : ''}`}>
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-sky-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
            楽
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-none">
              Raku Nihongo
            </h1>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Tự học Kanji – Từ vựng – Ngữ pháp
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

          {/* Licenses button */}
          <button
            onClick={() => setIsLicenseOpen(true)}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 touch-target flex items-center justify-center"
            title="Nguồn dữ liệu & Giấy phép"
            aria-label="Xem nguồn dữ liệu và giấy phép"
          >
            <ShieldCheck className="w-5 h-5" />
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
        {/* User Auth banner */}
        {!user && (
          <div className="mb-6 p-4 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sky-900 dark:text-sky-200">
                Chào mừng bạn đến với Raku Nihongo!
              </p>
              <p className="text-sm text-sky-700 dark:text-sky-300">
                Bạn có thể dùng thử ẩn danh ngay lập tức để lưu tiến độ ôn tập offline.
              </p>
            </div>
            <button
              onClick={handleAnonymousSignIn}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-medium rounded-lg shadow-sm transition touch-target flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              Bắt đầu dùng thử
            </button>
          </div>
        )}

        {/* Tab 1: STUDY (Dashboard & G1 Status) */}
        {activeTab === 'study' && (
          <div className="space-y-6">
            {/* Seed Dataset Status Card */}
            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 rounded-lg">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                    Kho Dữ Liệu Học Tập (Giai đoạn 1)
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Dữ liệu liên kết Kanji – Từ vựng – Câu ví dụ song ngữ
                  </p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3 my-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center">
                  <div className="text-2xl font-black text-sky-600 dark:text-sky-400">
                    {SEED_WORDS.length}
                  </div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                    Từ vựng (N3 Mimikara)
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center">
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {SEED_KANJI.length}
                  </div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                    Chữ Kanji liên kết
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center">
                  <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {SEED_SENTENCES.length}
                  </div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                    Câu ví dụ song ngữ
                  </div>
                </div>
              </div>

              {/* Quick Details */}
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                  ✓ Độ phủ Hán Việt: 100%
                </div>
                <div>
                  Toàn bộ 880 từ vựng N3 đều đã được phân tích chữ Hán và ghép nối âm Hán Việt tương ứng.
                  Chuyển sang tab <strong>Kanji</strong> để tra cứu mạng liên kết chữ Hán!
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Tab 2: KANJI EXPLORER */}
        {activeTab === 'kanji' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  Mạng Liên Kết Kanji
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Bấm vào từng chữ Kanji để xem các từ vựng chứa chữ đó
                </p>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={kanjiSearch}
                  onChange={(e) => setKanjiSearch(e.target.value)}
                  placeholder="Tìm Kanji, Hán Việt..."
                  className="pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100 w-full sm:w-64"
                />
              </div>
            </div>

            {/* Kanji Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {filteredKanji.map((k) => {
                const isSelected = selectedKanji === k.char;
                return (
                  <button
                    key={k.char}
                    onClick={() => setSelectedKanji(isSelected ? null : k.char)}
                    className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center touch-target ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 ring-2 ring-sky-400'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
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
                );
              })}
            </div>

            {/* Selected Kanji Detail & Linked Words */}
            {selectedKanji && (
              <div className="mt-6 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-800 shadow-md animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                      <span>{selectedKanji}</span>
                      <span className="text-sm font-normal text-sky-600 dark:text-sky-400">
                        Hán Việt: {SEED_KANJI.find((k) => k.char === selectedKanji)?.hanViet.join(', ')}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {SEED_KANJI.find((k) => k.char === selectedKanji)?.meaningVi}
                    </p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300">
                    {linkedWords.length} từ vựng
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Các từ vựng trong kho chứa chữ {selectedKanji}:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {linkedWords.map((word) => (
                      <div
                        key={word.id}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                      >
                        <div className="flex items-baseline justify-between">
                          <span className="text-base font-bold text-slate-800 dark:text-slate-100">
                            {word.surface}
                          </span>
                          <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                            {word.readings.join(', ')}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                          {word.meaningVi}
                        </div>
                        {word.hanVietBreakdown && word.hanVietBreakdown.length > 0 && (
                          <div className="text-[11px] text-slate-400 mt-1">
                            Hán Việt: {word.hanVietBreakdown.join(' - ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Grammar stub */}
        {activeTab === 'grammar' && (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <Sparkles className="w-10 h-10 mx-auto text-amber-500 mb-2" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Ngữ pháp (Giai đoạn 4)</h3>
            <p className="text-xs mt-1">Phần ghi chú giải thích ngữ pháp và bài tập trắc nghiệm sẽ được kích hoạt tại G4.</p>
          </div>
        )}

        {/* Tab 4: Import stub */}
        {activeTab === 'import' && (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <FileUp className="w-10 h-10 mx-auto text-sky-500 mb-2" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Nhập từ vựng Quizlet / Văn bản (Giai đoạn 2b)</h3>
            <p className="text-xs mt-1">Tính năng dán văn bản / tải CSV, sàng lọc và phân tích sẽ được triển khai tại G2b.</p>
          </div>
        )}

        {/* Tab 5: Settings */}
        {activeTab === 'settings' && (
          <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Cài đặt ứng dụng</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span>Xem thông tin nguồn dữ liệu &amp; Giấy phép</span>
                <button
                  onClick={() => setIsLicenseOpen(true)}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold"
                >
                  Xem giấy phép
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Licenses Modal */}
      <DataLicensesModal
        isOpen={isLicenseOpen}
        onClose={() => setIsLicenseOpen(false)}
      />

      {/* Bottom Navigation Bar */}
      <nav
        aria-label="Thanh điều hướng chính"
        className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-2 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))]"
      >
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button
            onClick={() => setActiveTab('study')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg touch-target ${
              activeTab === 'study'
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <BookOpen className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Kho từ</span>
          </button>

          <button
            onClick={() => setActiveTab('kanji')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg touch-target ${
              activeTab === 'kanji'
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Layers className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Kanji</span>
          </button>

          <button
            onClick={() => setActiveTab('grammar')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg touch-target ${
              activeTab === 'grammar'
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Sparkles className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Ngữ pháp</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg touch-target ${
              activeTab === 'import'
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <FileUp className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Nhập từ</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg touch-target ${
              activeTab === 'settings'
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
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
