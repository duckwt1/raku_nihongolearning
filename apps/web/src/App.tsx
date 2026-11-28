import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Library,
  Wand2,
  Wifi,
  WifiOff,
  Moon,
  Sun,
  Search,
  User as UserIcon,
  CloudUpload,
  RefreshCw,
  CheckCircle2,
  Cloud,
  ChevronDown,
  Download,
  Swords
  // Lock // Khi cần bật lại mật khẩu Firestore: uncomment Lock
} from 'lucide-react';
import {
  SEED_KANJI,
  Rating,
  applyGrade,
  buildReviewQueue,
  buildCustomStudyCardFromPhrase,
  createNewCard,
  isDuplicatePhraseInDeck,
  type StudyCard,
  type Deck,
  type Folder,
  type Grammar,
  type SavedPhraseCandidate,
  type UserStudyStats,
  DEFAULT_FOLDERS,
  DEFAULT_DECKS,
  buildDefaultCards,
  recordStudyActivity,
  createInitialStudyStats,
  getTodayDateString,
  isCardLearnedToday,
  getDailyNewWordCounts,
  calculateStudyStreaks,
  canDeleteDeck,
  migrateDecks,
  migrateFolders,
  type JlptLevel
} from '@raku/core';
import { auth, signInAnonymously, onAuthStateChanged, signOut, type User } from './services/firebase';
import {
  syncUserProfile,
  seedAllN3DataToFirestore,
  pullDataFromFirestore,
  flushOfflineQueue,
  getPendingSyncCount,
  enqueueOfflineReview,
  syncFoldersAndDecks,
  syncUserStudyStats,
  mergeFirestoreCardProgress,
  folderDeckFingerprint,
  areStudyStatsEqual,
  checkCloudDataStatus,
  uploadEntireLocalStateToFirestore,
  loadUserCards,
  saveUserCards,
  loadUserStudyStats,
  saveUserStudyStats,
  loadUserFolders,
  saveUserFolders,
  loadUserDecks,
  saveUserDecks,
  loadDeckSyncPrefs,
  saveDeckSyncPrefs,
  loadDailyNewWordGoal,
  saveDailyNewWordGoal,
  DAILY_NEW_WORD_GOAL_OPTIONS,
  clearOfflineReviewQueue,
  clearUserDataFromBrowser,
  syncDirtyDeckBundles,
  syncSingleDeckBundle,
  pullDeckBundlesForDecks,
  deleteDeckFromCloud,
  mergeFoldersById,
  mergeDecksById
} from './services/firestoreSync';
import { syncPracticeHistoryWithCloud } from './services/practiceHistorySync';
import {
  fetchCommunityDecks,
  publishDeckToCommunity,
  unpublishDeckFromCommunity,
  mergeCommunityDecksIntoLocalState
} from './services/communitySync';
import { deckPublishQueue } from './services/deckPublishQueue';
// Khi cần bật lại kiểm tra mật khẩu tải lên Firestore:
// import { isSyncAuthorized, revokeSyncAuthorization } from './services/syncSecurity';
// import { SyncPasswordModal } from './components/SyncPasswordModal';
import { DataLicensesModal } from './components/DataLicensesModal';
import { FlashcardStudyView } from './components/FlashcardStudyView';
import { ImportView } from './components/ImportView';
import { GrammarPracticeView } from './components/GrammarPracticeView';
import { GrammarExerciseView } from './components/GrammarExerciseView';
import { GrammarAdminPanel } from './components/GrammarAdminPanel';
import { AiQuizGeneratorModal } from './components/AiQuizGeneratorModal';
import { AuthModal } from './components/AuthModal';
import { KanjiModal } from './components/KanjiModal';
import { TodayStatsBar } from './components/TodayStatsBar';
import { StudyHeatmap } from './components/StudyHeatmap';
import { DeckFolderView } from './components/DeckFolderView';
import { DeckDetailView } from './components/DeckDetailView';
import { CloudConflictModal } from './components/CloudConflictModal';

const ArenaView = lazy(() => import('./components/ArenaView').then(({ ArenaView: View }) => ({ default: View })));
const OutputPracticeHub = lazy(() =>
  import('./components/OutputPracticeHub').then(({ OutputPracticeHub: Hub }) => ({ default: Hub }))
);

type AppTab = 'study' | 'library' | 'practice' | 'profile';
type LibrarySection = 'kanji' | 'grammar';
type PracticeSection = 'exercises' | 'output' | 'arena';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>(() => {
    return typeof navigator !== 'undefined' && navigator.onLine ? 'synced' : 'offline';
  });
  const [pendingCount, setPendingCount] = useState<number>(() => getPendingSyncCount());
  const [autoSyncReason, setAutoSyncReason] = useState<'auth' | 'reconnect' | null>(null);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [syncToast, setSyncToast] = useState<{
    message: string;
    type: 'success' | 'info' | 'warning';
  } | null>(null);

  // Target folder & deck for Import navigation
  const [importTargetFolderId, setImportTargetFolderId] = useState<string>('');
  const [importTargetDeckId, setImportTargetDeckId] = useState<string>('');
  const [exerciseTarget, setExerciseTarget] = useState<{
    grammarId: string;
    level: 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
  } | null>(null);
  const [sentenceTargetGrammar, setSentenceTargetGrammar] = useState<Grammar | null>(null);

  // Khi cần bật lại kiểm tra mật khẩu Firestore:
  // const [isSyncPasswordModalOpen, setIsSyncPasswordModalOpen] = useState(false);
  // const [syncPasswordActionTitle, setSyncPasswordActionTitle] = useState('Tải dữ liệu lên Cloud Firestore');
  // const [pendingSyncAction, setPendingSyncAction] = useState<(() => void) | null>(null);
  // const [syncAuthUpdated, setSyncAuthUpdated] = useState(0);
  // const isAuthorizedForSync = useMemo(() => isSyncAuthorized(), [syncAuthUpdated]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);

  const showSyncToast = useCallback((message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current);
    }
    setSyncToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setSyncToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [activeTab, setActiveTab] = useState<AppTab>(() =>
    new URLSearchParams(window.location.search).has('arena') ? 'practice' : 'study'
  );
  const [librarySection, setLibrarySection] = useState<LibrarySection>('kanji');
  const [practiceSection, setPracticeSection] = useState<PracticeSection>(() =>
    new URLSearchParams(window.location.search).has('arena') ? 'arena' : 'exercises'
  );
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedDeckIdForDetail, setSelectedDeckIdForDetail] = useState<string | null>(null);
  const [hasVisitedArena, setHasVisitedArena] = useState(() =>
    new URLSearchParams(window.location.search).has('arena')
  );
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  );
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  const navigationItems = [
    { id: 'study' as const, label: 'Học', icon: BookOpen },
    { id: 'library' as const, label: 'Kho học', icon: Library },
    { id: 'practice' as const, label: 'Luyện tập', icon: Swords },
    { id: 'profile' as const, label: 'Hồ sơ', icon: UserIcon }
  ];

  const handleInstallApp = async () => {
    if (isAppInstalled) return;
    if (!installPrompt) {
      setShowInstallHelp(true);
      setActiveTab('profile');
      return;
    }

    const prompt = installPrompt;
    setInstallPrompt(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setShowInstallHelp(choice.outcome !== 'accepted');
    } catch {
      setShowInstallHelp(true);
    }
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

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

  // Folders & Decks state (with LocalStorage namespaced persistence)
  const [folders, setFolders] = useState<Folder[]>(() => loadUserFolders());
  const [decks, setDecks] = useState<Deck[]>(() => loadUserDecks());

  // Daily Study Stats state (with LocalStorage namespaced persistence)
  const [studyStats, setStudyStats] = useState<UserStudyStats>(() => loadUserStudyStats());

  // StudyCards state (Words and Grammar initialized for active flashcard review)
  const [allCards, setAllCards] = useState<StudyCard[]>(() => loadUserCards());
  const [dailyNewWordGoal, setDailyNewWordGoal] = useState<number>(() =>
    loadDailyNewWordGoal()
  );

  useEffect(() => {
    setDailyNewWordGoal(loadDailyNewWordGoal(user?.uid || 'guest'));
  }, [user?.uid]);

  // Refs cho debounced publisher: luôn đọc dữ liệu mới nhất khi timer chạy
  const decksRef = useRef<Deck[]>(decks);
  const foldersRef = useRef<Folder[]>(folders);
  const cardsRef = useRef<StudyCard[]>(allCards);
  const userRef = useRef<User | null>(user);

  useEffect(() => {
    decksRef.current = decks;
  }, [decks]);
  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);
  useEffect(() => {
    cardsRef.current = allCards;
  }, [allCards]);
  const statsRef = useRef<UserStudyStats>(studyStats);
  useEffect(() => {
    statsRef.current = studyStats;
  }, [studyStats]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const publishLatestDeckSnapshot = async (deckId: string) => {
    const currentUser = userRef.current;
    const deck = decksRef.current.find((d) => d.id === deckId);
    if (!currentUser || !deck) return;
    if (deck.origin !== 'owned' || deck.visibility !== 'community') return;

    const folder = foldersRef.current.find((f) => f.id === deck.folderId);
    const cardsInDeck = cardsRef.current.filter((c) => c.deckId === deckId);
    await publishDeckToCommunity(deck, folder, cardsInDeck, currentUser);
  };

  const scheduleDeckPublish = (deckId: string) => {
    const deck = decksRef.current.find((d) => d.id === deckId);
    if (!deck || deck.origin !== 'owned' || deck.visibility !== 'community') return;

    deckPublishQueue.schedule(`deck:${deckId}`, async () => {
      try {
        await publishLatestDeckSnapshot(deckId);
      } catch (err: any) {
        console.warn('Lỗi publish deck (debounced):', err);
        showSyncToast(
          `Không thể cập nhật bộ thẻ cộng đồng: ${err?.message || err}`,
          'warning'
        );
      }
    });
  };

  const cancelDeckPublish = (deckId: string) => {
    deckPublishQueue.cancel(`deck:${deckId}`);
    deckPublishQueue.cancel(`bundle:${deckId}`);
  };

  const schedulePrivateDeckBundleSync = (deckId: string) => {
    const currentUser = userRef.current;
    if (!currentUser || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    const deck = decksRef.current.find((d) => d.id === deckId);
    if (!deck || deck.origin !== 'owned' || deck.isDefault) return;

    deckPublishQueue.schedule(`bundle:${deckId}`, async () => {
      const activeUser = userRef.current;
      const latestDeck = decksRef.current.find((d) => d.id === deckId);
      if (!activeUser || !latestDeck || latestDeck.origin !== 'owned' || latestDeck.isDefault) {
        return;
      }
      const folder = foldersRef.current.find((f) => f.id === latestDeck.folderId);
      const cardsInDeck = cardsRef.current.filter((c) => c.deckId === deckId);
      try {
        const updatedDeck = await syncSingleDeckBundle(
          activeUser.uid,
          latestDeck,
          cardsInDeck,
          folder
        );
        if (userRef.current?.uid === activeUser.uid) {
          applyDeckPatch(deckId, {
            cardsHash: updatedDeck.cardsHash,
            bundleChunkCount: updatedDeck.bundleChunkCount,
            cardCount: updatedDeck.cardCount,
            updatedAt: updatedDeck.updatedAt
          });
        }
      } catch (err: any) {
        console.warn('Lỗi đồng bộ gói từ vựng bộ thẻ:', err);
      }
    });
  };

  // Ghi nốt các thay đổi đang chờ khi ẩn tab hoặc rời trang
  useEffect(() => {
    const flushPending = () => deckPublishQueue.flushAll();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };

    window.addEventListener('pagehide', flushPending);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushPending);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushPending();
    };
  }, []);

  // Extra new cards quota for custom study ("Học thêm từ mới")
  const [extraNewCards, setExtraNewCards] = useState<number>(0);
  const [studySessionCards, setStudySessionCards] = useState<StudyCard[]>([]);

  const selectTab = (tab: AppTab) => {
    setStudySessionCards([]);
    setIsStudying(false);
    setIsImportOpen(false);
    setSelectedDeckIdForDetail(null);
    if (tab === 'practice') {
      setExerciseTarget(null);
      if (practiceSection === 'arena') setHasVisitedArena(true);
    }
    setActiveTab(tab);
  };

  const selectPracticeSection = (section: PracticeSection) => {
    if (section === 'exercises') setExerciseTarget(null);
    if (section === 'arena') setHasVisitedArena(true);
    setPracticeSection(section);
  };

  // Kanji Explorer search
  const [kanjiSearch, setKanjiSearch] = useState('');

  // Active study timer: track active seconds spent in study session
  useEffect(() => {
    if (!isStudying) return;

    const timer = setInterval(() => {
      setStudyStats((prev) => {
        const next = recordStudyActivity(prev, 1);
        saveUserStudyStats(user?.uid, next);
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isStudying, user?.uid]);

  // Network status listener (Local-first: no auto-sync on reconnect)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('synced');
      setAutoSyncReason('reconnect');
      showSyncToast('🟢 Đã kết nối Internet.', 'info');
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
      setPendingCount(getPendingSyncCount(user?.uid));
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
  }, [user?.uid]);

  // Auth listener: switch local user profiles cleanly upon sign-in/sign-out
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Huỷ các publish đang chờ và dừng phiên ôn tập của tài khoản trước
      deckPublishQueue.cancelAll();
      setIsStudying(false);
      setSelectedDeckIdForDetail(null);
      setStudySessionCards([]);
      setActiveStudyTarget(null);
      setUser(currentUser);
      const uid = currentUser?.uid || 'guest';
      const uCards = loadUserCards(uid);
      const uStats = loadUserStudyStats(uid);
      const uFolders = loadUserFolders(uid);
      const uDecks = loadUserDecks(uid);
      setAllCards(uCards);
      setStudyStats(uStats);
      setFolders(uFolders);
      setDecks(uDecks);
      setPendingCount(getPendingSyncCount(uid));
      setAutoSyncReason(currentUser ? 'auth' : null);

      if (currentUser) {
        syncUserProfile(currentUser);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Tự động tải & cập nhật các bộ thẻ Cộng đồng (Community Decks) từ Firestore
  useEffect(() => {
    let isMounted = true;
    const loadCommunity = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        const remoteCommunity = await fetchCommunityDecks();
        if (!isMounted || remoteCommunity.length === 0) return;

        const currentUid = user?.uid;
        const currentDecks = loadUserDecks(currentUid);
        const currentFolders = loadUserFolders(currentUid);
        const currentCards = loadUserCards(currentUid);
        const syncPrefs = loadDeckSyncPrefs(currentUid);
        const hiddenDeckIds = new Set(syncPrefs.hiddenDeckIds);
        const hiddenFolderIds = new Set(syncPrefs.hiddenFolderIds);

        const res = mergeCommunityDecksIntoLocalState(
          currentDecks,
          currentFolders,
          currentCards,
          remoteCommunity,
          { hiddenDeckIds, hiddenFolderIds, currentUid }
        );

        if (res.hasChanges) {
          setDecks(res.updatedDecks);
          setFolders(res.updatedFolders);
          setAllCards(res.updatedCards);
          saveUserDecks(currentUid, res.updatedDecks);
          saveUserFolders(currentUid, res.updatedFolders);
          saveUserCards(currentUid, res.updatedCards);
          if (res.newDecksCount > 0 || res.newCardsCount > 0) {
            showSyncToast(
              `🌐 Đã tự động cập nhật ${res.newDecksCount} bộ thẻ cộng đồng (${res.newCardsCount} từ vựng mới)!`,
              'info'
            );
          }
        }

        // Dọn tombstone: chỉ giữ id của deck/folder vẫn còn tồn tại trên Cloud.
        const remoteDeckIds = new Set<string>();
        const remoteFolderIds = new Set<string>();
        for (const payload of remoteCommunity) {
          remoteDeckIds.add(payload.docId || payload.deck.id);
          remoteDeckIds.add(payload.deck.id);
          if (payload.folder) remoteFolderIds.add(payload.folder.id);
        }
        const nextHiddenDeckIds = syncPrefs.hiddenDeckIds.filter((id) => remoteDeckIds.has(id));
        const nextHiddenFolderIds = syncPrefs.hiddenFolderIds.filter((id) => remoteFolderIds.has(id));
        if (
          nextHiddenDeckIds.length !== syncPrefs.hiddenDeckIds.length ||
          nextHiddenFolderIds.length !== syncPrefs.hiddenFolderIds.length
        ) {
          saveDeckSyncPrefs(currentUid, {
            hiddenDeckIds: nextHiddenDeckIds,
            hiddenFolderIds: nextHiddenFolderIds
          });
        }
      } catch (err) {
        console.warn('Lỗi khi tải bộ thẻ cộng đồng:', err);
      }
    };

    void loadCommunity();
    return () => {
      isMounted = false;
    };
  }, [user?.uid, isOnline]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
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

  const todayKey = getTodayDateString();
  const dailyNewWords = useMemo(() => getDailyNewWordCounts(allCards), [allCards]);
  const streak = useMemo(
    () => calculateStudyStreaks(dailyNewWords, todayKey, dailyNewWordGoal),
    [dailyNewWords, todayKey, dailyNewWordGoal]
  );
  const newWordsToday = dailyNewWords.get(todayKey) || 0;

  useEffect(() => {
    setStudyStats((prev) => {
      if (prev.streakDays === streak.currentStreak) return prev;
      const next = { ...prev, streakDays: streak.currentStreak };
      saveUserStudyStats(user?.uid, next);
      return next;
    });
  }, [streak.currentStreak, user?.uid]);

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

  const handleQuickStudyToday = () => {
    setExtraNewCards(0);
    const target: StudyTarget = {
      type: 'all',
      id: 'all',
      title: 'Ôn tập hôm nay'
    };
    setActiveStudyTarget(target);
    const queue = buildReviewQueue(allCards, 20, 50, new Date(), 0).queue;
    setStudySessionCards(queue);
    setIsStudying(true);
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

  const handleDailyNewWordGoalChange = (goal: number) => {
    saveDailyNewWordGoal(user?.uid || 'guest', goal);
    setDailyNewWordGoal(goal);
    showSyncToast(`✓ Đã đặt mục tiêu ${goal} từ mới/ngày.`, 'success');
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
    foldersRef.current = updated;
    setFolders(updated);
    saveUserFolders(user?.uid, updated);
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
      origin: 'owned',
      visibility: 'private',
      authorName: user?.displayName || user?.email?.split('@')[0] || 'Thành viên',
      authorUid: user?.uid,
      createdAt: new Date().toISOString()
    };
    const updated = [...decks, newDeck];
    decksRef.current = updated;
    setDecks(updated);
    saveUserDecks(user?.uid, updated);

    const folderName = folders.find((f) => f.id === folderId)?.name;
    showSyncToast(
      folderName
        ? `✓ Đã tạo bộ thẻ "${name}" trong thư mục "${folderName}" (Riêng tư trên máy).`
        : `✓ Đã tạo bộ thẻ "${name}" (Riêng tư trên máy).`,
      'success'
    );
  };

  const applyDeckPatch = (deckId: string, patch: Partial<Deck>) => {
    setDecks((prevDecks) => {
      const updated = prevDecks.map((deck) =>
        deck.id === deckId ? { ...deck, ...patch } : deck
      );
      saveUserDecks(user?.uid, updated);
      return updated;
    });
  };

  const handleDeleteFolder = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    if (folder.isDefault) {
      showSyncToast('Không thể xoá thư mục nội dung có sẵn.', 'warning');
      return;
    }

    const childDecks = decks.filter((deck) => deck.folderId === folderId);
    if (childDecks.length > 0) {
      const confirmed = window.confirm(
        `Thư mục "${folder.name}" đang có ${childDecks.length} bộ thẻ. Xoá thư mục sẽ chuyển các bộ thẻ sang "Chưa phân loại". Tiếp tục?`
      );
      if (!confirmed) return;
    }

    const updatedFolders = folders.filter((f) => f.id !== folderId);
    const updatedDecks = decks.map((deck) =>
      deck.folderId === folderId ? { ...deck, folderId: null } : deck
    );
    setFolders(updatedFolders);
    saveUserFolders(user?.uid, updatedFolders);
    setDecks(updatedDecks);
    saveUserDecks(user?.uid, updatedDecks);

    // Giữ tombstone để loader cộng đồng không tạo lại folder vừa xoá.
    const prefs = loadDeckSyncPrefs(user?.uid);
    saveDeckSyncPrefs(user?.uid, {
      ...prefs,
      hiddenFolderIds: [...new Set([...prefs.hiddenFolderIds, folderId])]
    });

    showSyncToast(`✓ Đã xoá thư mục "${folder.name}".`, 'info');
  };

  const handleDeleteDeck = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return;
    if (!canDeleteDeck(deck, user?.uid)) {
      showSyncToast(
        'Bạn không phải chủ sở hữu bộ thẻ này nên không thể xoá.',
        'warning'
      );
      return;
    }

    const isCommunityDeck = deck.origin === 'community';
    const confirmed = window.confirm(
      isCommunityDeck
        ? `Xoá bộ thẻ "${deck.name}" khỏi máy và gỡ khỏi cộng đồng?`
        : `Xoá bộ thẻ "${deck.name}"? Toàn bộ thẻ trong bộ này cũng sẽ bị xoá khỏi máy.`
    );
    if (!confirmed) return;

    const shouldUnpublish = deck.visibility === 'community';
    cancelDeckPublish(deckId);

    // Tombstone: chặn loader cộng đồng tự thêm lại deck vừa xoá.
    const prefs = loadDeckSyncPrefs(user?.uid);
    const hiddenIds = [deck.id, deck.communityDocId].filter(Boolean) as string[];
    saveDeckSyncPrefs(user?.uid, {
      ...prefs,
      hiddenDeckIds: [...new Set([...prefs.hiddenDeckIds, ...hiddenIds])]
    });

    const updatedDecks = decks.filter((d) => d.id !== deckId);
    const updatedCards = allCards.filter((c) => c.deckId !== deckId);
    decksRef.current = updatedDecks;
    cardsRef.current = updatedCards;
    setDecks(updatedDecks);
    saveUserDecks(user?.uid, updatedDecks);
    setAllCards(updatedCards);
    saveUserCards(user?.uid, updatedCards);
    if (selectedDeckIdForDetail === deckId) {
      setSelectedDeckIdForDetail(null);
    }

    if (user && isOnline && deck.origin === 'owned' && !deck.isDefault) {
      void deleteDeckFromCloud(user.uid, deckId, deck.bundleChunkCount || 1).catch((err) => {
        console.warn('Không thể xoá deck bundle trên Cloud:', err);
      });
    }

    if (shouldUnpublish) {
      void deckPublishQueue
        .enqueueExclusive(`deck:${deckId}`, () =>
          unpublishDeckFromCommunity(deck.communityDocId || deck.id)
        )
        .then(() =>
          showSyncToast(`✓ Đã xoá "${deck.name}" và gỡ khỏi cộng đồng.`, 'success')
        )
        .catch((err) =>
          showSyncToast(
            `Đã xoá trên máy nhưng chưa gỡ được khỏi cộng đồng: ${err?.message || err}`,
            'warning'
          )
        );
    } else if (isCommunityDeck) {
      showSyncToast(`✓ Đã bỏ "${deck.name}" khỏi thư viện của bạn.`, 'info');
    } else {
      showSyncToast(`✓ Đã xoá bộ thẻ "${deck.name}".`, 'success');
    }
  };

  const handleToggleDeckVisibility = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck || deck.origin !== 'owned' || deck.isDefault) return;

    if (!user || user.isAnonymous) {
      showSyncToast(
        'Vui lòng đăng nhập bằng tài khoản (không dùng chế độ ẩn danh) để chia sẻ bộ thẻ lên cộng đồng.',
        'warning'
      );
      return;
    }

    const uid = user.uid;
    const prefs = loadDeckSyncPrefs(uid);

    if (deck.visibility === 'community') {
      cancelDeckPublish(deckId);
      applyDeckPatch(deckId, { visibility: 'private' });
      void deckPublishQueue
        .enqueueExclusive(`deck:${deckId}`, () =>
          unpublishDeckFromCommunity(deck.communityDocId || deck.id)
        )
        .then(() => showSyncToast(`✓ Đã gỡ "${deck.name}" khỏi cộng đồng.`, 'info'))
        .catch((err) => {
          if (userRef.current?.uid === uid) {
            applyDeckPatch(deckId, { visibility: 'community' });
          }
          showSyncToast(
            `❌ Không thể gỡ khỏi cộng đồng: ${err?.message || err}`,
            'warning'
          );
        });
      return;
    }

    const folder = folders.find((f) => f.id === deck.folderId);
    const cardsInDeck = allCards.filter((c) => c.deckId === deckId);
    cancelDeckPublish(deckId);
    saveDeckSyncPrefs(uid, {
      ...prefs,
      hiddenDeckIds: prefs.hiddenDeckIds.filter(
        (id) => id !== deck.id && id !== (deck.communityDocId || deck.id)
      )
    });
    applyDeckPatch(deckId, { visibility: 'community' });

    void deckPublishQueue
      .enqueueExclusive(`deck:${deckId}`, () =>
        publishDeckToCommunity(
          { ...deck, visibility: 'community' },
          folder,
          cardsInDeck,
          user
        )
      )
      .then((res) => {
        if (userRef.current?.uid === uid) {
          applyDeckPatch(deckId, {
            visibility: 'community',
            communityDocId: res.docId
          });
        }
      })
      .then(() =>
        showSyncToast(
          `✓ Đã chia sẻ "${deck.name}" (${cardsInDeck.length} từ) lên cộng đồng.`,
          'success'
        )
      )
      .catch((err) => {
        if (userRef.current?.uid === uid) {
          applyDeckPatch(deckId, { visibility: 'private' });
        }
        showSyncToast(
          `❌ Không thể chia sẻ "${deck.name}": ${err?.message || err}`,
          'warning'
        );
      });
  };

  const handleRateCard = (card: StudyCard, rating: number) => {
    const currentUid = user?.uid || auth.currentUser?.uid;

    // 1. Update daily study stats
    setStudyStats((prev) => {
      const next = recordStudyActivity(prev, 0, rating);
      saveUserStudyStats(currentUid, next);
      return next;
    });

    // 2. Update card in allCards
    setAllCards((prevCards) => {
      const updated = prevCards.map((c) => (c.id === card.id ? card : c));
      saveUserCards(currentUid, updated);
      return updated;
    });

    // 3. Local-First: Luôn lưu vào hàng đợi cục bộ trên máy của user
    enqueueOfflineReview({
      id: `${currentUid || 'guest'}_${card.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId: currentUid || 'guest',
      card,
      rating,
      reviewedAt: new Date().toISOString()
    }, currentUid);
    setPendingCount(getPendingSyncCount(currentUid));
  };

  const handleSignOut = async (clearLocalData = false) => {
    deckPublishQueue.cancelAll();
    setIsStudying(false);
    setStudySessionCards([]);
    setActiveStudyTarget(null);
    const currentUid = user?.uid;
    if (clearLocalData && currentUid) {
      clearUserDataFromBrowser(currentUid);
    }
    await signOut(auth);
    setUser(null);

    // Chuyển sạch về hồ sơ khách vãng lai mặc định
    const gCards = loadUserCards('guest');
    const gStats = loadUserStudyStats('guest');
    const gFolders = loadUserFolders('guest');
    const gDecks = loadUserDecks('guest');
    setAllCards(gCards);
    setStudyStats(gStats);
    setFolders(gFolders);
    setDecks(gDecks);
    setPendingCount(getPendingSyncCount('guest'));
    showSyncToast(
      clearLocalData
        ? 'Đã đăng xuất và xóa toàn bộ dữ liệu tài khoản khỏi thiết bị này.'
        : 'Đã đăng xuất. Dữ liệu offline của tài khoản vẫn được lưu an toàn.',
      'info'
    );
  };

  // Khi cần bật lại kiểm tra mật khẩu trước khi tải lên Firestore:
  // const requireSyncPassword = (_actionTitle: string, action: () => void) => {
  //   if (!isSyncAuthorized()) {
  //     setSyncPasswordActionTitle(_actionTitle);
  //     setPendingSyncAction(() => action);
  //     setIsSyncPasswordModalOpen(true);
  //     return;
  //   }
  //   action();
  // };

  const executeUploadToCloud = async () => {
    const currentUid = userRef.current?.uid || auth.currentUser?.uid;
    if (!currentUid || isSyncingRef.current) return;
    isSyncingRef.current = true;
    setSyncStatus('syncing');
    showSyncToast('☁️ Đang đẩy toàn bộ dữ liệu trên máy lên Cloud Firestore...', 'info');
    try {
      const res = await uploadEntireLocalStateToFirestore(
        currentUid,
        cardsRef.current,
        foldersRef.current,
        decksRef.current,
        statsRef.current
      );
      if (userRef.current?.uid === currentUid) {
        decksRef.current = res.updatedDecks;
        setDecks(res.updatedDecks);
        saveUserDecks(currentUid, res.updatedDecks);
        setPendingCount(getPendingSyncCount(currentUid));
      }
      showSyncToast(
        `✓ Đã tải thành công ${res.cardsSynced} thẻ học lên Cloud Firestore!`,
        'success'
      );
    } catch (err: any) {
      showSyncToast(`❌ Tải lên đám mây thất bại: ${err?.message || err}`, 'warning');
    } finally {
      isSyncingRef.current = false;
      setSyncStatus(navigator.onLine ? 'synced' : 'offline');
    }
  };

  const handleUploadToCloud = () => {
    // Tạm thời bỏ qua hỏi mật khẩu để bạn bè dùng tiện lợi:
    void executeUploadToCloud();
    // Khi cần bật lại mật khẩu:
    // requireSyncPassword('Tải toàn bộ dữ liệu trên máy lên Cloud Firestore', () => {
    //   void executeUploadToCloud();
    // });
  };

  const handleResetToCloud = () => {
    deckPublishQueue.cancelAll();
    const currentUid = user?.uid || auth.currentUser?.uid;
    if (currentUid) {
      clearUserDataFromBrowser(currentUid);
    }
    const defCards = buildDefaultCards();
    const defStats = createInitialStudyStats();
    setAllCards(defCards);
    setStudyStats(defStats);
    setFolders(DEFAULT_FOLDERS);
    setDecks(DEFAULT_DECKS);
    saveUserCards(currentUid, defCards);
    saveUserStudyStats(currentUid, defStats);
    saveUserFolders(currentUid, DEFAULT_FOLDERS);
    saveUserDecks(currentUid, DEFAULT_DECKS);
    clearOfflineReviewQueue(currentUid);
    setPendingCount(0);
    showSyncToast('✓ Đã đặt lại dữ liệu trên máy về mặc định thành công.', 'info');
  };

  const executeManualSync = async () => {
    if (isSyncingRef.current) return;
    if (!navigator.onLine) {
      showSyncToast('Thiết bị đang ngoại tuyến, không thể đồng bộ lên đám mây.', 'warning');
      return;
    }
    const currentUid = userRef.current?.uid || auth.currentUser?.uid;
    if (!currentUid) {
      showSyncToast('Vui lòng đăng nhập hoặc bấm Dùng thử ngay để đồng bộ.', 'warning');
      setIsAuthModalOpen(true);
      return;
    }

    isSyncingRef.current = true;
    setSyncStatus('syncing');
    let syncStage = 'đẩy hàng đợi review offline';
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      // Kiểm tra xem trên Cloud Firestore có dữ liệu không
      let cloudStatus;
      try {
        cloudStatus = await checkCloudDataStatus(currentUid);
      } catch (err: any) {
        showSyncToast(`Không thể kiểm tra dữ liệu cloud: ${err?.message || err}`, 'warning');
        return;
      }
      if (userRef.current?.uid !== currentUid) return;

      const localLearned = cardsRef.current.filter(
        (c) => (c.fsrsCard?.reps ?? 0) > 0 || Boolean(c.fsrsCard?.last_review) || !c.isNew
      ).length;
      const pendingQ = getPendingSyncCount(currentUid);

      // Giống Anki: Nếu Cloud trống hoàn toàn (hoặc vừa bị xóa trên Firebase),
      // nhưng trên máy người dùng đã có tiến độ -> Mở hộp thoại giải quyết xung đột!
      if (!cloudStatus.hasCloudData && (localLearned > 0 || pendingQ > 0)) {
        setIsConflictModalOpen(true);
        return;
      }

      showSyncToast('☁️ Đang đồng bộ dữ liệu lên đám mây...', 'info');

      // Giới hạn thời gian tối đa 45s cho mạng di động
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          cancelled = true;
          reject(new Error('Hết thời gian chờ kết nối máy chủ (45s). Vui lòng thử lại.'));
        }, 45000);
      });

      const doSync = async () => {
        // 1. Đẩy offline queue trước
        syncStage = 'đẩy hàng đợi review offline';
        const flushed = await flushOfflineQueue(currentUid);
        if (cancelled || userRef.current?.uid !== currentUid) return flushed;

        // 2. Đẩy các gói từ vựng custom (deckBundles) CHỈ cho deck thay đổi (0 writes nếu không đổi)
        syncStage = 'đồng bộ gói từ vựng bộ thẻ';
        const dirtyBundleRes = await syncDirtyDeckBundles(
          currentUid,
          decksRef.current,
          cardsRef.current
        );
        if (cancelled || userRef.current?.uid !== currentUid) return flushed;
        if (dirtyBundleRes.syncedDeckIds.length > 0) {
          decksRef.current = dirtyBundleRes.updatedDecks;
          setDecks(dirtyBundleRes.updatedDecks);
          saveUserDecks(currentUid, dirtyBundleRes.updatedDecks);
        }

        // 3. Đọc tiến độ thẻ, stats và cấu trúc deck/folder (đồng bộ 2 chiều Web <-> Mobile)
        syncStage = 'đọc hồ sơ, thẻ, thư mục, decks và review logs';
        const remoteProgress = await pullDataFromFirestore(currentUid, {
          existingStats: statsRef.current,
          currentCards: cardsRef.current,
          includeStructure: true
        });
        if (cancelled || userRef.current?.uid !== currentUid) return flushed;

        const syncPrefs = loadDeckSyncPrefs(currentUid);
        const hiddenDeckIds = new Set(syncPrefs.hiddenDeckIds);
        const hiddenFolderIds = new Set(syncPrefs.hiddenFolderIds);

        const mergedFolders = remoteProgress.folders
          ? mergeFoldersById(foldersRef.current, remoteProgress.folders, hiddenFolderIds)
          : foldersRef.current;
        const mergedDecks = remoteProgress.decks
          ? mergeDecksById(decksRef.current, remoteProgress.decks, currentUid, hiddenDeckIds)
          : decksRef.current;

        if (folderDeckFingerprint(foldersRef.current, decksRef.current) !== folderDeckFingerprint(mergedFolders, mergedDecks)) {
          foldersRef.current = mergedFolders;
          decksRef.current = mergedDecks;
          setFolders(mergedFolders);
          setDecks(mergedDecks);
          saveUserFolders(currentUid, mergedFolders);
          saveUserDecks(currentUid, mergedDecks);
        }

        // 4. Tải gói từ vựng (deckBundles) CHỈ cho deck mới/đổi hash từ thiết bị khác (0 reads nếu không đổi)
        syncStage = 'tải gói từ vựng bộ thẻ mới';
        const pulledBundles = await pullDeckBundlesForDecks(
          currentUid,
          mergedDecks,
          cardsRef.current
        );
        if (cancelled || userRef.current?.uid !== currentUid) return flushed;

        const latestCards = pulledBundles.cards;
        const baseCards = remoteProgress.legacyUpdatedCards
          ? mergeFirestoreCardProgress(latestCards, Object.fromEntries(
              remoteProgress.legacyUpdatedCards
                .filter((c) => c.fsrsCard.last_review || c.fsrsCard.reps > 0)
                .map((c) => [c.id, { ...c.fsrsCard, firstLearnedAt: c.firstLearnedAt, learnedAt: c.learnedAt }])
            ))
          : latestCards;
        const mergedCards = mergeFirestoreCardProgress(
          baseCards,
          remoteProgress.cards
        ).filter((card) => card.type !== 'grammar' && card.deckId !== 'deck_n3_grammar');
        if (
          Object.keys(remoteProgress.cards).length > 0 ||
          remoteProgress.legacyUpdatedCards ||
          pulledBundles.fetchedDeckCount > 0
        ) {
          cardsRef.current = mergedCards;
          setAllCards(mergedCards);
          saveUserCards(currentUid, mergedCards);
        }
        const mergedStats = remoteProgress.stats || statsRef.current;
        setStudyStats(mergedStats);
        saveUserStudyStats(currentUid, mergedStats);

        // 5. Skip unchanged structure/stats so repeated manual syncs do not issue no-op writes.
        const currentFolders = foldersRef.current;
        const currentDecks = decksRef.current;
        if (
          dirtyBundleRes.syncedDeckIds.length > 0 ||
          remoteProgress.structureFingerprint !== folderDeckFingerprint(currentFolders, currentDecks)
        ) {
          syncStage = 'ghi thư mục và decks';
          await syncFoldersAndDecks(currentUid, currentFolders, currentDecks);
        }
        if (cancelled || userRef.current?.uid !== currentUid) return flushed;
        if (!areStudyStatsEqual(mergedStats, remoteProgress.remoteStats)) {
          syncStage = 'ghi thống kê học tập';
          await syncUserStudyStats(currentUid, mergedStats);
        }

        // 6. Đồng bộ lịch sử hội thoại & đặt câu (bounded queries)
        syncStage = 'đồng bộ lịch sử hội thoại và đặt câu';
        await syncPracticeHistoryWithCloud(currentUid);

        return flushed;
      };

      const flushed = await Promise.race([doSync(), timeoutPromise]);
      if (userRef.current?.uid !== currentUid) return;
      const remaining = getPendingSyncCount(currentUid);
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
      const code = typeof err?.code === 'string' ? ` (${err.code})` : '';
      showSyncToast(`❌ Đồng bộ thất bại tại bước ${syncStage}${code}: ${err?.message || err}`, 'warning');
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      isSyncingRef.current = false;
      if (userRef.current?.uid === currentUid) {
        setPendingCount(getPendingSyncCount(currentUid));
      }
      setSyncStatus(navigator.onLine ? 'synced' : 'offline');
    }
  };

  const handleManualSync = () => {
    // Tạm thời bỏ qua hỏi mật khẩu để bạn bè dùng tiện lợi:
    void executeManualSync();
    // Khi cần bật lại mật khẩu:
    // requireSyncPassword('Đồng bộ tiến độ học lên Cloud Firestore', () => {
    //   void executeManualSync();
    // });
  };

  // Flush only an existing queue on sign-in or reconnect.
  useEffect(() => {
    if (!autoSyncReason || !isOnline || !user?.uid || syncStatus === 'syncing') return;
    if (pendingCount === 0) {
      setAutoSyncReason(null);
      return;
    }
    // Khi cần giới hạn auto-sync chỉ khi đã nhập mật khẩu:
    // if (!isSyncAuthorized()) {
    //   setAutoSyncReason(null);
    //   return;
    // }
    setAutoSyncReason(null);
    void executeManualSync();
  }, [autoSyncReason, isOnline, user?.uid, pendingCount, syncStatus]);

  const executeSeedAllN3 = async () => {
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
        `✓ Đã xuất thành công: ${res.kanjiCount} Kanji, ${res.wordsCount} Từ vựng, ${res.sentencesCount} Câu ví dụ lên Cloud Firestore!`
      );
    } catch (err: any) {
      setSeedResult(`❌ Lỗi xuất dữ liệu: ${err.message || err}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedAllN3 = () => {
    // Tạm thời bỏ qua hỏi mật khẩu để bạn bè dùng tiện lợi:
    void executeSeedAllN3();
    // Khi cần bật lại mật khẩu:
    // requireSyncPassword('Nạp lại 2.369 bản ghi dữ liệu N3 lên Cloud Firestore', () => {
    //   void executeSeedAllN3();
    // });
  };

  // ==========================================
  // XỬ LÝ NHẬP TỪ & THÊM THẺ MỚI (LƯU LOCAL)
  // ==========================================
  const handleImportCards = (
    newCards: StudyCard[],
    targetDeckId: string,
    newDeck?: Deck,
    newFolder?: Folder
  ) => {
    const currentUid = user?.uid;

    // 1. Cập nhật Folders nếu có tạo mới
    let updatedFolders = folders;
    if (newFolder && !folders.some((f) => f.id === newFolder.id)) {
      updatedFolders = [...folders, newFolder];
      foldersRef.current = updatedFolders;
      setFolders(updatedFolders);
      saveUserFolders(currentUid, updatedFolders);
    }

    // 2. Cập nhật Decks nếu có tạo mới
    let updatedDecks = decks;
    let savedNewDeck = newDeck;
    if (newDeck && !decks.some((d) => d.id === newDeck.id)) {
      savedNewDeck = {
        ...newDeck,
        authorUid: user?.uid,
        authorName: user?.displayName || user?.email?.split('@')[0] || 'Thành viên'
      };
      updatedDecks = [...decks, savedNewDeck];
      decksRef.current = updatedDecks;
      setDecks(updatedDecks);
      saveUserDecks(currentUid, updatedDecks);
    }

    // 3. Nạp danh sách thẻ mới vào allCards và lưu LocalStorage
    const updatedCards = [...allCards, ...newCards];
    cardsRef.current = updatedCards;
    setAllCards(updatedCards);
    saveUserCards(currentUid, updatedCards);

    const targetDeckName =
      newDeck?.name ||
      decks.find((d) => d.id === targetDeckId)?.name ||
      'Bộ thẻ';

    showSyncToast(
      `✓ Đã nhập thành công ${newCards.length} từ vào bộ thẻ "${targetDeckName}" (Lưu trên máy)!`,
      'success'
    );

    // 4. Đóng gói & đồng bộ 1 document bundle cho bộ thẻ tự tạo (1-2 writes cho cả bộ thay vì N writes)
    const deckObj = savedNewDeck || updatedDecks.find((d) => d.id === targetDeckId);
    if (deckObj && deckObj.origin === 'owned' && !deckObj.isDefault && user && isOnline) {
      schedulePrivateDeckBundleSync(deckObj.id);
    }

    // 5. Đồng bộ lại lên communityDecks nếu bộ thẻ đang ở chế độ Cộng đồng
    if (
      deckObj &&
      deckObj.origin !== 'community' &&
      deckObj.visibility === 'community' &&
      user
    ) {
      const folderObj = newFolder || folders.find((f) => f.id === deckObj.folderId);
      const allCardsForThisDeck = updatedCards.filter((c) => c.deckId === deckObj.id);
      deckPublishQueue.cancel(`deck:${deckObj.id}`);
      void publishDeckToCommunity(deckObj, folderObj, allCardsForThisDeck, user).catch(
        (err) => {
          console.warn('Lỗi auto sync community deck sau import:', err);
          showSyncToast(
            `Không thể cập nhật bộ thẻ cộng đồng: ${err?.message || err}`,
            'warning'
          );
        }
      );
    }
  };

  const handleUndoImportCards = (cardIds: string[]) => {
    const currentUid = user?.uid;
    const cardIdSet = new Set(cardIds);
    const affectedDeckIds = new Set(
      allCards
        .filter((c) => cardIdSet.has(c.id) && c.deckId)
        .map((c) => c.deckId as string)
    );
    const updatedCards = allCards.filter((c) => !cardIdSet.has(c.id));
    cardsRef.current = updatedCards;
    setAllCards(updatedCards);
    saveUserCards(currentUid, updatedCards);
    for (const deckId of affectedDeckIds) {
      schedulePrivateDeckBundleSync(deckId);
      scheduleDeckPublish(deckId);
    }
    showSyncToast(`✓ Đã hoàn tác lượt nhập (${cardIds.length} từ).`, 'info');
  };

  const handleAddCard = (
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
  ) => {
    const currentUid = user?.uid;
    const cardId = `c_word_manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const wordId = `w_manual_${Date.now()}`;

    const newCard: StudyCard = {
      id: cardId,
      type: 'word',
      refId: wordId,
      word: {
        id: wordId,
        surface: cardData.surface,
        readings: [cardData.reading],
        meaningVi: cardData.meaningVi,
        pos: cardData.pos || '名詞',
        hanVietBreakdown: cardData.hanViet ? cardData.hanViet.split(/\s+/).filter(Boolean) : [],
        kanji: cardData.surface.match(/[\u4E00-\u9FAF\u3400-\u4DBF]/g) || [],
        exampleJp: cardData.exampleJp,
        exampleVi: cardData.exampleVi,
        exampleIds: [],
        tags: ['custom']
      },
      deckId,
      fsrsCard: createNewCard(),
      isNew: true,
      isDue: false
    };

    const updated = [...allCards, newCard];
    cardsRef.current = updated;
    setAllCards(updated);
    saveUserCards(currentUid, updated);

    const deckName = decks.find((d) => d.id === deckId)?.name || 'Bộ thẻ';
    showSyncToast(`✓ Đã thêm từ "${cardData.surface}" vào bộ thẻ "${deckName}" (Lưu trên máy)!`, 'success');

    // Gom nhiều lần thêm thẻ liên tiếp thành 1 lần ghi deckBundle (debounce, tiết kiệm Firestore writes)
    schedulePrivateDeckBundleSync(deckId);
    scheduleDeckPublish(deckId);
  };

  const handleDeleteCard = (cardId: string, deckId: string) => {
    const currentUid = user?.uid;
    const updatedCards = allCards.filter((c) => c.id !== cardId);
    cardsRef.current = updatedCards;
    setAllCards(updatedCards);
    saveUserCards(currentUid, updatedCards);
    schedulePrivateDeckBundleSync(deckId);
    scheduleDeckPublish(deckId);
    showSyncToast('✓ Đã xoá từ khỏi bộ thẻ.', 'info');
  };

  const handleSavePhraseToDeck = (
    phrase: SavedPhraseCandidate,
    preferredDeckId?: string
  ): string | null => {
    const currentUid = user?.uid || auth.currentUser?.uid;
    let targetDeckId = preferredDeckId;
    let nextDecks = decks;

    if (!targetDeckId || !decks.some((d) => d.id === targetDeckId)) {
      const CONV_DECK_ID = 'deck_conversation_phrases';
      targetDeckId = CONV_DECK_ID;
      if (!decks.some((d) => d.id === CONV_DECK_ID)) {
        const now = new Date().toISOString();
        const convDeck: Deck = {
          id: CONV_DECK_ID,
          folderId: null,
          name: 'Cụm từ hội thoại & Đặt câu',
          description: 'Các cụm từ hay được lưu từ Đặt câu thông minh và Hội thoại nhập vai AI.',
          color: '#245C52',
          cardType: 'word',
          cardIds: [],
          newCardsPerDay: 20,
          maxReviewsPerDay: 50,
          isDefault: false,
          origin: 'owned',
          visibility: 'private',
          createdAt: now,
          updatedAt: now
        };
        nextDecks = [...decks, convDeck];
        decksRef.current = nextDecks;
        setDecks(nextDecks);
        saveUserDecks(currentUid, nextDecks);
      }
    }

    if (isDuplicatePhraseInDeck(phrase.surface, targetDeckId, allCards)) {
      showSyncToast(`"${phrase.surface}" đã có sẵn trong bộ thẻ rồi.`, 'info');
      return null;
    }

    const newCard = buildCustomStudyCardFromPhrase(phrase, targetDeckId);
    const updated = [...allCards, newCard];
    cardsRef.current = updated;
    setAllCards(updated);
    saveUserCards(currentUid, updated);

    const deckName = nextDecks.find((d) => d.id === targetDeckId)?.name || 'Bộ thẻ';
    showSyncToast(`✓ Đã lưu "${phrase.surface}" vào "${deckName}" để ôn FSRS!`, 'success');
    schedulePrivateDeckBundleSync(targetDeckId);
    scheduleDeckPublish(targetDeckId);
    return newCard.id;
  };

  const handleRecordPracticeTime = (seconds: number) => {
    const currentUid = user?.uid || auth.currentUser?.uid;
    setStudyStats((prev) => {
      const next = recordStudyActivity(prev, seconds);
      saveUserStudyStats(currentUid, next);
      return next;
    });
  };

  const handleMarkCardGoodFromPractice = (cardId: string) => {
    const target = allCards.find((c) => c.id === cardId);
    if (!target) return;
    const now = new Date();
    const graded = applyGrade(target.fsrsCard, Rating.Good, now);
    const nowIso = now.toISOString();
    const updatedCard: StudyCard = {
      ...target,
      fsrsCard: graded.card,
      isNew: false,
      isDue: false,
      firstLearnedAt: target.firstLearnedAt || nowIso,
      learnedAt: nowIso
    };
    handleRateCard(updatedCard, Rating.Good);
  };

  const handleNavigateToImport = (deckId: string, folderId?: string) => {
    setImportTargetDeckId(deckId);
    setImportTargetFolderId(folderId || '');
    setIsStudying(false);
    setActiveTab('study');
    setIsImportOpen(true);
  };

  const handleNavigateToStudy = (deckId: string) => {
    setIsImportOpen(false);
    const targetDeck = decks.find((d) => d.id === deckId);
    if (targetDeck) {
      handleSelectDeckToStudy(targetDeck);
    }
    setActiveTab('study');
  };

  const handleOpenExercises = (grammarId: string, level: JlptLevel) => {
    setExerciseTarget({ grammarId, level });
    setPracticeSection('exercises');
    setActiveTab('practice');
  };

  const handleOpenSentenceStudio = (grammar: Grammar) => {
    setSentenceTargetGrammar(grammar);
    setPracticeSection('output');
    setActiveTab('practice');
  };

  const handlePullFromFirestore = async () => {
    if (isSyncingRef.current) return;
    if (!user) {
      setPullResult('Bạn cần đăng nhập hoặc bấm Dùng thử ẩn danh trước khi đồng bộ.');
      return;
    }
    const currentUid = user.uid;
    isSyncingRef.current = true;
    setIsPulling(true);
    setPullResult(null);

    try {
      // Kiểm tra xem trên Cloud Firestore có dữ liệu không
      let cloudStatus;
      try {
        cloudStatus = await checkCloudDataStatus(currentUid);
      } catch (err: any) {
        setPullResult(`Không thể kiểm tra dữ liệu cloud: ${err?.message || err}`);
        return;
      }
      if (userRef.current?.uid !== currentUid) return;

      const localLearned = cardsRef.current.filter(
        (c) => (c.fsrsCard?.reps ?? 0) > 0 || Boolean(c.fsrsCard?.last_review) || !c.isNew
      ).length;

      if (!cloudStatus.hasCloudData && localLearned > 0) {
        setIsConflictModalOpen(true);
        return;
      }

      // Card documents contain the latest FSRS snapshot; review logs are only
      // scanned fully for legacy accounts that have no saved profile summary.
      const data = await pullDataFromFirestore(currentUid, {
        existingStats: statsRef.current,
        currentCards: cardsRef.current
      });
      if (userRef.current?.uid !== currentUid) return;

      const resolvedDecks = data.decks
        ? migrateDecks(
            data.decks.filter((deck) => deck.id !== 'deck_n3_grammar'),
            currentUid
          )
        : decksRef.current;

      const pulledBundles = await pullDeckBundlesForDecks(
        currentUid,
        resolvedDecks,
        data.legacyUpdatedCards || cardsRef.current
      );
      if (userRef.current?.uid !== currentUid) return;

      const cardCount = Object.keys(data.cards).length;
      const cardsWithCloudProgress = mergeFirestoreCardProgress(
        pulledBundles.cards,
        data.cards
      ).filter((card) => card.type !== 'grammar' && card.deckId !== 'deck_n3_grammar');
      if (cardCount > 0 || data.legacyUpdatedCards || pulledBundles.fetchedDeckCount > 0) {
        cardsRef.current = cardsWithCloudProgress;
        setAllCards(cardsWithCloudProgress);
        saveUserCards(currentUid, cardsWithCloudProgress);
      }

      if (data.folders) {
        const migratedFolders = migrateFolders(data.folders);
        foldersRef.current = migratedFolders;
        setFolders(migratedFolders);
        saveUserFolders(currentUid, migratedFolders);
      }

      if (data.decks) {
        decksRef.current = resolvedDecks;
        setDecks(resolvedDecks);
        saveUserDecks(currentUid, resolvedDecks);
      }

      setStudyStats(data.stats);
      saveUserStudyStats(currentUid, data.stats);
      if (data.statsNeedBackfill || !areStudyStatsEqual(data.stats, data.remoteStats)) {
        // Persist the compact summary so later pulls stay bounded and skip no-op writes.
        await syncUserStudyStats(currentUid, data.stats);
      }

      await syncPracticeHistoryWithCloud(currentUid);

      const todayDone = data.stats.todayStats.reviewedCount;
      const logScope = data.statsNeedBackfill ? 'lượt review cũ' : 'lượt review gần đây';
      setPullResult(
        `✓ Đã đồng bộ thành công! Đã cập nhật ${cardCount} trạng thái thẻ, xử lý ${data.reviewLogsProcessed} ${logScope}, tiến độ hôm nay (${todayDone} lượt ôn, chuỗi ${data.stats.streakDays} ngày) và ${data.decks?.length || 0} decks từ Firestore.`
      );
    } catch (err: any) {
      setPullResult(`❌ Lỗi khi tải dữ liệu: ${err.message || err}`);
    } finally {
      isSyncingRef.current = false;
      setIsPulling(false);
    }
  };

  const isFocusMode = activeTab === 'study' && isStudying;

  return (
    <div className={`raku-app-shell min-h-dvh flex flex-col ${darkMode ? 'dark' : ''}`}>
      {/* Desktop navigation (hidden in Focus Mode) */}
      {!isFocusMode && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-raku-line bg-raku-surface lg:flex">
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="raku-brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold">
              楽
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-raku-ink">Raku Nihongo</div>
              <div className="text-xs text-raku-muted">Tự học tiếng Nhật</div>
            </div>
          </div>

          <nav aria-label="Điều hướng chính" className="flex-1 space-y-1 px-3 py-2">
            {navigationItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => selectTab(id)}
                aria-current={activeTab === id ? 'page' : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'bg-raku-accent-soft font-semibold text-raku-accent'
                    : 'text-raku-muted hover:bg-raku-subtle hover:text-raku-ink'
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="border-t border-raku-line p-3">
            <button
              type="button"
              onClick={() => setIsAiQuizModalOpen(true)}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-xs font-medium text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
            >
              <Wand2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Tạo câu hỏi AI</span>
            </button>
          </div>
        </aside>
      )}

      <div className={`flex min-h-dvh min-w-0 flex-1 flex-col ${isFocusMode ? '' : 'lg:ml-56'}`}>
      {/* Top Header */}
      {isFocusMode ? (
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-raku-line bg-raku-surface/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <button
            type="button"
            onClick={() => {
              setStudySessionCards([]);
              setIsStudying(false);
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Thoát</span>
          </button>

          <span className="min-w-0 truncate text-sm font-semibold text-raku-ink">
            {activeStudyTarget?.title || 'Phiên ôn tập'}
          </span>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
            aria-label="Chuyển chế độ sáng/tối"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>
      ) : (
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-raku-line bg-raku-surface/95 px-4 py-2.5 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
            <div className="raku-brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-bold">
              楽
            </div>
            <h1 className="truncate text-base font-bold text-raku-ink">Raku Nihongo</h1>
          </div>

          <div className="hidden min-w-0 flex-1 text-sm font-semibold text-raku-ink lg:block">
            {isImportOpen && activeTab === 'study'
              ? 'Nhập từ vựng'
              : navigationItems.find((item) => item.id === activeTab)?.label}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* Minimal sync status indicator — opens Profile/Sync */}
            <button
              type="button"
              onClick={() => selectTab('profile')}
              role="status"
              aria-label={
                !isOnline
                  ? 'Đang ngoại tuyến'
                  : syncStatus === 'syncing'
                    ? 'Đang đồng bộ'
                    : pendingCount > 0
                      ? `${pendingCount} lượt ôn tập đang chờ đồng bộ`
                      : 'Đã đồng bộ'
              }
              title={
                !isOnline
                  ? 'Đang ngoại tuyến — dữ liệu lưu trên máy'
                  : syncStatus === 'syncing'
                    ? 'Đang đồng bộ lên đám mây...'
                    : pendingCount > 0
                      ? `${pendingCount} mục đang chờ sao lưu`
                      : 'Dữ liệu đã sao lưu'
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-medium text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
            >
              {syncStatus === 'syncing' ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-raku-accent" aria-hidden="true" />
              ) : (
                <span
                  className={`h-2 w-2 rounded-full ${
                    !isOnline || pendingCount > 0 ? 'bg-raku-hard' : 'bg-raku-accent'
                  }`}
                  aria-hidden="true"
                />
              )}
              <span className="hidden sm:inline tabular-nums">
                {!isOnline
                  ? 'Ngoại tuyến'
                  : syncStatus === 'syncing'
                    ? 'Đang đồng bộ'
                    : pendingCount > 0
                      ? `Chờ lưu (${pendingCount})`
                      : 'Đã lưu'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
              title={user ? (user.isAnonymous ? 'Khách ẩn danh' : user.email || 'Tài khoản') : 'Đăng nhập'}
              aria-label="Tài khoản"
            >
              <UserIcon className="h-[18px] w-[18px]" />
            </button>

            <button
              type="button"
              onClick={toggleDarkMode}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
              aria-label="Chuyển chế độ sáng/tối"
            >
              {darkMode ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </header>
      )}

      {/* Sync Toast Notification */}
      {syncToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-16 left-1/2 z-50 flex w-[92%] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-md animate-raku-enter sm:w-auto ${
            syncToast.type === 'success'
              ? 'border-raku-good/30 bg-raku-surface text-raku-ink'
              : syncToast.type === 'warning'
                ? 'border-raku-hard/30 bg-raku-surface text-raku-ink'
                : 'border-raku-line-strong bg-raku-surface text-raku-ink'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncToast.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-raku-good" />}
            {syncToast.type === 'warning' && <WifiOff className="h-4 w-4 shrink-0 text-raku-hard" />}
            {syncToast.type === 'info' && <Cloud className="h-4 w-4 shrink-0 text-raku-accent" />}
            <span>{syncToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-raku-muted hover:bg-raku-subtle hover:text-raku-ink"
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main
        className={`mx-auto w-full flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 ${
          isFocusMode
            ? 'max-w-2xl pb-10'
            : 'max-w-5xl pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:pb-12'
        }`}
      >
        {/* Unauthenticated banner (hidden during Focus Mode) */}
        {!user && !isFocusMode && (
          <div className="raku-card mb-6 flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-raku-ink">
                Lưu tiến độ học trên thiết bị hoặc đồng bộ đám mây
              </p>
              <p className="mt-0.5 text-xs text-raku-muted">
                Dùng thử ngay không cần tạo tài khoản, hoặc đăng nhập để đồng bộ giữa Web và Mobile.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void signInAnonymously(auth).catch((err) =>
                    showSyncToast(`Không thể đăng nhập ẩn danh: ${err?.message || err}`, 'warning')
                  );
                }}
                className="raku-btn-primary min-h-10 px-4 text-xs"
              >
                Dùng thử
              </button>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="raku-btn-secondary min-h-10 px-4 text-xs"
              >
                Đăng nhập
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: HỌC (Hôm nay + Bộ thẻ + Focus Mode + Nhập từ) */}
        {activeTab === 'study' && (
          <div className="space-y-6">
            {isImportOpen ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Quay lại bộ thẻ</span>
                </button>
                <ImportView
                  folders={folders}
                  decks={decks}
                  initialFolderId={importTargetFolderId}
                  initialDeckId={importTargetDeckId}
                  onImportCards={handleImportCards}
                  onUndoImportCards={handleUndoImportCards}
                  onNavigateToStudy={handleNavigateToStudy}
                />
              </div>
            ) : !isStudying && selectedDeckIdForDetail && decks.some((d) => d.id === selectedDeckIdForDetail) ? (
              (() => {
                const detailDeck = decks.find((d) => d.id === selectedDeckIdForDetail)!;
                const detailFolder = folders.find((f) => f.id === detailDeck.folderId);
                return (
                  <DeckDetailView
                    deck={detailDeck}
                    folder={detailFolder}
                    allCards={allCards}
                    onBack={() => setSelectedDeckIdForDetail(null)}
                    onStartStudy={(d) => {
                      setSelectedDeckIdForDetail(null);
                      handleSelectDeckToStudy(d);
                    }}
                    onSelectKanji={(char) => setSelectedKanjiChar(char)}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                    onNavigateToImport={(deckId, folderId) => {
                      setSelectedDeckIdForDetail(null);
                      handleNavigateToImport(deckId, folderId);
                    }}
                  />
                );
              })()
            ) : !isStudying ? (
              <div className="space-y-6">
                <TodayStatsBar
                  stats={studyStats}
                  totalDueToday={totalDueToday}
                  totalNewToday={totalNewToday}
                  newItemsLearnedToday={newWordsToday}
                  newWordGoal={dailyNewWordGoal}
                  currentStreak={streak.currentStreak}
                  longestStreak={streak.longestStreak}
                  onQuickStudy={handleQuickStudyToday}
                  onStudyMoreNew={handleQuickStudyMoreNew}
                />

                <DeckFolderView
                  folders={folders}
                  decks={decks}
                  cards={allCards}
                  currentUid={user?.uid}
                  onSelectDeckToStudy={handleSelectDeckToStudy}
                  onOpenDeckDetail={(deck) => setSelectedDeckIdForDetail(deck.id)}
                  onSelectFolderToStudy={handleSelectFolderToStudy}
                  onCreateFolder={handleCreateFolder}
                  onCreateDeck={handleCreateDeck}
                  onDeleteDeck={handleDeleteDeck}
                  onDeleteFolder={handleDeleteFolder}
                  onToggleDeckVisibility={handleToggleDeckVisibility}
                  onAddCard={handleAddCard}
                  onNavigateToImport={handleNavigateToImport}
                  onOpenImport={() => {
                    setImportTargetDeckId('');
                    setImportTargetFolderId('');
                    setIsImportOpen(true);
                  }}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {studySessionCards.length === 0 ? (
                  <div className="raku-card mx-auto max-w-md space-y-4 p-8 text-center animate-raku-enter">
                    <div className="raku-hanko-seal mx-auto h-14 w-14 text-2xl" aria-hidden="true">
                      済
                    </div>
                    <h3 className="text-lg font-bold text-raku-ink">
                      Đã xong thẻ hôm nay
                    </h3>
                    <p className="text-sm leading-relaxed text-raku-muted">
                      Không còn thẻ đến hạn trong bộ này. Bạn có thể quay lại hoặc mở thêm từ mới.
                    </p>
                    <div className="flex flex-col items-center justify-center gap-2.5 pt-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => {
                          setStudySessionCards([]);
                          setIsStudying(false);
                        }}
                        className="raku-btn-secondary w-full sm:w-auto"
                      >
                        Về danh sách
                      </button>
                      <button
                        type="button"
                        onClick={handleLoadMoreNewCards}
                        className="raku-btn-primary w-full sm:w-auto"
                      >
                        Học thêm 20 từ mới
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

        {/* TAB 2: KHO HỌC (Kanji | Ngữ pháp) */}
        {activeTab === 'library' && (
          <div className="space-y-5">
            <div
              role="tablist"
              aria-label="Phân mục Kho học"
              className="inline-flex rounded-xl border border-raku-line bg-raku-subtle p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={librarySection === 'kanji'}
                onClick={() => setLibrarySection('kanji')}
                className={`min-h-9 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  librarySection === 'kanji'
                    ? 'bg-raku-surface text-raku-ink shadow-xs'
                    : 'text-raku-muted hover:text-raku-ink'
                }`}
              >
                Kanji ({SEED_KANJI.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={librarySection === 'grammar'}
                onClick={() => setLibrarySection('grammar')}
                className={`min-h-9 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  librarySection === 'grammar'
                    ? 'bg-raku-surface text-raku-ink shadow-xs'
                    : 'text-raku-muted hover:text-raku-ink'
                }`}
              >
                Ngữ pháp JLPT
              </button>
            </div>

            {librarySection === 'kanji' ? (
              <div className="space-y-4">
                <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-lg font-bold text-raku-ink">
                      Tra cứu Kanji
                    </h2>
                    <p className="text-xs text-raku-muted">
                      Chạm vào từng chữ để xem Hán Việt, cách đọc, chữ dễ nhầm và từ ghép.
                    </p>
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-raku-muted" />
                    <input
                      type="text"
                      value={kanjiSearch}
                      onChange={(e) => setKanjiSearch(e.target.value)}
                      placeholder="Tìm Kanji, Hán Việt, nghĩa..."
                      className="w-full rounded-xl border border-raku-line-strong bg-raku-surface py-2 pl-9 pr-3 text-sm text-raku-ink placeholder:text-raku-muted focus:border-raku-accent focus:outline-none sm:w-64"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                  {filteredKanji.map((k) => (
                    <button
                      key={k.char}
                      type="button"
                      onClick={() => setSelectedKanjiChar(k.char)}
                      className="flex flex-col items-center justify-center rounded-xl border border-raku-line bg-raku-surface p-3 text-center transition-colors hover:border-raku-accent touch-target"
                    >
                      <span className="font-jp text-2xl font-bold text-raku-ink">
                        {k.char}
                      </span>
                      <span className="mt-1 text-xs font-semibold text-raku-accent">
                        {k.hanViet[0] || ''}
                      </span>
                      <span className="max-w-full truncate text-[11px] text-raku-muted">
                        {k.meaningVi}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <GrammarPracticeView
                user={user}
                onNotify={showSyncToast}
                onOpenExercises={handleOpenExercises}
                onOpenSentenceStudio={handleOpenSentenceStudio}
              />
            )}
          </div>
        )}

        {/* TAB 3: LUYỆN TẬP (Bài tập ngữ pháp | Hội thoại & Đặt câu | Đấu trường) */}
        {activeTab === 'practice' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Phân mục Luyện tập"
                className="inline-flex flex-wrap rounded-xl border border-raku-line bg-raku-subtle p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={practiceSection === 'exercises'}
                  onClick={() => selectPracticeSection('exercises')}
                  className={`min-h-9 rounded-lg px-3.5 text-sm font-semibold transition-colors ${
                    practiceSection === 'exercises'
                      ? 'bg-raku-surface text-raku-ink shadow-xs'
                      : 'text-raku-muted hover:text-raku-ink'
                  }`}
                >
                  Bài tập ngữ pháp
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={practiceSection === 'output'}
                  onClick={() => selectPracticeSection('output')}
                  className={`min-h-9 rounded-lg px-3.5 text-sm font-semibold transition-colors ${
                    practiceSection === 'output'
                      ? 'bg-raku-surface text-raku-ink shadow-xs'
                      : 'text-raku-muted hover:text-raku-ink'
                  }`}
                >
                  Hội thoại & Đặt câu
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={practiceSection === 'arena'}
                  onClick={() => selectPracticeSection('arena')}
                  className={`min-h-9 rounded-lg px-3.5 text-sm font-semibold transition-colors ${
                    practiceSection === 'arena'
                      ? 'bg-raku-surface text-raku-ink shadow-xs'
                      : 'text-raku-muted hover:text-raku-ink'
                  }`}
                >
                  Đấu trường
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsAiQuizModalOpen(true)}
                className="raku-btn-secondary min-h-9 px-3 text-xs lg:hidden"
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Tạo câu hỏi AI</span>
              </button>
            </div>

            {practiceSection === 'exercises' && (
              <GrammarExerciseView
                user={user}
                onNotify={showSyncToast}
                initialTarget={exerciseTarget}
              />
            )}

            {practiceSection === 'output' && (
              <Suspense
                fallback={
                  <div
                    className="raku-card px-4 py-6 text-center text-sm text-raku-muted"
                    role="status"
                  >
                    Đang mở phòng luyện Hội thoại & Đặt câu…
                  </div>
                }
              >
                <OutputPracticeHub
                  user={user}
                  cards={allCards}
                  decks={decks}
                  initialGrammar={sentenceTargetGrammar}
                  onSelectKanji={(char) => setSelectedKanjiChar(char)}
                  onSavePhraseToDeck={handleSavePhraseToDeck}
                  onRecordPracticeTime={handleRecordPracticeTime}
                  onMarkCardGood={handleMarkCardGoodFromPractice}
                  onNotify={showSyncToast}
                />
              </Suspense>
            )}
          </div>
        )}

        {hasVisitedArena && (
          <Suspense
            fallback={
              <div
                className="raku-card px-4 py-6 text-center text-sm text-raku-muted"
                role="status"
              >
                Đang mở Đấu trường…
              </div>
            }
          >
            <div
              className={
                activeTab === 'practice' && practiceSection === 'arena' ? 'mt-5 block' : 'hidden'
              }
            >
              <ArenaView cards={allCards} decks={decks} />
            </div>
          </Suspense>
        )}

        {/* TAB 4: HỒ SƠ & CÀI ĐẶT */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-raku-ink sm:text-2xl">
                Hồ sơ & Cài đặt
              </h2>
              <p className="mt-1 text-sm text-raku-muted">
                Theo dõi chuỗi học, mục tiêu hàng ngày và sao lưu dữ liệu.
              </p>
            </div>

            <StudyHeatmap
              counts={dailyNewWords}
              goal={dailyNewWordGoal}
              currentStreak={streak.currentStreak}
              longestStreak={streak.longestStreak}
            />

            <section aria-labelledby="study-goal-title" className="raku-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 id="study-goal-title" className="text-base font-bold text-raku-ink">
                    Mục tiêu từ mới mỗi ngày
                  </h3>
                  <p className="mt-0.5 text-xs text-raku-muted">
                    Đạt đủ số từ mới trong ngày sẽ được tính một ngày giữ chuỗi.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DAILY_NEW_WORD_GOAL_OPTIONS.map((goal) => (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => handleDailyNewWordGoalChange(goal)}
                      className={`min-h-10 rounded-xl border px-3.5 text-xs font-semibold tabular-nums transition-colors ${
                        dailyNewWordGoal === goal
                          ? 'border-raku-accent bg-raku-accent-soft text-raku-accent'
                          : 'border-raku-line bg-raku-canvas text-raku-muted hover:text-raku-ink'
                      }`}
                    >
                      {goal} từ/ngày
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.85fr)]">
              {/* Sync and recovery */}
              <section aria-labelledby="sync-settings-title" className="raku-card overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-raku-line p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 id="sync-settings-title" className="text-base font-bold text-raku-ink">
                      Đồng bộ và khôi phục
                    </h3>
                    <p className="mt-0.5 text-xs text-raku-muted">
                      Tiến độ luôn được lưu ngoại tuyến trước; bạn chủ động đồng bộ khi cần.
                    </p>
                  </div>

                  <span
                    role="status"
                    aria-live="polite"
                    className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 self-start rounded-full px-3 text-xs font-semibold sm:self-auto ${
                      !isOnline || pendingCount > 0
                        ? 'bg-raku-hard-soft text-raku-hard'
                        : 'bg-raku-accent-soft text-raku-accent'
                    }`}
                  >
                    {!isOnline ? (
                      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : syncStatus === 'syncing' ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : pendingCount > 0 ? (
                      <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {!isOnline
                      ? 'Ngoại tuyến'
                      : syncStatus === 'syncing'
                        ? 'Đang đồng bộ'
                        : pendingCount > 0
                          ? `${pendingCount} mục chờ`
                          : 'Đã sao lưu'}
                  </span>
                </div>

                <dl className="grid grid-cols-1 divide-y divide-raku-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <div className="px-4 py-3.5 sm:p-4">
                    <dt className="text-sm text-raku-muted">Kết nối</dt>
                    <dd className="mt-1 flex items-center gap-2 text-sm font-semibold text-raku-ink">
                      {isOnline ? <Wifi className="h-4 w-4 text-raku-accent" aria-hidden="true" /> : <WifiOff className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />}
                      {isOnline ? 'Có Internet' : 'Ngoại tuyến'}
                    </dd>
                  </div>
                  <div className="px-4 py-3.5 sm:p-4">
                    <dt className="text-sm text-raku-muted">Chờ sao lưu</dt>
                    <dd className={`mt-1 text-sm font-semibold ${pendingCount > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-raku-ink'}`}>
                      {pendingCount > 0 ? `${pendingCount} lượt ôn tập` : 'Không có mục chờ'}
                    </dd>
                  </div>
                  <div className="min-w-0 px-4 py-3.5 sm:p-4">
                    <dt className="text-sm text-raku-muted">Tài khoản</dt>
                    <dd className="mt-1 truncate text-sm font-semibold text-raku-ink" title={user?.email || undefined}>
                      {user ? (user.isAnonymous ? 'Khách ẩn danh' : user.email || 'Đã đăng nhập') : 'Chưa đăng nhập'}
                    </dd>
                  </div>
                </dl>

                <div className="space-y-4 p-4 sm:p-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      onClick={handleManualSync}
                      disabled={syncStatus === 'syncing' || !isOnline}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-raku-accent px-4 text-sm font-semibold text-raku-on-accent transition-colors hover:bg-raku-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raku-signal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} aria-hidden="true" />
                      {syncStatus === 'syncing' ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
                    </button>

                    <button
                      onClick={handlePullFromFirestore}
                      disabled={isPulling || !isOnline}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-raku-line bg-raku-subtle px-4 text-sm font-semibold text-raku-ink transition-colors hover:bg-raku-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raku-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className={`h-4 w-4 ${isPulling ? 'animate-pulse' : ''}`} aria-hidden="true" />
                      {isPulling ? 'Đang tải dữ liệu…' : 'Khôi phục về máy'}
                    </button>
                  </div>

                  {pullResult && (
                    <div
                      role="status"
                      className={`rounded-xl border px-3.5 py-3 text-sm leading-5 ${pullResult.startsWith('✓') ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200'}`}
                    >
                      {pullResult}
                    </div>
                  )}

                  {/* KHI CẦN BẬT LẠI MẬT KHẨU BẢO VỆ GHI FIRESTORE: Uncomment khối bên dưới
                  <details className="group border-t border-raku-line pt-3" open={!isAuthorizedForSync}>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-semibold text-raku-muted hover:text-raku-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raku-accent">
                      <span className="flex min-w-0 items-center gap-2">
                        <Lock className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
                        <span className="truncate">Bảo vệ ghi Firestore &amp; Hạn ngạch (Mật khẩu)</span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>

                    <div className="space-y-3 pb-1 pt-2">
                      <p className="text-sm leading-6 text-raku-muted">
                        Mọi từ vựng mới thêm và tiến độ học luôn được lưu tại máy (Local-first) hoàn toàn miễn phí. Để hạn chế số lượt ghi (writes quota) và tránh cạn kiệt tài nguyên Firestore, thao tác tải lên đám mây yêu cầu mật khẩu xác thực do chủ sở hữu cung cấp.
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-200 dark:border-slate-700 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${isAuthorizedForSync ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            Trạng thái:{' '}
                            {isAuthorizedForSync
                              ? 'Đã xác thực quyền ghi trên thiết bị này'
                              : 'Đang khóa bảo vệ (Cần mật khẩu khi ghi)'}
                          </span>
                        </div>

                        {isAuthorizedForSync ? (
                          <button
                            onClick={() => {
                              revokeSyncAuthorization();
                              setSyncAuthUpdated((v) => v + 1);
                              showSyncToast('🔒 Đã khóa lại quyền ghi Firestore trên thiết bị này.', 'info');
                            }}
                            className="px-3 py-1 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 text-amber-800 dark:text-amber-200 rounded-lg font-medium transition cursor-pointer"
                          >
                            Khóa lại
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSyncPasswordActionTitle('Xác thực quyền tải lên Cloud Firestore');
                              setPendingSyncAction(() => () => {
                                showSyncToast('🔓 Đã xác thực mật khẩu tải lên thành công!', 'success');
                              });
                              setIsSyncPasswordModalOpen(true);
                            }}
                            className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition cursor-pointer"
                          >
                            Nhập mật khẩu xác thực
                          </button>
                        )}
                      </div>
                    </div>
                  </details>
                  */}

                  <details className="group border-t border-raku-line pt-3">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-semibold text-raku-muted hover:text-raku-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raku-accent">
                      Cách lưu và đồng bộ dữ liệu
                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="space-y-2 pb-1 pt-2 text-sm leading-6 text-raku-muted">
                      <p>Tiến độ học và từ vựng được lưu ngay trên thiết bị, kể cả khi không có Internet.</p>
                      <p><strong className="font-semibold text-raku-ink">Đồng bộ ngay</strong> sao lưu dữ liệu lên đám mây. Trên thiết bị mới, dùng <strong className="font-semibold text-raku-ink">Khôi phục về máy</strong> để tải tiến độ xuống.</p>
                    </div>
                  </details>

                  <details className="group border-t border-raku-line pt-3">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-semibold text-raku-muted hover:text-raku-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raku-accent">
                      <span className="flex min-w-0 items-center gap-2">
                        <CloudUpload className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">Kho dữ liệu N3 · 2.369 bản ghi</span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>

                    <div className="space-y-3 pb-1 pt-2">
                      <p className="text-sm leading-6 text-raku-muted">
                        Kho gồm 609 Kanji, 880 từ vựng Mimikara và 880 câu ví dụ. Ngữ pháp được import riêng trong Quản trị ngữ pháp.
                      </p>
                      <button
                        onClick={handleSeedAllN3}
                        disabled={isSeeding}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950"
                      >
                        <CloudUpload className="h-4 w-4" aria-hidden="true" />
                        {isSeeding ? 'Đang nạp dữ liệu…' : 'Nạp lại dữ liệu N3'}
                      </button>

                      {isSeeding && seedProgress && (
                        <div className="space-y-2 pt-1" role="status" aria-live="polite">
                          <div className="flex justify-between gap-3 text-sm font-medium text-raku-muted">
                            <span className="truncate">Đang nạp: {seedProgress.stage}</span>
                            <span className="shrink-0">{seedProgress.current} / {seedProgress.total}</span>
                          </div>
                          <div
                            className="h-2 w-full overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={seedProgress.total}
                            aria-valuenow={seedProgress.current}
                            aria-label="Tiến độ nạp dữ liệu N3"
                          >
                            <div className="h-full bg-amber-600 transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${(seedProgress.current / seedProgress.total) * 100}%` }} />
                          </div>
                        </div>
                      )}

                      {seedResult && (
                        <div role="status" className={`rounded-xl border px-3.5 py-3 text-sm leading-5 ${seedResult.startsWith('✓') ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200'}`}>
                          {seedResult}
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </section>

              <div className="space-y-5">
                <section aria-labelledby="install-title" className="rounded-2xl border border-raku-line bg-raku-surface p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-raku-accent-soft text-raku-accent">
                      <Download className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 id="install-title" className="text-base font-bold text-raku-ink">Cài ứng dụng</h3>
                      <p className="mt-1 text-sm leading-5 text-raku-muted">
                        Mở Raku Nihongo toàn màn hình và truy cập nhanh từ màn hình chính.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    {isAppInstalled ? (
                      <div className="flex min-h-11 items-center gap-2 text-sm font-semibold text-raku-accent">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Đã cài trên thiết bị này
                      </div>
                    ) : (
                      <button
                        onClick={handleInstallApp}
                        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-raku-accent px-4 text-sm font-semibold text-raku-on-accent transition-colors hover:bg-raku-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raku-signal focus-visible:ring-offset-2"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" /> Cài ứng dụng
                      </button>
                    )}
                    {showInstallHelp && !isAppInstalled && (
                      <p className="mt-3 rounded-xl bg-raku-subtle px-3.5 py-3 text-sm leading-6 text-raku-muted">
                        Trong Chrome, mở menu ⋮ rồi chọn <strong className="font-semibold text-raku-ink">Cài đặt ứng dụng</strong> hoặc <strong className="font-semibold text-raku-ink">Thêm vào màn hình chính</strong>. Trang cần được mở bằng HTTPS.
                      </p>
                    )}
                  </div>
                </section>

                <section aria-labelledby="app-details-title" className="overflow-hidden rounded-2xl border border-raku-line bg-raku-surface">
                  <div className="border-b border-raku-line px-4 py-3.5 sm:px-5">
                    <h3 id="app-details-title" className="text-base font-bold text-raku-ink">Thông tin ứng dụng</h3>
                  </div>
                  <div className="divide-y divide-raku-line px-4 sm:px-5">
                    <div className="flex items-center justify-between gap-4 py-3.5">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-raku-ink">Nguồn dữ liệu và giấy phép</div>
                        <div className="mt-0.5 text-sm leading-5 text-raku-muted">KANJIDIC2, JMdict, Hán–Việt, Mimikara N3</div>
                      </div>
                      <button
                        onClick={() => setIsLicenseOpen(true)}
                        className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-raku-accent transition-colors hover:bg-raku-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raku-accent"
                      >
                        Xem
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3.5">
                      <div>
                        <div className="text-sm font-semibold text-raku-ink">Lịch ôn tập</div>
                        <div className="mt-0.5 text-sm text-raku-muted">Điều chỉnh theo tiến độ ghi nhớ</div>
                      </div>
                      <span className="shrink-0 rounded-full bg-raku-accent-soft px-2.5 py-1 text-sm font-semibold text-raku-accent">FSRS v4</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3.5">
                      <div>
                        <div className="text-sm font-semibold text-raku-ink">Lưu ngoại tuyến</div>
                        <div className="mt-0.5 text-sm text-raku-muted">IndexedDB · hỗ trợ nhiều tab</div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-raku-accent">Đang bật</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <GrammarAdminPanel user={user} onNotify={showSyncToast} />
          </div>
        )}
      </main>
      </div>

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
        onSignOut={handleSignOut}
      />

      {/* Cloud Conflict & Empty Cloud Resolution Modal (Anki-style) */}
      <CloudConflictModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        onUploadToCloud={handleUploadToCloud}
        onResetToCloud={handleResetToCloud}
        localReviewedCount={
          allCards.filter(
            (c) => (c.fsrsCard?.reps ?? 0) > 0 || Boolean(c.fsrsCard?.last_review) || !c.isNew
          ).length
        }
        pendingQueueCount={getPendingSyncCount(user?.uid)}
      />

      {/* AI Quiz Generator Modal */}
      <AiQuizGeneratorModal
        isOpen={isAiQuizModalOpen}
        onClose={() => setIsAiQuizModalOpen(false)}
      />

      {/* KHI CẦN BẬT LẠI MẬT KHẨU BẢO VỆ GHI FIRESTORE: Uncomment khối bên dưới
      <SyncPasswordModal
        isOpen={isSyncPasswordModalOpen}
        actionTitle={syncPasswordActionTitle}
        onSuccess={() => {
          setIsSyncPasswordModalOpen(false);
          setSyncAuthUpdated((v) => v + 1);
          if (pendingSyncAction) {
            const act = pendingSyncAction;
            setPendingSyncAction(null);
            act();
          }
        }}
        onClose={() => {
          setIsSyncPasswordModalOpen(false);
          setPendingSyncAction(null);
        }}
      />
      */}

      {/* Mobile bottom navigation — 4 crisp tabs, hidden during Focus Mode */}
      {!isFocusMode && (
        <nav
          aria-label="Thanh điều hướng chính"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-raku-line bg-raku-surface/95 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] backdrop-blur-sm lg:hidden"
        >
          <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
            {navigationItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => selectTab(id)}
                aria-current={activeTab === id ? 'page' : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-colors ${
                  activeTab === id
                    ? 'bg-raku-accent-soft font-semibold text-raku-accent'
                    : 'text-raku-muted hover:text-raku-ink'
                }`}
              >
                <Icon className="h-[19px] w-[19px] shrink-0" />
                <span className="truncate text-[11px] leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
