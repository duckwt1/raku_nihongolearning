import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  ChevronDown,
  Download
  // Lock // Khi cần bật lại mật khẩu Firestore: uncomment Lock
} from 'lucide-react';
import {
  SEED_KANJI,
  buildReviewQueue,
  createNewCard,
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
  isCardLearnedToday,
  countNewItemsLearnedToday,
  canDeleteDeck
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
  clearOfflineReviewQueue,
  clearUserDataFromBrowser
} from './services/firestoreSync';
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
import { AiQuizGeneratorModal } from './components/AiQuizGeneratorModal';
import { AuthModal } from './components/AuthModal';
import { KanjiModal } from './components/KanjiModal';
import { TodayStatsBar } from './components/TodayStatsBar';
import { DeckFolderView } from './components/DeckFolderView';
import { CloudConflictModal } from './components/CloudConflictModal';

type AppTab = 'study' | 'kanji' | 'grammar' | 'import' | 'settings';

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

  // Khi cần bật lại kiểm tra mật khẩu Firestore:
  // const [isSyncPasswordModalOpen, setIsSyncPasswordModalOpen] = useState(false);
  // const [syncPasswordActionTitle, setSyncPasswordActionTitle] = useState('Tải dữ liệu lên Cloud Firestore');
  // const [pendingSyncAction, setPendingSyncAction] = useState<(() => void) | null>(null);
  // const [syncAuthUpdated, setSyncAuthUpdated] = useState(0);
  // const isAuthorizedForSync = useMemo(() => isSyncAuthorized(), [syncAuthUpdated]);

  const showSyncToast = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    setSyncToast({ message, type });
    setTimeout(() => {
      setSyncToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [activeTab, setActiveTab] = useState<AppTab>('study');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  );
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  const navigationItems = [
    { id: 'study' as const, label: 'Ôn từ', icon: BookOpen },
    { id: 'kanji' as const, label: 'Kanji', icon: Layers },
    { id: 'grammar' as const, label: 'Ngữ pháp', icon: Sparkles },
    { id: 'import' as const, label: 'Nhập từ', icon: FileUp },
    { id: 'settings' as const, label: 'Cài đặt', icon: Settings }
  ];

  const handleInstallApp = async () => {
    if (isAppInstalled) return;
    if (!installPrompt) {
      setShowInstallHelp(true);
      setActiveTab('settings');
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
    setActiveTab(tab);
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
      // Huỷ các publish đang chờ của phiên trước trước khi đổi dữ liệu
      deckPublishQueue.cancelAll();
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

        if (res.newDecksCount > 0 || res.newCardsCount > 0) {
          setDecks(res.updatedDecks);
          setFolders(res.updatedFolders);
          setAllCards(res.updatedCards);
          saveUserDecks(currentUid, res.updatedDecks);
          saveUserFolders(currentUid, res.updatedFolders);
          saveUserCards(currentUid, res.updatedCards);
          showSyncToast(
            `🌐 Đã tự động cập nhật ${res.newDecksCount} bộ thẻ cộng đồng (${res.newCardsCount} từ vựng mới)!`,
            'info'
          );
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
  const { totalDueToday, totalNewToday, newItemsLearnedToday } = useMemo(() => {
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
      totalNewToday: Math.min(nw, remainingDailyNew),
      newItemsLearnedToday: countNewItemsLearnedToday(allCards, todayStr)
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
    setDecks(updatedDecks);
    saveUserDecks(user?.uid, updatedDecks);
    setAllCards(updatedCards);
    saveUserCards(user?.uid, updatedCards);

    if (shouldUnpublish) {
      void unpublishDeckFromCommunity(deck.communityDocId || deck.id)
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

    const prefs = loadDeckSyncPrefs(user.uid);

    if (deck.visibility === 'community') {
      cancelDeckPublish(deckId);
      applyDeckPatch(deckId, { visibility: 'private' });
      void unpublishDeckFromCommunity(deck.communityDocId || deck.id)
        .then(() => showSyncToast(`✓ Đã gỡ "${deck.name}" khỏi cộng đồng.`, 'info'))
        .catch((err) => {
          applyDeckPatch(deckId, { visibility: 'community' });
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
    saveDeckSyncPrefs(user.uid, {
      ...prefs,
      hiddenDeckIds: prefs.hiddenDeckIds.filter(
        (id) => id !== deck.id && id !== (deck.communityDocId || deck.id)
      )
    });
    applyDeckPatch(deckId, { visibility: 'community' });

    void publishDeckToCommunity(
      { ...deck, visibility: 'community' },
      folder,
      cardsInDeck,
      user
    )
      .then((res) =>
        applyDeckPatch(deckId, {
          visibility: 'community',
          communityDocId: res.docId
        })
      )
      .then(() =>
        showSyncToast(
          `✓ Đã chia sẻ "${deck.name}" (${cardsInDeck.length} từ) lên cộng đồng.`,
          'success'
        )
      )
      .catch((err) => {
        applyDeckPatch(deckId, { visibility: 'private' });
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
    const currentUid = user?.uid || auth.currentUser?.uid;
    if (!currentUid) return;
    setSyncStatus('syncing');
    showSyncToast('☁️ Đang đẩy toàn bộ dữ liệu trên máy lên Cloud Firestore...', 'info');
    try {
      const res = await uploadEntireLocalStateToFirestore(
        currentUid,
        allCards,
        folders,
        decks,
        studyStats
      );
      setPendingCount(0);
      showSyncToast(
        `✓ Đã tải thành công ${res.cardsSynced} thẻ học lên Cloud Firestore!`,
        'success'
      );
    } catch (err: any) {
      showSyncToast(`❌ Tải lên đám mây thất bại: ${err?.message || err}`, 'warning');
    } finally {
      setSyncStatus('synced');
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
    let syncStage = 'đẩy hàng đợi review offline';

    // Kiểm tra xem trên Cloud Firestore có dữ liệu không
    let cloudStatus;
    try {
      cloudStatus = await checkCloudDataStatus(currentUid);
    } catch (err: any) {
      setSyncStatus('synced');
      showSyncToast(`Không thể kiểm tra dữ liệu cloud: ${err?.message || err}`, 'warning');
      return;
    }
    const localLearned = allCards.filter(
      (c) => (c.fsrsCard?.reps ?? 0) > 0 || Boolean(c.fsrsCard?.last_review) || !c.isNew
    ).length;
    const pendingQ = getPendingSyncCount(currentUid);

    // Giống Anki: Nếu Cloud trống hoàn toàn (hoặc vừa bị xóa trên Firebase),
    // nhưng trên máy người dùng đã có tiến độ -> Mở hộp thoại giải quyết xung đột!
    if (!cloudStatus.hasCloudData && (localLearned > 0 || pendingQ > 0)) {
      setSyncStatus('synced');
      setIsConflictModalOpen(true);
      return;
    }

    showSyncToast('☁️ Đang đồng bộ dữ liệu lên đám mây...', 'info');

    try {
      // Giới hạn thời gian tối đa 45s cho mạng di động
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Hết thời gian chờ kết nối máy chủ (45s). Vui lòng thử lại.')),
          45000
        )
      );

      const doSync = async () => {
        // 1. Đẩy offline queue trước
        syncStage = 'đẩy hàng đợi review offline';
        const flushed = await flushOfflineQueue(currentUid);

        // 2. Read latest card snapshots and compact stats. Recent review logs only
        // reconcile activity not yet reflected in the saved stats summary.
        syncStage = 'đọc hồ sơ, thẻ, thư mục, decks và review logs';
        const remoteProgress = await pullDataFromFirestore(currentUid, {
          existingStats: studyStats,
          currentCards: allCards,
          includeStructure: false
        });
        const mergedCards = mergeFirestoreCardProgress(
          remoteProgress.legacyUpdatedCards || allCards,
          remoteProgress.cards
        );
        if (Object.keys(remoteProgress.cards).length > 0 || remoteProgress.legacyUpdatedCards) {
          setAllCards(mergedCards);
          saveUserCards(currentUid, mergedCards);
        }
        const mergedStats = remoteProgress.stats || studyStats;
        setStudyStats(mergedStats);
        saveUserStudyStats(currentUid, mergedStats);

        // 3. Skip unchanged structure/stats so repeated manual syncs do not issue no-op writes.
        if (remoteProgress.structureFingerprint !== folderDeckFingerprint(folders, decks)) {
          syncStage = 'ghi thư mục và decks';
          await syncFoldersAndDecks(currentUid, folders, decks);
        }
        if (!areStudyStatsEqual(mergedStats, remoteProgress.remoteStats)) {
          syncStage = 'ghi thống kê học tập';
          await syncUserStudyStats(currentUid, mergedStats);
        }

        return flushed;
      };

      const flushed = await Promise.race([doSync(), timeoutPromise]);
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
      setPendingCount(getPendingSyncCount(currentUid));
      setSyncStatus('synced');
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
        `✓ Đã xuất thành công: ${res.kanjiCount} Kanji, ${res.wordsCount} Từ vựng, ${res.grammarCount} Ngữ pháp, ${res.sentencesCount} Câu ví dụ lên Cloud Firestore!`
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
    // requireSyncPassword('Nạp lại 2.466 bản ghi dữ liệu N3 lên Cloud Firestore', () => {
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
      setDecks(updatedDecks);
      saveUserDecks(currentUid, updatedDecks);
    }

    // 3. Nạp danh sách thẻ mới vào allCards và lưu LocalStorage
    const updatedCards = [...allCards, ...newCards];
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

    // 4. Chỉ đồng bộ lại lên Cloud nếu bộ thẻ đang ở chế độ Cộng đồng
    const deckObj = savedNewDeck || decks.find((d) => d.id === targetDeckId);
    if (
      deckObj &&
      deckObj.origin !== 'community' &&
      deckObj.visibility === 'community' &&
      user
    ) {
      const folderObj = newFolder || folders.find((f) => f.id === deckObj.folderId);
      const allCardsForThisDeck = updatedCards.filter((c) => c.deckId === deckObj.id);
      cancelDeckPublish(deckObj.id);
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
    const updatedCards = allCards.filter((c) => !cardIdSet.has(c.id));
    setAllCards(updatedCards);
    saveUserCards(currentUid, updatedCards);
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
    setAllCards(updated);
    saveUserCards(currentUid, updated);

    const deckName = decks.find((d) => d.id === deckId)?.name || 'Bộ thẻ';
    showSyncToast(`✓ Đã thêm từ "${cardData.surface}" vào bộ thẻ "${deckName}" (Lưu trên máy)!`, 'success');

    // Gom nhiều lần thêm thẻ liên tiếp thành 1 lần ghi Firestore (debounce)
    scheduleDeckPublish(deckId);
  };

  const handleNavigateToImport = (deckId: string, folderId?: string) => {
    setImportTargetDeckId(deckId);
    if (folderId) setImportTargetFolderId(folderId);
    setActiveTab('import');
  };

  const handleNavigateToStudy = (deckId: string) => {
    const targetDeck = decks.find((d) => d.id === deckId);
    if (targetDeck) {
      handleSelectDeckToStudy(targetDeck);
    }
    setActiveTab('study');
  };

  const handlePullFromFirestore = async () => {
    if (!user) {
      setPullResult('Bạn cần đăng nhập hoặc bấm Dùng thử ẩn danh trước khi đồng bộ.');
      return;
    }
    const currentUid = user.uid;

    // Kiểm tra xem trên Cloud Firestore có dữ liệu không
    let cloudStatus;
    try {
      cloudStatus = await checkCloudDataStatus(currentUid);
    } catch (err: any) {
      setPullResult(`Không thể kiểm tra dữ liệu cloud: ${err?.message || err}`);
      return;
    }
    const localLearned = allCards.filter(
      (c) => (c.fsrsCard?.reps ?? 0) > 0 || Boolean(c.fsrsCard?.last_review) || !c.isNew
    ).length;

    if (!cloudStatus.hasCloudData && localLearned > 0) {
      setIsConflictModalOpen(true);
      return;
    }

    setIsPulling(true);
    setPullResult(null);
    try {
      // Card documents contain the latest FSRS snapshot; review logs are only
      // scanned fully for legacy accounts that have no saved profile summary.
      const data = await pullDataFromFirestore(currentUid, {
        existingStats: studyStats,
        currentCards: allCards
      });
      const cardCount = Object.keys(data.cards).length;
      const cardsWithCloudProgress = mergeFirestoreCardProgress(
        data.legacyUpdatedCards || allCards,
        data.cards
      );
      if (cardCount > 0 || data.legacyUpdatedCards) {
        setAllCards(cardsWithCloudProgress);
        saveUserCards(currentUid, cardsWithCloudProgress);
      }

      if (data.folders) {
        setFolders(data.folders);
        saveUserFolders(currentUid, data.folders);
      }

      if (data.decks) {
        setDecks(data.decks);
        saveUserDecks(currentUid, data.decks);
      }

      setStudyStats(data.stats);
      saveUserStudyStats(currentUid, data.stats);
      if (data.statsNeedBackfill || !areStudyStatsEqual(data.stats, data.remoteStats)) {
        // Persist the compact summary so later pulls stay bounded and skip no-op writes.
        await syncUserStudyStats(currentUid, data.stats);
      }

      const todayDone = data.stats.todayStats.reviewedCount;
      const logScope = data.statsNeedBackfill ? 'lượt review cũ' : 'lượt review gần đây';
      setPullResult(
        `✓ Đã đồng bộ thành công! Đã cập nhật ${cardCount} trạng thái thẻ, xử lý ${data.reviewLogsProcessed} ${logScope}, tiến độ hôm nay (${todayDone} lượt ôn, chuỗi ${data.stats.streakDays} ngày) và ${data.decks?.length || 0} decks từ Firestore.`
      );
    } catch (err: any) {
      setPullResult(`❌ Lỗi khi tải dữ liệu: ${err.message || err}`);
    } finally {
      setIsPulling(false);
    }
  };

  return (
    <div className={`raku-app-shell min-h-dvh flex flex-col ${darkMode ? 'dark' : ''}`}>
      {/* Desktop navigation */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-raku-line bg-raku-surface lg:flex">
        <div className="flex items-center gap-3 border-b border-raku-line px-5 py-5">
          <div className="raku-brand-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl font-bold">楽</div>
          <div className="min-w-0">
            <div className="truncate font-bold text-raku-ink">Raku Nihongo</div>
            <div className="mt-0.5 text-sm text-raku-muted">Tự học tiếng Nhật</div>
          </div>
        </div>
        <nav aria-label="Điều hướng chính" className="flex-1 space-y-1 px-3 py-5">
          {navigationItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => selectTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors ${activeTab === id ? 'bg-raku-accent-soft text-raku-accent' : 'text-raku-muted hover:bg-raku-subtle hover:text-raku-ink'}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:ml-60">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-raku-line bg-raku-surface px-3 py-2.5 sm:px-6 sm:py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5 lg:hidden">
          <div className="raku-brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg font-bold">
            楽
          </div>
          <div className="min-w-0">
            <h1 className="truncate whitespace-nowrap text-base font-bold leading-tight text-raku-ink sm:text-lg">
              Raku Nihongo
            </h1>
            <span className="hidden text-sm text-raku-muted sm:block">
              Kanji – Từ vựng – Ngữ pháp
            </span>
          </div>
        </div>
        <div className="hidden min-w-0 flex-1 text-sm font-semibold text-raku-ink lg:block">
          {navigationItems.find((item) => item.id === activeTab)?.label}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
          {/* Offline-First Sync Status indicator */}
          <div
            role="status"
            aria-label={!isOnline ? 'Đang ngoại tuyến' : syncStatus === 'syncing' ? 'Đang đồng bộ' : pendingCount > 0 ? `${pendingCount} lượt ôn tập đang chờ đồng bộ` : 'Đã sao lưu an toàn'}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium transition-colors sm:h-auto sm:w-auto sm:px-3 sm:py-2 ${
              !isOnline
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300/50 dark:border-amber-800'
                : syncStatus === 'syncing'
                ? 'bg-raku-accent-soft text-raku-accent border border-raku-accent/20'
                : pendingCount > 0
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800'
                : 'bg-raku-accent-soft text-raku-accent border border-raku-accent/20'
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
                <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400 sm:mr-1.5 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Ngoại tuyến{pendingCount > 0 ? ` (${pendingCount})` : ''}</span>
              </>
            ) : syncStatus === 'syncing' ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400 sm:mr-1.5 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Đang đồng bộ...</span>
              </>
            ) : pendingCount > 0 ? (
              <>
                <Cloud className="h-4 w-4 text-amber-600 dark:text-amber-400 sm:mr-1.5 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Lưu máy ({pendingCount})</span>
              </>
            ) : (
              <>
                <Wifi className="h-4 w-4 text-emerald-600 dark:text-emerald-400 sm:mr-1.5 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Đã sao lưu</span>
              </>
            )}
          </div>

          {/* AI Quiz generator button */}
          <button
            onClick={() => setIsAiQuizModalOpen(true)}
            className="hidden h-11 w-11 items-center justify-center rounded-xl text-raku-accent transition-colors hover:bg-raku-accent-soft focus:outline-none focus:ring-2 focus:ring-raku-accent sm:flex"
            title="AI tạo bộ câu hỏi"
            aria-label="AI tạo câu hỏi"
          >
            <Sparkles className="w-5 h-5" />
          </button>

          {/* User profile / login button */}
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-xl p-2 text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink focus:outline-none focus:ring-2 focus:ring-raku-accent"
            title={user ? (user.isAnonymous ? 'Khách ẩn danh' : user.email || 'Tài khoản') : 'Đăng nhập'}
            aria-label="Tài khoản"
          >
            <UserIcon className="w-5 h-5" />
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="flex h-11 w-11 items-center justify-center rounded-xl p-2 text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink focus:outline-none focus:ring-2 focus:ring-raku-accent"
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
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] sm:w-auto px-4 py-3 rounded-2xl shadow-xl border text-sm font-medium flex items-center justify-between gap-3 transition-all animate-in fade-in slide-in-from-top-3 duration-300 ${
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
            className="ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-raku-subtle hover:text-raku-ink"
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-6 lg:px-8 lg:pb-10">
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
                  newItemsLearnedToday={newItemsLearnedToday}
                  onQuickStudy={handleQuickStudyToday}
                  onStudyMoreNew={handleQuickStudyMoreNew}
                />

                {/* 2. Hierarchical Decks & Folders View (Anki style) */}
                <DeckFolderView
                  folders={folders}
                  decks={decks}
                  cards={allCards}
                  currentUid={user?.uid}
                  onSelectDeckToStudy={handleSelectDeckToStudy}
                  onSelectFolderToStudy={handleSelectFolderToStudy}
                  onCreateFolder={handleCreateFolder}
                  onCreateDeck={handleCreateDeck}
                  onDeleteDeck={handleDeleteDeck}
                  onDeleteFolder={handleDeleteFolder}
                  onToggleDeckVisibility={handleToggleDeckVisibility}
                  onAddCard={handleAddCard}
                  onNavigateToImport={handleNavigateToImport}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                  <button
                    onClick={() => {
                      setStudySessionCards([]);
                      setIsStudying(false);
                    }}
                    className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center space-x-1"
                  >
                    <span>← Dừng phiên ôn tập</span>
                  </button>

                  <span className="min-w-0 flex-1 break-words text-right text-xs font-bold text-sky-700 dark:text-sky-300">
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
        {activeTab === 'grammar' && (
          <GrammarPracticeView user={user} onNotify={showSyncToast} />
        )}

        {/* TAB 4: IMPORT (G2b & G5b) */}
        {activeTab === 'import' && (
          <ImportView
            folders={folders}
            decks={decks}
            initialFolderId={importTargetFolderId}
            initialDeckId={importTargetDeckId}
            onImportCards={handleImportCards}
            onUndoImportCards={handleUndoImportCards}
            onNavigateToStudy={handleNavigateToStudy}
          />
        )}

        {/* TAB 5: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-raku-accent">Dữ liệu · Thiết bị</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-raku-ink sm:text-3xl">Cài đặt</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-raku-muted">
                Quản lý bản sao lưu, dữ liệu ngoại tuyến và ứng dụng trên thiết bị này.
              </p>
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.85fr)]">
              {/* Sync and recovery */}
              <section aria-labelledby="sync-settings-title" className="overflow-hidden rounded-2xl border border-raku-line bg-raku-surface">
                <div className="flex flex-col gap-4 border-b border-raku-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-raku-accent-soft text-raku-accent">
                      <Database className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 id="sync-settings-title" className="text-base font-bold text-raku-ink sm:text-lg">
                        Đồng bộ và khôi phục
                      </h3>
                      <p className="mt-1 text-sm leading-5 text-raku-muted">
                        Tiến độ được lưu trên thiết bị trước; bạn chủ động sao lưu khi cần.
                      </p>
                    </div>
                  </div>

                  <span
                    role="status"
                    aria-live="polite"
                    className={`inline-flex min-h-9 shrink-0 items-center gap-2 self-start rounded-full border px-3 text-sm font-semibold sm:self-auto ${
                      !isOnline
                        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                        : syncStatus === 'syncing'
                        ? 'border-raku-accent/30 bg-raku-accent-soft text-raku-accent'
                        : pendingCount > 0
                        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                    }`}
                  >
                    {!isOnline ? <WifiOff className="h-4 w-4" aria-hidden="true" /> : syncStatus === 'syncing' ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : pendingCount > 0 ? <Cloud className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    {!isOnline ? 'Đang ngoại tuyến' : syncStatus === 'syncing' ? 'Đang đồng bộ' : pendingCount > 0 ? `${pendingCount} mục đang chờ` : 'Đã sao lưu'}
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
                        <span className="truncate">Kho dữ liệu N3 · 2.466 bản ghi</span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>

                    <div className="space-y-3 pb-1 pt-2">
                      <p className="text-sm leading-6 text-raku-muted">
                        Kho gồm 609 Kanji, 880 từ vựng Mimikara, 97 cấu trúc ngữ pháp và 880 câu ví dụ. Nạp lại có thể ghi đè dữ liệu gốc trên Firestore.
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

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Thanh điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-raku-line bg-raku-surface px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))] lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {navigationItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => selectTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors ${activeTab === id ? 'bg-raku-accent-soft font-semibold text-raku-accent' : 'text-raku-muted hover:bg-raku-subtle hover:text-raku-ink'}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate text-[13px] leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
