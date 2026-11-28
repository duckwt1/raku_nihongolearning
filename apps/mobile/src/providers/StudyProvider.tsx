import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  DEFAULT_DECKS,
  DEFAULT_FOLDERS,
  Rating,
  applyGrade,
  buildCustomStudyCardFromPhrase,
  buildDefaultCards,
  buildReviewQueue,
  calculateStudyStreaks,
  createInitialStudyStats,
  createNewCard,
  getDailyNewWordCounts,
  getTodayDateString,
  isDuplicatePhraseInDeck,
  recordStudyActivity,
  type Deck,
  type Folder,
  type SavedPhraseCandidate,
  type StudyCard,
  type UserStudyStats
} from '@raku/core';
import {
  isOwnedCustomDeck,
  mergeConversationSessions,
  mergeSentenceHistory
} from '@raku/sync';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  auth,
  createUserWithEmailAndPassword,
  isFirebaseConfigured,
  linkWithCredential,
  mobileSyncClient,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type User
} from '@/services/firebase';
import { mobileRepository } from '@/services/storage';

export interface MobileNewCardInput {
  surface: string;
  reading: string;
  meaningVi: string;
  hanViet?: string;
  pos?: string;
  exampleJp?: string;
  exampleVi?: string;
}

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
  markCardGood: (cardId: string) => void;
  addPhraseToDeck: (phrase: SavedPhraseCandidate, preferredDeckId?: string) => string | null;
  addCardToDeck: (deckId: string, cardData: MobileNewCardInput) => StudyCard;
  deleteCardFromDeck: (cardId: string, deckId: string) => void;
  recordStudySeconds: (seconds: number) => void;
  setDailyGoal: (goal: number) => void;
  syncNow: () => Promise<string>;
  pullFromCloud: () => Promise<string>;
  refreshDecksFromCloud: () => Promise<boolean>;
  signInAsGuest: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
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
  const bundleSyncTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const autoPulledUidRef = useRef<string | null>(null);

  cardsRef.current = cards;
  foldersRef.current = folders;
  decksRef.current = decks;
  statsRef.current = stats;
  userRef.current = user;

  const scheduleDeckBundleSync = useCallback((deckId: string) => {
    const activeUser = userRef.current;
    if (!activeUser || !isFirebaseConfigured) return;

    const existingTimer = bundleSyncTimersRef.current.get(deckId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      bundleSyncTimersRef.current.delete(deckId);
      const currentUser = userRef.current;
      if (!currentUser || !isFirebaseConfigured) return;
      const deck = decksRef.current.find((d) => d.id === deckId);
      if (!deck || !isOwnedCustomDeck(deck)) return;
      const folder = foldersRef.current.find((f) => f.id === deck.folderId);
      const deckCards = cardsRef.current.filter((c) => c.deckId === deckId);
      void mobileSyncClient
        .syncSingleDeckBundle(currentUser.uid, deck, deckCards, folder)
        .then((updatedDeck) => {
          if (userRef.current?.uid !== currentUser.uid) return;
          const nextDecks = decksRef.current.map((d) =>
            d.id === deckId
              ? {
                  ...d,
                  cardsHash: updatedDeck.cardsHash,
                  bundleChunkCount: updatedDeck.bundleChunkCount,
                  cardCount: updatedDeck.cardCount,
                  updatedAt: updatedDeck.updatedAt
                }
              : d
          );
          decksRef.current = nextDecks;
          setDecks(nextDecks);
          void mobileRepository.saveDecks(currentUser.uid, nextDecks);
        })
        .catch(() => {});
    }, 2000);

    bundleSyncTimersRef.current.set(deckId, timer);
  }, []);

  useEffect(() => {
    const timers = bundleSyncTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

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
    cardsRef.current = loadedCards;
    foldersRef.current = loadedFolders;
    decksRef.current = loadedDecks;
    statsRef.current = loadedStats;
    setCards(loadedCards);
    setFolders(loadedFolders);
    setDecks(loadedDecks);
    setStats(loadedStats);
    setDailyGoalState(loadedGoal);
    setPendingSyncCount(queue.length);
    setReady(true);
    return {
      cards: loadedCards,
      folders: loadedFolders,
      decks: loadedDecks
    };
  }, []);

  const refreshDecksFromCloud = useCallback(async (): Promise<boolean> => {
    const activeUser = userRef.current;
    if (!activeUser || !isFirebaseConfigured) return false;
    try {
      const res = await mobileSyncClient.pullDecksAndBundlesOnly(
        activeUser.uid,
        foldersRef.current,
        decksRef.current,
        cardsRef.current
      );
      if (userRef.current?.uid !== activeUser.uid) return false;
      if (res.hasChanges) {
        cardsRef.current = res.cards;
        foldersRef.current = res.folders;
        decksRef.current = res.decks;
        setCards(res.cards);
        setFolders(res.folders);
        setDecks(res.decks);
        await Promise.all([
          mobileRepository.saveCards(activeUser.uid, res.cards),
          mobileRepository.saveFolders(activeUser.uid, res.folders),
          mobileRepository.saveDecks(activeUser.uid, res.decks)
        ]);
      }
      return res.hasChanges;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    // Immediate offline-first load for guest before Firebase auth resolves
    void hydrateForUser(null);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      for (const t of bundleSyncTimersRef.current.values()) clearTimeout(t);
      bundleSyncTimersRef.current.clear();
      setUser(firebaseUser);
      userRef.current = firebaseUser;

      const uid = firebaseUser?.uid ?? null;
      void hydrateForUser(uid).then(() => {
        if (uid && isFirebaseConfigured && autoPulledUidRef.current !== uid) {
          autoPulledUidRef.current = uid;
          // Lightweight 1-time refresh on login: fetches only decks & changed deckBundles (0 reads if unchanged)
          void refreshDecksFromCloud();
        }
        if (!uid) {
          autoPulledUidRef.current = null;
        }
      });
    });
    return unsubscribe;
  }, [hydrateForUser, refreshDecksFromCloud]);

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

  const markCardGood = useCallback(
    (cardId: string) => {
      const target = cardsRef.current.find((c) => c.id === cardId);
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
      rateCard(updatedCard, Rating.Good);
    },
    [rateCard]
  );

  const addPhraseToDeck = useCallback(
    (phrase: SavedPhraseCandidate, preferredDeckId?: string): string | null => {
      const uid = userRef.current?.uid ?? null;
      let targetDeckId = preferredDeckId;
      let nextDecks = decksRef.current;

      if (!targetDeckId || !nextDecks.some((d) => d.id === targetDeckId)) {
        const CONV_DECK_ID = 'deck_conversation_phrases';
        targetDeckId = CONV_DECK_ID;
        if (!nextDecks.some((d) => d.id === CONV_DECK_ID)) {
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
          nextDecks = [...nextDecks, convDeck];
          decksRef.current = nextDecks;
          setDecks(nextDecks);
          void mobileRepository.saveDecks(uid, nextDecks);
        }
      }

      if (isDuplicatePhraseInDeck(phrase.surface, targetDeckId, cardsRef.current)) {
        return null;
      }

      const newCard = buildCustomStudyCardFromPhrase(phrase, targetDeckId);
      const nextCards = [...cardsRef.current, newCard];
      cardsRef.current = nextCards;
      setCards(nextCards);
      void mobileRepository.saveCards(uid, nextCards);

      scheduleDeckBundleSync(targetDeckId);

      return newCard.id;
    },
    [scheduleDeckBundleSync]
  );

  const addCardToDeck = useCallback(
    (deckId: string, cardData: MobileNewCardInput): StudyCard => {
      const uid = userRef.current?.uid ?? null;
      const cardId = `c_word_manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const wordId = `w_manual_${Date.now()}`;
      const surface = cardData.surface.trim();
      const reading = cardData.reading.trim() || surface;

      const newCard: StudyCard = {
        id: cardId,
        type: 'word',
        refId: wordId,
        word: {
          id: wordId,
          surface,
          readings: [reading],
          meaningVi: cardData.meaningVi.trim(),
          pos: cardData.pos || '名詞',
          hanVietBreakdown: cardData.hanViet
            ? cardData.hanViet.trim().split(/\s+/).filter(Boolean)
            : [],
          kanji: surface.match(/[\u4E00-\u9FAF\u3400-\u4DBF]/g) || [],
          exampleJp: cardData.exampleJp?.trim() || undefined,
          exampleVi: cardData.exampleVi?.trim() || undefined,
          exampleIds: [],
          tags: ['custom']
        },
        deckId,
        fsrsCard: createNewCard(),
        isNew: true,
        isDue: false
      };

      const nextCards = [...cardsRef.current, newCard];
      cardsRef.current = nextCards;
      setCards(nextCards);
      void mobileRepository.saveCards(uid, nextCards);
      scheduleDeckBundleSync(deckId);
      return newCard;
    },
    [scheduleDeckBundleSync]
  );

  const deleteCardFromDeck = useCallback(
    (cardId: string, deckId: string) => {
      const uid = userRef.current?.uid ?? null;
      const nextCards = cardsRef.current.filter((c) => c.id !== cardId);
      cardsRef.current = nextCards;
      setCards(nextCards);
      void mobileRepository.saveCards(uid, nextCards);
      scheduleDeckBundleSync(deckId);
    },
    [scheduleDeckBundleSync]
  );

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

      // 1. Push dirty owned deck bundles first (0 writes if unchanged)
      const dirtyRes = await mobileSyncClient.syncDirtyDeckBundles(
        activeUser.uid,
        decksRef.current,
        cardsRef.current
      );
      if (dirtyRes.syncedDeckIds.length > 0) {
        decksRef.current = dirtyRes.updatedDecks;
        setDecks(dirtyRes.updatedDecks);
        await mobileRepository.saveDecks(activeUser.uid, dirtyRes.updatedDecks);
      }

      // 2. Bidirectional pull: gets new decks, changed deckBundles (0 reads if unchanged), communityDecks & FSRS
      const pulled = await mobileSyncClient.pullFromCloud(
        activeUser.uid,
        cardsRef.current,
        statsRef.current,
        { folders: foldersRef.current, decks: decksRef.current }
      );
      cardsRef.current = pulled.cards;
      setCards(pulled.cards);
      await mobileRepository.saveCards(activeUser.uid, pulled.cards);
      if (pulled.folders) {
        foldersRef.current = pulled.folders;
        setFolders(pulled.folders);
        await mobileRepository.saveFolders(activeUser.uid, pulled.folders);
      }
      if (pulled.decks) {
        decksRef.current = pulled.decks;
        setDecks(pulled.decks);
        await mobileRepository.saveDecks(activeUser.uid, pulled.decks);
      }
      statsRef.current = pulled.stats;
      setStats(pulled.stats);
      await mobileRepository.saveStudyStats(activeUser.uid, pulled.stats);

      // 3. Push merged structure & stats back to Cloud
      await mobileSyncClient.syncFoldersAndDecks(
        activeUser.uid,
        foldersRef.current,
        decksRef.current
      );
      await mobileSyncClient.syncStudyStats(activeUser.uid, statsRef.current);

      // Sync conversation sessions & sentence history (bounded queries)
      const [localSessions, localAttempts, cloudSessions, cloudAttempts] = await Promise.all([
        mobileRepository.loadConversationSessions(activeUser.uid),
        mobileRepository.loadSentenceHistory(activeUser.uid),
        mobileSyncClient.pullConversationSessionsFromCloud(activeUser.uid).catch(() => []),
        mobileSyncClient.pullSentenceHistoryFromCloud(activeUser.uid).catch(() => [])
      ]);
      const mergedSessions = mergeConversationSessions(localSessions, cloudSessions);
      const mergedAttempts = mergeSentenceHistory(localAttempts, cloudAttempts);
      await Promise.all([
        mobileRepository.saveConversationSessions(activeUser.uid, mergedSessions),
        mobileRepository.saveSentenceHistory(activeUser.uid, mergedAttempts)
      ]);
      const cloudSessionIds = new Map(cloudSessions.map((s) => [s.id, s.updatedAt]));
      const cloudAttemptIds = new Set(cloudAttempts.map((a) => a.id));
      await Promise.allSettled([
        ...mergedSessions
          .slice(0, 10)
          .filter((s) => {
            const remoteUpdated = cloudSessionIds.get(s.id);
            return !remoteUpdated || s.updatedAt > remoteUpdated;
          })
          .map((s) => mobileSyncClient.upsertConversationSessionToCloud(activeUser.uid, s)),
        ...mergedAttempts
          .slice(0, 20)
          .filter((a) => !cloudAttemptIds.has(a.id))
          .map((a) => mobileSyncClient.upsertSentenceAttemptToCloud(activeUser.uid, a))
      ]);

      const remaining = await mobileRepository.getOfflineQueue(activeUser.uid);
      setPendingSyncCount(remaining.length);
      const extraParts: string[] = [];
      if (flushed > 0) extraParts.push(`đẩy ${flushed} lượt ôn`);
      if (pulled.bundlesFetchedCount > 0) extraParts.push(`tải ${pulled.bundlesFetchedCount} bộ từ mới`);
      if (pulled.communityNewDecksCount > 0) {
        extraParts.push(`${pulled.communityNewDecksCount} bộ cộng đồng`);
      }
      const msg =
        extraParts.length > 0
          ? `Đã đồng bộ: ${extraParts.join(', ')}.`
          : 'Dữ liệu đã khớp với đám mây.';
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
        statsRef.current,
        { folders: foldersRef.current, decks: decksRef.current }
      );
      cardsRef.current = pulled.cards;
      setCards(pulled.cards);
      await mobileRepository.saveCards(activeUser.uid, pulled.cards);
      if (pulled.folders) {
        foldersRef.current = pulled.folders;
        setFolders(pulled.folders);
        await mobileRepository.saveFolders(activeUser.uid, pulled.folders);
      }
      if (pulled.decks) {
        decksRef.current = pulled.decks;
        setDecks(pulled.decks);
        await mobileRepository.saveDecks(activeUser.uid, pulled.decks);
      }
      statsRef.current = pulled.stats;
      setStats(pulled.stats);
      await mobileRepository.saveStudyStats(activeUser.uid, pulled.stats);

      const [localSessions, localAttempts, cloudSessions, cloudAttempts] = await Promise.all([
        mobileRepository.loadConversationSessions(activeUser.uid),
        mobileRepository.loadSentenceHistory(activeUser.uid),
        mobileSyncClient.pullConversationSessionsFromCloud(activeUser.uid).catch(() => []),
        mobileSyncClient.pullSentenceHistoryFromCloud(activeUser.uid).catch(() => [])
      ]);
      await Promise.all([
        mobileRepository.saveConversationSessions(
          activeUser.uid,
          mergeConversationSessions(localSessions, cloudSessions)
        ),
        mobileRepository.saveSentenceHistory(
          activeUser.uid,
          mergeSentenceHistory(localAttempts, cloudAttempts)
        )
      ]);

      const msg =
        pulled.bundlesFetchedCount > 0 || pulled.communityNewDecksCount > 0
          ? `Đã khôi phục ${pulled.cloudCardCount} trạng thái thẻ và ${pulled.bundlesFetchedCount + pulled.communityNewDecksCount} bộ từ vựng từ đám mây.`
          : `Đã khôi phục ${pulled.cloudCardCount} trạng thái thẻ từ đám mây.`;
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

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const cred = GoogleAuthProvider.credential(idToken);
    const current = auth.currentUser;
    if (current?.isAnonymous) {
      try {
        await linkWithCredential(current, cred);
        return;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== 'auth/credential-already-in-use' && code !== 'auth/email-already-in-use') throw err;
      }
    }
    await signInWithCredential(auth, cred);
  }, []);

  const signOutAccount = useCallback(async (clearLocal: boolean) => {
    const uid = userRef.current?.uid;
    if (clearLocal && uid) {
      await mobileRepository.clearUserData(uid);
    }
    try {
      await GoogleSignin.signOut();
    } catch {
      // Ignore if not signed in with Google or running without native module
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
      markCardGood,
      addPhraseToDeck,
      addCardToDeck,
      deleteCardFromDeck,
      recordStudySeconds,
      setDailyGoal,
      syncNow,
      pullFromCloud,
      refreshDecksFromCloud,
      signInAsGuest,
      signInWithEmail,
      registerWithEmail,
      signInWithGoogle,
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
      markCardGood,
      addPhraseToDeck,
      addCardToDeck,
      deleteCardFromDeck,
      recordStudySeconds,
      setDailyGoal,
      syncNow,
      pullFromCloud,
      refreshDecksFromCloud,
      signInAsGuest,
      signInWithEmail,
      registerWithEmail,
      signInWithGoogle,
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
