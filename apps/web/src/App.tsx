import { useState, useEffect, useMemo, useCallback } from 'react';
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
  User as UserIcon,
  Database,
  CloudUpload,
  RefreshCw,
  CheckCircle2,
  Cloud,
  ChevronDown
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
  createInitialStudyStats,
  getTodayDateString,
  isCardLearnedToday
} from '@raku/core';
import { auth, signInAnonymously, onAuthStateChanged, type User } from './services/firebase';
import {
  syncUserProfile,
  seedAllN3DataToFirestore,
  pullDataFromFirestore,
  flushOfflineQueue,
  getPendingSyncCount,
  enqueueOfflineReview,
  syncFoldersAndDecks,
  syncUserStudyStats,
  loadAndApplyFirestoreReviewLogs
} from './services/firestoreSync';
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
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>(() => {
    return typeof navigator !== 'undefined' && navigator.onLine ? 'synced' : 'offline';
  });
  const [pendingCount, setPendingCount] = useState<number>(() => getPendingSyncCount());
  const [syncToast, setSyncToast] = useState<{
    message: string;
    type: 'success' | 'info' | 'warning';
  } | null>(null);

  const showSyncToast = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    setSyncToast({ message, type });
    setTimeout(() => {
      setSyncToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

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
  interface StudyTarget {
    type: 'deck' | 'folder' | 'all';
    id?: string;
    title: string;
  }
  const [isStudying, setIsStudying] = useState(false);
  const [activeStudyTarget, setActiveStudyTarget] = useState<StudyTarget | null>(null);

  // Firebase Database Seeding and Sync state
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState<{
    stage: string;
    current: number;
    total: number;
  } | null>(null);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const [isPulling, setIsPulling] = useState(false);
  const [pullResult, setPullResult] = useState<string | null>(null);

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
      if (saved) {
        const parsed: Deck[] = JSON.parse(saved);
        return parsed.filter((d) => d.id !== 'deck_n3_kanji');
      }
      return DEFAULT_DECKS;
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

  // StudyCards state (Words and Grammar initialized for active flashcard review)
  const [allCards, setAllCards] = useState<StudyCard[]>(() => {
    try {
      const saved = localStorage.getItem('raku_cards');
      if (saved) {
        const parsed: StudyCard[] = JSON.parse(saved);
        return parsed
          .filter((c) => c.type !== 'kanji' && c.deckId !== 'deck_n3_kanji')
          .map((c) => {
            const reps = c.fsrsCard?.reps ?? 0;
            const hasReviewed = reps > 0 || Boolean(c.fsrsCard?.last_review);
            const isActuallyNew =
              !hasReviewed &&
              (c.isNew ?? true) &&
              (c.fsrsCard?.state === 0 || c.fsrsCard?.state === undefined);
            const dueDate = c.fsrsCard?.due ? new Date(c.fsrsCard.due) : new Date();

            return {
              ...c,
              isNew: isActuallyNew,
              isDue: !isActuallyNew && dueDate.getTime() <= Date.now(),
              fsrsCard: {
                ...c.fsrsCard,
                due: dueDate,
                last_review: c.fsrsCard?.last_review ? new Date(c.fsrsCard.last_review) : undefined
              }
            };
          });
      }
    } catch {}
    return buildDefaultCards();
  });

  // Extra new cards quota for custom study ("Học thêm từ mới")
  const [extraNewCards, setExtraNewCards] = useState<number>(0);
  const [studySessionCards, setStudySessionCards] = useState<StudyCard[]>([]);

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

  // Network status listener (Local-first: no auto-sync on reconnect)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('synced');
      showSyncToast('🟢 Đã kết nối Internet.', 'info');
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
      setPendingCount(getPendingSyncCount());
      showSyncToast(
        '🟠 Đang ở chế độ Ngoại tuyến. Mọi bài học và lượt ôn tập sẽ được lưu an toàn tại máy!',
        'warning'
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auth listener (runs once on mount, no infinite loop or automatic background sync)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        syncUserProfile(currentUser);
      }
    });

    return () => {
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
    const todayStr = getTodayDateString(now);
    let learnedToday = 0;

    for (const card of allCards) {
      if (isCardLearnedToday(card, todayStr)) {
        learnedToday++;
      }

      const isActuallyNew =
        (card.isNew || card.fsrsCard.state === 0) &&
        (!card.fsrsCard.reps || card.fsrsCard.reps === 0) &&
        !card.fsrsCard.last_review;

      if (isActuallyNew) {
        nw++;
      } else if (card.fsrsCard.due.getTime() <= now.getTime()) {
        due++;
      }
    }

    const remainingDailyNew = Math.max(0, 20 - learnedToday);
    return {
      totalDueToday: due,
      totalNewToday: Math.min(nw, remainingDailyNew)
    };
  }, [allCards]);

  const getCardsForTarget = useCallback(
    (target: StudyTarget | null) => {
      if (!target || target.type === 'all') {
        return allCards;
      }
      if (target.type === 'deck') {
        return allCards.filter((c) => c.deckId === target.id);
      }
      if (target.type === 'folder') {
        const childDeckIds = new Set(
          decks.filter((d) => d.folderId === target.id).map((d) => d.id)
        );
        return allCards.filter((c) => c.deckId && childDeckIds.has(c.deckId));
      }
      return allCards;
    },
    [allCards, decks]
  );

  // Handle deck & folder actions
  const handleSelectDeckToStudy = (deck: Deck) => {
    setExtraNewCards(0);
    const target: StudyTarget = {
      type: 'deck',
      id: deck.id,
      title: deck.name
    };
    setActiveStudyTarget(target);
    const targetCards = allCards.filter((c) => c.deckId === deck.id);
    const queue = buildReviewQueue(
      targetCards,
      deck.newCardsPerDay,
      deck.maxReviewsPerDay,
      new Date(),
      0
    ).queue;
    setStudySessionCards(queue);
    setIsStudying(true);
  };

  const handleSelectFolderToStudy = (folder: Folder) => {
    setExtraNewCards(0);
    const target: StudyTarget = {
      type: 'folder',
      id: folder.id,
      title: folder.name
    };
    setActiveStudyTarget(target);
    const childDeckIds = new Set(
      decks.filter((d) => d.folderId === folder.id).map((d) => d.id)
    );
    const targetCards = allCards.filter((c) => c.deckId && childDeckIds.has(c.deckId));
    const queue = buildReviewQueue(targetCards, 20, 50, new Date(), 0).queue;
    setStudySessionCards(queue);
    setIsStudying(true);
  };

  const handleLoadMoreNewCards = () => {
    const nextExtra = extraNewCards + 20;
    setExtraNewCards(nextExtra);
    const targetCards = getCardsForTarget(activeStudyTarget);
    const deck =
      activeStudyTarget?.type === 'deck'
        ? decks.find((d) => d.id === activeStudyTarget.id)
        : undefined;
    const newLimit = deck ? deck.newCardsPerDay : 20;
    const dueLimit = deck ? deck.maxReviewsPerDay : 50;
    const queue = buildReviewQueue(targetCards, newLimit, dueLimit, new Date(), nextExtra).queue;
    setStudySessionCards(queue);
  };

  const handleQuickStudyMoreNew = () => {
    setExtraNewCards(20);
    const target: StudyTarget = {
      type: 'all',
      id: 'all',
      title: 'Toàn bộ thẻ (Học thêm từ mới)'
    };
    setActiveStudyTarget(target);
    const queue = buildReviewQueue(allCards, 20, 50, new Date(), 20).queue;
    setStudySessionCards(queue);
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

    // 3. Local-First: Luôn lưu vào hàng đợi cục bộ trên máy, KHÔNG gửi request mạng lúc học để lật thẻ tức thì
    const currentUid = user?.uid || auth.currentUser?.uid || 'local_device';
    enqueueOfflineReview({
      id: `${card.id}_${Date.now()}`,
      userId: currentUid,
      card,
      rating,
      reviewedAt: new Date().toISOString()
    });
    setPendingCount(getPendingSyncCount());
  };

  const handleManualSync = async () => {
    if (!navigator.onLine) {
      showSyncToast('Thiết bị đang ngoại tuyến, không thể đồng bộ lên đám mây.', 'warning');
      return;
    }
    const currentUid = user?.uid || auth.currentUser?.uid;
    if (!currentUid) {
      showSyncToast('Vui lòng đăng nhập hoặc bấm Dùng thử ngay để đồng bộ.', 'warning');
      setIsAuthModalOpen(true);
      return;
    }
    setSyncStatus('syncing');
    showSyncToast('☁️ Đang đồng bộ dữ liệu lên đám mây...', 'info');

    try {
      // Giới hạn thời gian tối đa 25s (tăng lên vì có thêm waitForPendingWrites)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Hết thời gian chờ kết nối máy chủ (25s). Vui lòng thử lại.')),
          25000
        )
      );

      const doSync = async () => {
        // 1. Đẩy offline queue trước (đã bao gồm waitForPendingWrites bên trong)
        const flushed = await flushOfflineQueue(currentUid);

        // 2. Sau đó sync folders, decks, stats song song
        await Promise.all([
          syncFoldersAndDecks(currentUid, folders, decks),
          syncUserStudyStats(currentUid, studyStats)
        ]);

        return flushed;
      };

      const flushed = await Promise.race([doSync(), timeoutPromise]);
      const remaining = getPendingSyncCount();
      setPendingCount(remaining);

      if (remaining > 0) {
        showSyncToast(
          `⚠️ Đã đẩy ${flushed} lượt ôn tập, nhưng còn ${remaining} bản ghi chưa đồng bộ xong. Vui lòng thử lại.`,
          'warning'
        );
      } else {
        showSyncToast(
          flushed > 0
            ? `✓ Đã đồng bộ xong! Đẩy thành công ${flushed} lượt ôn tập lên đám mây.`
            : '✓ Đã đồng bộ! Toàn bộ dữ liệu của bạn đã khớp với Firebase.',
          'success'
        );
      }
    } catch (err: any) {
      console.warn('Lỗi khi bấm đồng bộ Firestore:', err);
      showSyncToast(`❌ Đồng bộ thất bại: ${err?.message || err}`, 'warning');
    } finally {
      setPendingCount(getPendingSyncCount());
      setSyncStatus('synced');
    }
  };

  const handleSeedAllN3 = async () => {
    setIsSeeding(true);
    setSeedResult(null);
    try {
      if (!user) {
        await signInAnonymously(auth);
      }
      const res = await seedAllN3DataToFirestore((stage, current, total) => {
        setSeedProgress({ stage, current, total });
      });
      setSeedResult(
        `✓ Đã xuất thành công: ${res.kanjiCount} Kanji, ${res.wordsCount} Từ vựng, ${res.grammarCount} Ngữ pháp, ${res.sentencesCount} Câu ví dụ lên Cloud Firestore!`
      );
    } catch (err: any) {
      setSeedResult(`❌ Lỗi xuất dữ liệu: ${err.message || err}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handlePullFromFirestore = async () => {
    if (!user) {
      setPullResult('Bạn cần đăng nhập hoặc bấm Dùng thử ẩn danh trước khi đồng bộ.');
      return;
    }
    setIsPulling(true);
    setPullResult(null);
    try {
      // 1. Tải và tái hiện toàn bộ tiến độ FSRS từ reviewLogs trên Firestore
      const { updatedCards, logsCount, stats } = await loadAndApplyFirestoreReviewLogs(
        user.uid,
        allCards,
        studyStats
      );
      if (logsCount > 0) {
        setAllCards(updatedCards);
        try {
          localStorage.setItem('raku_cards', JSON.stringify(updatedCards));
        } catch {}
      }

      // 2. Tải decks, folders, thẻ cards và stats từ Firestore
      const data = await pullDataFromFirestore(user.uid);
      const cardCount = Object.keys(data.cards).length;

      if (data.folders) {
        setFolders(data.folders);
        try {
          localStorage.setItem('raku_folders', JSON.stringify(data.folders));
        } catch {}
      }

      if (data.decks) {
        setDecks(data.decks);
        try {
          localStorage.setItem('raku_decks', JSON.stringify(data.decks));
        } catch {}
      }

      if (stats) {
        setStudyStats(stats);
        try {
          localStorage.setItem('raku_study_stats', JSON.stringify(stats));
        } catch {}
      }

      const todayDone = stats?.todayStats?.reviewedCount || 0;
      setPullResult(
        `✓ Đã đồng bộ thành công! Đã nạp ${logsCount} lượt reviewLogs, khôi phục trạng thái FSRS cho ${cardCount || logsCount} thẻ, cập nhật tiến độ hôm nay (${todayDone} thẻ đã ôn tập, chuỗi ${stats?.streakDays || 0} ngày) và đồng bộ ${data.decks?.length || 0} decks từ Firestore.`
      );
    } catch (err: any) {
      setPullResult(`❌ Lỗi khi tải dữ liệu: ${err.message || err}`);
    } finally {
      setIsPulling(false);
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
          {/* Offline-First Sync Status indicator */}
          <div
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium cursor-default transition-all ${
              !isOnline
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300/50 dark:border-amber-800'
                : syncStatus === 'syncing'
                ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-300/50 dark:border-sky-800'
                : pendingCount > 0
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800'
            }`}
            title={
              !isOnline
                ? `Đang ngoại tuyến. ${pendingCount > 0 ? `${pendingCount} lượt ôn tập đang lưu tại máy.` : 'Dữ liệu được lưu an toàn tại máy.'}`
                : syncStatus === 'syncing'
                ? 'Đang đồng bộ dữ liệu lên Firebase...'
                : pendingCount > 0
                ? `${pendingCount} lượt ôn tập đã lưu tại máy, sẵn sàng sao lưu lên đám mây khi bạn bấm Đồng bộ.`
                : 'Đã sao lưu an toàn'
            }
          >
            {!isOnline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 mr-1.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>Ngoại tuyến{pendingCount > 0 ? ` (${pendingCount})` : ''}</span>
              </>
            ) : syncStatus === 'syncing' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin text-sky-600 dark:text-sky-400" aria-hidden="true" />
                <span>Đang đồng bộ...</span>
              </>
            ) : pendingCount > 0 ? (
              <>
                <Cloud className="w-3.5 h-3.5 mr-1.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>Lưu máy ({pendingCount})</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Đã sao lưu</span>
              </>
            )}
          </div>

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

      {/* Auto-Sync Toast Notification */}
      {syncToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] sm:w-auto px-4 py-3 rounded-2xl shadow-xl border backdrop-blur-md text-xs font-medium flex items-center justify-between gap-3 transition-all animate-in fade-in slide-in-from-top-3 duration-300 ${
            syncToast.type === 'success'
              ? 'bg-emerald-50/95 dark:bg-emerald-950/95 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : syncToast.type === 'warning'
              ? 'bg-amber-50/95 dark:bg-amber-950/95 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-sky-50/95 dark:bg-sky-950/95 border-sky-300 dark:border-sky-800 text-sky-900 dark:text-sky-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {syncToast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {syncToast.type === 'warning' && <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />}
            {syncToast.type === 'info' && <Cloud className="w-4 h-4 text-sky-600 shrink-0" />}
            <span>{syncToast.message}</span>
          </div>
          <button
            onClick={() => setSyncToast(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-1 p-0.5 rounded"
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

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
                  onStudyMoreNew={handleQuickStudyMoreNew}
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
                    onClick={() => {
                      setStudySessionCards([]);
                      setIsStudying(false);
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center space-x-1"
                  >
                    <span>← Dừng phiên ôn tập</span>
                  </button>

                  <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
                    Đang học: {activeStudyTarget?.title || 'Tất cả thẻ'}
                  </span>
                </div>

                {studySessionCards.length === 0 ? (
                  <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                    <div className="text-4xl">🎉</div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      Tuyệt vời! Bạn đã hoàn thành tất cả thẻ cần học hôm nay!
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                      Thuật toán FSRS đã lên lịch tối ưu cho các thẻ bạn vừa ôn. Các thẻ này sẽ được tạm ẩn và chỉ xuất hiện lại khi đến hạn ôn tập tiếp theo.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                      <button
                        onClick={() => {
                          setStudySessionCards([]);
                          setIsStudying(false);
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl shadow-xs touch-target"
                      >
                        Trở về danh sách Deck
                      </button>
                      <button
                        onClick={handleLoadMoreNewCards}
                        className="w-full sm:w-auto px-5 py-2.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 touch-target"
                      >
                        <span>➕ Học thêm 20 từ mới tiếp theo</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <FlashcardStudyView
                    cards={studySessionCards}
                    onComplete={() => {
                      setStudySessionCards([]);
                      setIsStudying(false);
                    }}
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
          <div className="space-y-4">
            {/* Database & Firebase Offline-First Sync Section */}
            <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                    <Database className="w-5 h-5 text-sky-500" />
                    <span>Đồng Bộ Đám Mây &amp; Dữ Liệu Ngoại Tuyến (Offline-First)</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Mô hình tự động tương tự Anki: học offline không ngắt quãng, tự động đồng bộ khi có Internet
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                      !isOnline
                        ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        : syncStatus === 'syncing'
                        ? 'bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800'
                        : pendingCount > 0
                        ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    }`}
                  >
                    {!isOnline ? (
                      <>
                        <WifiOff className="w-3.5 h-3.5 mr-1 text-amber-600" />
                        Ngoại tuyến (Lưu tại máy)
                      </>
                    ) : syncStatus === 'syncing' ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin text-sky-600" />
                        Đang đồng bộ...
                      </>
                    ) : pendingCount > 0 ? (
                      <>
                        <Cloud className="w-3.5 h-3.5 mr-1 text-amber-600" />
                        {pendingCount} lượt ôn tập lưu tại máy
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                        Đã khớp với đám mây
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Status details card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Trạng thái mạng</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">
                      {isOnline ? '🟢 Đã kết nối Internet' : '🟠 Đang ngoại tuyến'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Hàng đợi chờ đồng bộ</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">
                      {pendingCount > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">{pendingCount} lượt ôn tập chờ sync</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">0 bản ghi (Đã khớp hoàn toàn)</span>
                      )}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Tài khoản đám mây</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block truncate">
                      {user ? (user.isAnonymous ? '👤 Khách ẩn danh' : `✓ ${user.email}`) : 'Chưa đăng nhập'}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 pt-1 leading-relaxed">
                  <p>• <strong>Ưu tiên lưu trên máy (Local-First):</strong> Mọi tiến độ học, từ vựng và chỉ số được lưu tức thì vào thiết bị của bạn, giúp lật thẻ 100% mượt mà, không phụ thuộc vào mạng.</p>
                  <p>• <strong>Chủ động đồng bộ:</strong> Bấm nút <strong>"🔄 Đồng bộ ngay lập tức"</strong> bất cứ khi nào bạn muốn sao lưu dữ liệu lên Cloud Firestore.</p>
                  <p>• <strong>Khôi phục dữ liệu:</strong> Khi chuyển sang thiết bị mới, bấm <strong>"📥 Kéo dữ liệu từ Firebase về máy"</strong> để tải lại toàn bộ tiến độ.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <button
                  onClick={handleManualSync}
                  disabled={syncStatus === 'syncing' || !isOnline}
                  className="flex-1 py-2.5 px-4 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 touch-target"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                  <span>{syncStatus === 'syncing' ? 'Đang đồng bộ...' : '🔄 Đồng bộ ngay lập tức'}</span>
                </button>

                <button
                  onClick={handlePullFromFirestore}
                  disabled={isPulling || !isOnline}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-1.5 touch-target"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPulling ? 'animate-spin' : ''}`} />
                  <span>{isPulling ? 'Đang tải dữ liệu...' : '📥 Kéo dữ liệu từ Firebase về máy'}</span>
                </button>
              </div>

              {pullResult && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium ${
                    pullResult.startsWith('✓')
                      ? 'bg-emerald-100/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-100/80 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  {pullResult}
                </div>
              )}

              {/* Collapsed Advanced Section: Seeding Database */}
              <details className="group border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/40 p-4 transition">
                <summary className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 cursor-pointer flex items-center justify-between list-none">
                  <div className="flex items-center space-x-2">
                    <CloudUpload className="w-4 h-4 text-slate-400 group-open:text-amber-500" />
                    <span>⚙️ Cài đặt nâng cao: Quản lý kho dữ liệu N3 gốc (2.466 bản ghi)</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>

                <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800 space-y-3">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Kho dữ liệu N3 gồm 609 chữ Kanji, 880 từ vựng Mimikara, 97 cấu trúc ngữ pháp và 880 câu ví dụ đã được xuất lên Cloud Firestore.
                    Bạn chỉ cần bấm nút dưới đây nếu muốn khôi phục hoặc nạp đè lại dữ liệu gốc.
                  </p>

                  <button
                    onClick={handleSeedAllN3}
                    disabled={isSeeding}
                    className="py-2 px-4 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 touch-target"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>{isSeeding ? 'Đang xuất dữ liệu lên Firebase...' : '⚡ Nạp lại dữ liệu N3 lên Firestore'}</span>
                  </button>

                  {isSeeding && seedProgress && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[10px] text-amber-800 dark:text-amber-300 font-medium">
                        <span>Đang nạp: {seedProgress.stage}</span>
                        <span>{seedProgress.current} / {seedProgress.total}</span>
                      </div>
                      <div className="w-full h-1.5 bg-amber-200 dark:bg-amber-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-600 transition-all duration-200"
                          style={{ width: `${(seedProgress.current / seedProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {seedResult && (
                    <div
                      className={`p-2.5 rounded-xl text-xs font-medium ${
                        seedResult.startsWith('✓')
                          ? 'bg-emerald-100/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          : 'bg-rose-100/80 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                      }`}
                    >
                      {seedResult}
                    </div>
                  )}
                </div>
              </details>
            </div>

            {/* General Settings Section */}
            <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Cài đặt ứng dụng</h3>

              <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800">
                  <div>
                    <div className="font-semibold">Nguồn dữ liệu &amp; Giấy phép bản quyền</div>
                    <div className="text-[11px] text-slate-400">KANJIDIC2, JMdict, từ điển Hán-Việt, Mimikara N3</div>
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
                    <div className="font-semibold">Thuật toán ôn tập FSRS</div>
                    <div className="text-[11px] text-slate-400">Request retention: 0.9 (tối ưu khả năng ghi nhớ 90%)</div>
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
              setStudySessionCards([]);
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
              setStudySessionCards([]);
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
              setStudySessionCards([]);
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
              setStudySessionCards([]);
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
              setStudySessionCards([]);
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
