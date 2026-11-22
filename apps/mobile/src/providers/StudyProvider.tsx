import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DECKS,
  DEFAULT_FOLDERS,
  buildDefaultCards,
  buildReviewQueue,
  calculateStudyStreaks,
  createInitialStudyStats,
  getDailyNewWordCounts,
  getTodayDateString,
  recordStudyActivity,
  type Deck,
  type Folder,
  type StudyCard,
  type UserStudyStats
} from '@raku/core';
import {
  EmailAuthProvider,
  auth,
  createUserWithEmailAndPassword,
  isFirebaseConfigured,
  linkWithCredential,
  mobileSyncClient,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User
} from '@/services/firebase';
import { mobileRepository } from '@/services/storage';

interface StudyContextValue {
  ready: boolean;
  user: User | null;
  cards: StudyCard[];
  folders: Folder[];
  decks: Deck[];
  stats: UserStudyStats;
  dailyGoal: number;
  pendingSyncCount: number;
  isSyncing: boolean;
  lastSyncMessage: string | null;
  totalDueToday: number;
  totalNewToday: number;
  newWordsToday: number;
  dailyNewWords: Map<string, number>;
  currentStreak: number;
  longestStreak: number;
  buildQueueForTarget: (target: string, extraNew?: number) => { title: string; cards: StudyCard[] };
  rateCard: (updatedCard: StudyCard, rating: number) => void;
  recordStudySeconds: (seconds: number) => void;
  setDailyGoal: (goal: number) => void;
  syncNow: () => Promise<string>;
  pullFromCloud: () => Promise<string>;
  signInAsGuest: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  signOutAccount: (clearLocal: boolean) => Promise<void>;
  refreshLocal: () => Promise<void>;
}

const StudyContext = createContext<StudyContextValue | null>(null);

export function StudyProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [cards, setCards] = useState<StudyCard[]>(() => buildDefaultCards());
  const [folders, setFolders] = useState<Folder[]>(() => DEFAULT_FOLDERS);
  const [decks, setDecks] = useState<Deck[]>(() => DEFAULT_DECKS);
  const [stats, setStats] = useState<UserStudyStats>(() => createInitialStudyStats());
  const [dailyGoal, setDailyGoalState] = useState<number>(10);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  const cardsRef = useRef(cards);
  const foldersRef = useRef(folders);
  const decksRef = useRef(decks);
  const statsRef = useRef(stats);
  const userRef = useRef(user);

  cardsRef.current = cards;
  foldersRef.current = folders;
  decksRef.current = decks;
  statsRef.current = stats;
  userRef.current = user;

  const hydrateForUser = useCallback(async (uid?: string | null) => {
    const [loadedCards, loadedFolders, loadedDecks, loadedStats, loadedGoal, queue] =
      await Promise.all([
        mobileRepository.loadCards(uid),
        mobileRepository.loadFolders(uid),
        mobileRepository.loadDecks(uid),
        mobileRepository.loadStudyStats(uid),
        mobileRepository.loadDailyNewWordGoal(uid),
        mobileRepository.getOfflineQueue(uid)
      ]);
    setCards(loadedCards);
    setFolders(loadedFolders);
    setDecks(loadedDecks);
    setStats(loadedStats);
    setDailyGoalState(loadedGoal);
    setPendingSyncCount(queue.length);
    setReady(true);
  }, []);

  useEffect(() => {
    // Immediate offline-first load for guest before Firebase auth resolves
    void hydrateForUser(null);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      void hydrateForUser(firebaseUser?.uid ?? null);
    });
    return unsubscribe;
  }, [hydrateForUser]);

  const dailyNewWords = useMemo(() => getDailyNewWordCounts(cards), [cards]);
  const today = getTodayDateString();
  const newWordsToday = dailyNewWords.get(today) || 0;
  const streak = useMemo(
    () => calculateStudyStreaks(dailyNewWords, today, dailyGoal),
    [dailyNewWords, today, dailyGoal]
  );

  const { totalDueToday, totalNewToday } = useMemo(() => {
    const session = buildReviewQueue(cards, dailyGoal, 500);
    return {
      totalDueToday: session.dueCount,
      totalNewToday: session.newCount
    };
  }, [cards, dailyGoal]);

  const buildQueueForTarget = useCallback(
    (target: string, extraNew = 0): { title: string; cards: StudyCard[] } => {
      const currentCards = cardsRef.current;
      const currentDecks = decksRef.current;
      const currentFolders = foldersRef.current;

      if (target === 'today') {
        const session = buildReviewQueue(currentCards, dailyGoal, 100, new Date(), extraNew);
        return {
          title: 'Ôn tập hôm nay',
          cards: session.queue
        };
      }

      if (target.startsWith('folder:')) {
        const folderId = target.slice('folder:'.length);
        const folder = currentFolders.find((f) => f.id === folderId);
        const deckIds = new Set(currentDecks.filter((d) => d.folderId === folderId).map((d) => d.id));
        const scoped = currentCards.filter((c) => c.deckId && deckIds.has(c.deckId));
        const session = buildReviewQueue(scoped, 20, 100, new Date(), extraNew);
        return {
          title: folder?.name || 'Thư mục',
          cards: session.queue
        };
      }

      const deckId = target.startsWith('deck:') ? target.slice('deck:'.length) : target;
      const deck = currentDecks.find((d) => d.id === deckId);
      const scoped = currentCards.filter((c) => c.deckId === deckId);
      const session = buildReviewQueue(
        scoped,
        deck?.newCardsPerDay ?? 20,
        deck?.maxReviewsPerDay ?? 100,
        new Date(),
        extraNew
      );
      return {
        title: deck?.name || 'Bộ thẻ',
        cards: session.queue
      };
    },
    [dailyGoal]
  );

  const rateCard = useCallback((updatedCard: StudyCard, rating: number) => {
    const uid = userRef.current?.uid ?? null;
    const nextCards = cardsRef.current.map((c) => (c.id === updatedCard.id ? updatedCard : c));
    cardsRef.current = nextCards;
    setCards(nextCards);
    void mobileRepository.saveCards(uid, nextCards);

    const nextStats = recordStudyActivity(statsRef.current, 0, rating);
    statsRef.current = nextStats;
    setStats(nextStats);
    void mobileRepository.saveStudyStats(uid, nextStats);

    if (uid) {
      const item = {
        id: `${uid}_${updatedCard.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId: uid,
        card: updatedCard,
        rating,
        reviewedAt: new Date().toISOString()
      };
      void mobileRepository.enqueueOfflineReview(item, uid).then(() => {
        void mobileRepository.getOfflineQueue(uid).then((q) => setPendingSyncCount(q.length));
      });
    }
  }, []);

  const recordStudySeconds = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    const uid = userRef.current?.uid ?? null;
    const nextStats = recordStudyActivity(statsRef.current, seconds);
    statsRef.current = nextStats;
    setStats(nextStats);
    void mobileRepository.saveStudyStats(uid, nextStats);
  }, []);

  const setDailyGoal = useCallback((goal: number) => {
    const uid = userRef.current?.uid ?? null;
    setDailyGoalState(goal);
    void mobileRepository.saveDailyNewWordGoal(uid, goal);
  }, []);

  const syncNow = useCallback(async (): Promise<string> => {
    const activeUser = userRef.current;
    if (!activeUser) {
      return 'Hãy đăng nhập hoặc bật chế độ ẩn danh trước khi đồng bộ.';
    }
    if (!isFirebaseConfigured) {
      return 'Chưa cấu hình EXPO_PUBLIC_FIREBASE_API_KEY trong apps/mobile/.env.';
    }
    setIsSyncing(true);
    try {
      await mobileSyncClient.syncUserProfile(activeUser);
      const flushed = await mobileSyncClient.flushOfflineQueue(activeUser.uid);
      await mobileSyncClient.syncFoldersAndDecks(
        activeUser.uid,
        foldersRef.current,
        decksRef.current
      );
      await mobileSyncClient.syncStudyStats(activeUser.uid, statsRef.current);
      const remaining = await mobileRepository.getOfflineQueue(activeUser.uid);
      setPendingSyncCount(remaining.length);
      const msg =
        flushed > 0
          ? `Đã đồng bộ ${flushed} lượt ôn lên đám mây.`
          : 'Dữ liệu đã được sao lưu mới nhất.';
      setLastSyncMessage(msg);
      return msg;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Đồng bộ thất bại.';
      setLastSyncMessage(msg);
      return msg;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const pullFromCloud = useCallback(async (): Promise<string> => {
    const activeUser = userRef.current;
    if (!activeUser) {
      return 'Hãy đăng nhập trước khi khôi phục từ đám mây.';
    }
    if (!isFirebaseConfigured) {
      return 'Chưa cấu hình EXPO_PUBLIC_FIREBASE_API_KEY trong apps/mobile/.env.';
    }
    setIsSyncing(true);
    try {
      const pulled = await mobileSyncClient.pullFromCloud(
        activeUser.uid,
        cardsRef.current,
        statsRef.current
      );
      setCards(pulled.cards);
      await mobileRepository.saveCards(activeUser.uid, pulled.cards);
      if (pulled.folders) {
        setFolders(pulled.folders);
        await mobileRepository.saveFolders(activeUser.uid, pulled.folders);
      }
      if (pulled.decks) {
        setDecks(pulled.decks);
        await mobileRepository.saveDecks(activeUser.uid, pulled.decks);
      }
      setStats(pulled.stats);
      await mobileRepository.saveStudyStats(activeUser.uid, pulled.stats);
      const msg = `Đã khôi phục ${pulled.cloudCardCount} trạng thái thẻ từ đám mây.`;
      setLastSyncMessage(msg);
      return msg;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể khôi phục dữ liệu.';
      setLastSyncMessage(msg);
      return msg;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const signInAsGuest = useCallback(async () => {
    await signInAnonymously(auth);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const registerWithEmail = useCallback(async (email: string, password: string) => {
    const current = auth.currentUser;
    if (current?.isAnonymous) {
      const cred = EmailAuthProvider.credential(email.trim(), password);
      await linkWithCredential(current, cred);
    } else {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    }
  }, []);

  const signOutAccount = useCallback(async (clearLocal: boolean) => {
    const uid = userRef.current?.uid;
    if (clearLocal && uid) {
      await mobileRepository.clearUserData(uid);
    }
    await signOut(auth);
  }, []);

  const refreshLocal = useCallback(async () => {
    await hydrateForUser(userRef.current?.uid ?? null);
  }, [hydrateForUser]);

  const value = useMemo<StudyContextValue>(
    () => ({
      ready,
      user,
      cards,
      folders,
      decks,
      stats,
      dailyGoal,
      pendingSyncCount,
      isSyncing,
      lastSyncMessage,
      totalDueToday,
      totalNewToday,
      newWordsToday,
      dailyNewWords,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      buildQueueForTarget,
      rateCard,
      recordStudySeconds,
      setDailyGoal,
      syncNow,
      pullFromCloud,
      signInAsGuest,
      signInWithEmail,
      registerWithEmail,
      signOutAccount,
      refreshLocal
    }),
    [
      ready,
      user,
      cards,
      folders,
      decks,
      stats,
      dailyGoal,
      pendingSyncCount,
      isSyncing,
      lastSyncMessage,
      totalDueToday,
      totalNewToday,
      newWordsToday,
      dailyNewWords,
      streak.currentStreak,
      streak.longestStreak,
      buildQueueForTarget,
      rateCard,
      recordStudySeconds,
      setDailyGoal,
      syncNow,
      pullFromCloud,
      signInAsGuest,
      signInWithEmail,
      registerWithEmail,
      signOutAccount,
      refreshLocal
    ]
  );

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

export function useStudy(): StudyContextValue {
  const ctx = useContext(StudyContext);
  if (!ctx) {
    throw new Error('useStudy must be used inside StudyProvider');
  }
  return ctx;
}
