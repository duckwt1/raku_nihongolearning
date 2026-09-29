import { useState, useEffect } from 'react';
import { BookOpen, Layers, FileUp, Sparkles, Settings, Wifi, WifiOff, Moon, Sun } from 'lucide-react';
import { auth, signInAnonymously, onAuthStateChanged, type User } from './services/firebase';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [activeTab, setActiveTab] = useState<'study' | 'kanji' | 'grammar' | 'import' | 'settings'>('study');

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

        {/* Phase 0 Initializer Welcome */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                Giai đoạn 0: Khởi tạo hoàn tất
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Kiến trúc Monorepo Cloudflare Workers + Firebase Web modular + Core FSRS
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2"></span>
                Gói thuần TS (@raku/core)
              </h3>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <li>✓ Chuẩn hóa Kana (Katakana ↔ Hiragana, NFC)</li>
                <li>✓ Chấm đáp án đọc nhiều cách</li>
                <li>✓ Bộ lập lịch FSRS (ts-fsrs v4) với nhãn &lt;1m..3mo</li>
                <li>✓ Bộ kiểm tra Zod Schema &amp; Trắc nghiệm</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2"></span>
                Cloudflare Worker &amp; Firebase
              </h3>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <li>✓ Worker Assets serving SPA + API /api/*</li>
                <li>✓ Xác thực JWT qua Google JWKS (jose)</li>
                <li>✓ Firestore Rules &amp; Offline IndexedDB persistence</li>
                <li>✓ Tích hợp Firebase Emulator Suite cục bộ</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Đã kết nối dữ liệu người dùng: {user ? (user.isAnonymous ? 'Khách ẩn danh' : user.email) : 'Chưa đăng nhập'}</span>
            <span>Phiên bản 0.1.0</span>
          </div>
        </section>
      </main>

      {/* Bottom Navigation Bar for Mobile-first navigation */}
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
            <span className="text-[11px]">Ôn từ</span>
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
