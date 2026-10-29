import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clock3,
  Copy,
  Crown,
  DoorOpen,
  Link2,
  LoaderCircle,
  Send,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Zap
} from 'lucide-react';
import {
  ARENA_COUNTDOWN_MS,
  ARENA_HOST_HEARTBEAT_MS,
  ARENA_HOST_TIMEOUT_MS,
  ARENA_MAX_QUESTIONS,
  ARENA_MAX_PLAYERS,
  ARENA_PLAYER_HEARTBEAT_MS,
  ARENA_PLAYER_TIMEOUT_MS,
  ARENA_REVEAL_MS,
  ARENA_SUBMISSION_GRACE_MS,
  ARENA_TIME_LIMITS,
  countArenaEligibleWords,
  rankArenaPlayers,
  selectArenaWords,
  type ArenaQuestionMode,
  type ArenaSettings,
  type ArenaWordSource,
  type JlptLevel,
  type ArenaQuestion,
  type StudyCard,
  type Deck
} from '@raku/core';
import { auth, signInAnonymously } from '../services/firebase';
import {
  advanceArenaGame,
  arenaCountdownEndsAt,
  arenaQuestionEndsAt,
  arenaRevealEndsAt,
  closeArenaRoom,
  closeArenaRoomIfOnlyHostRemains,
  createArenaRoom,
  getArenaSubmissionState,
  joinArenaRoom,
  leaveArenaRoom,
  removeStaleArenaPlayers,
  sendArenaHeartbeat,
  sendArenaPlayerHeartbeat,
  settleArenaQuestion,
  startArenaGame,
  startArenaQuestion,
  submitArenaAnswer,
  subscribeArenaOwnAnswer,
  subscribeArenaPlayers,
  subscribeArenaQuestion,
  subscribeArenaQuestionAnswers,
  subscribeArenaReveal,
  subscribeArenaRoom,
  type ArenaAnswer,
  type ArenaPlayer,
  type ArenaReveal,
  type ArenaRoom
} from '../services/arenaRooms';

interface ArenaViewProps {
  cards: StudyCard[];
  decks: Deck[];
}

const sourceOptions: Array<{ value: ArenaWordSource; label: string }> = [
  { value: 'owned', label: 'Bộ thẻ của tôi' },
  { value: 'community', label: 'Bộ thẻ cộng đồng' },
  { value: 'all', label: 'Tất cả từ vựng' },
  { value: 'jlpt', label: 'Theo cấp độ JLPT' }
];

const modeOptions: Array<{ value: ArenaQuestionMode; label: string }> = [
  { value: 'mixed', label: 'Trộn 3 dạng' },
  { value: 'vi-to-jp', label: 'Tiếng Việt → từ vựng' },
  { value: 'jp-to-reading', label: 'Từ vựng → cách đọc' },
  { value: 'jp-to-meaning', label: 'Từ vựng → nghĩa tiếng Việt' }
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

function firestoreErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error) || typeof error.code !== 'string') return null;
  return error.code;
}

function isPermissionDenied(error: unknown): boolean {
  const code = firestoreErrorCode(error);
  return code === 'permission-denied' || Boolean(code?.endsWith('/permission-denied'));
}

function createInitialSettings(): ArenaSettings {
  return {
    source: 'all',
    questionCount: 10,
    timeLimitSeconds: 10,
    questionMode: 'mixed'
  };
}

function ArenaButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
  variant = 'primary',
  className = ''
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
}) {
  const variantClass = variant === 'primary'
    ? 'bg-raku-accent text-raku-on-accent shadow-sm hover:brightness-105 disabled:bg-raku-muted/30 disabled:text-raku-muted'
    : variant === 'danger'
      ? 'border border-raku-signal/30 bg-raku-signal/5 text-raku-signal hover:bg-raku-signal/10'
      : 'border border-raku-line bg-raku-surface text-raku-ink hover:bg-raku-subtle';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed ${variantClass} ${className}`}
    >
      {children}
    </button>
  );
}

function ArenaField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-raku-ink">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ArenaSelect({
  value,
  onChange,
  children
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-12 w-full rounded-xl border border-raku-line bg-raku-surface px-3 text-sm text-raku-ink"
    >
      {children}
    </select>
  );
}

function ArenaPlayerList({ players, hostUid }: { players: ArenaPlayer[]; hostUid: string }) {
  return (
    <ul className="space-y-2">
      {players.map((player) => (
        <li key={player.uid} className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-raku-canvas px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raku-accent-soft text-sm font-bold text-raku-accent">
              {player.nickname.slice(0, 1).toLocaleUpperCase('vi-VN')}
            </span>
            <span className="truncate text-sm font-semibold text-raku-ink">{player.nickname}</span>
            {player.uid === hostUid && <Crown className="h-4 w-4 shrink-0 text-raku-signal" aria-label="Chủ phòng" />}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${player.status === 'active' ? 'bg-raku-accent-soft text-raku-accent' : 'bg-raku-subtle text-raku-muted'}`}>
            {player.status === 'active' ? 'Đang chơi' : 'Đã rời'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ArenaView({ cards, decks }: ArenaViewProps) {
  const [settings, setSettings] = useState<ArenaSettings>(createInitialSettings);
  const [nickname, setNickname] = useState(() => localStorage.getItem('raku-arena-nickname') || '');
  const [roomCodeInput, setRoomCodeInput] = useState(() =>
    new URLSearchParams(window.location.search).get('arena')?.toUpperCase() || ''
  );
  const [roomId, setRoomId] = useState<string | null>(null);
  const [sessionUid, setSessionUid] = useState<string | null>(auth.currentUser?.uid || null);
  const [room, setRoom] = useState<ArenaRoom | null>(null);
  const [players, setPlayers] = useState<ArenaPlayer[]>([]);
  const [question, setQuestion] = useState<ArenaQuestion | null>(null);
  const [ownAnswer, setOwnAnswer] = useState<ArenaAnswer | null>(null);
  const [answers, setAnswers] = useState<Array<ArenaAnswer & { uid: string }>>([]);
  const [answersForQuestionId, setAnswersForQuestionId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<ArenaReveal | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [submittedQuestionId, setSubmittedQuestionId] = useState<string | null>(null);
  const [draftAnswer, setDraftAnswer] = useState('');
  const [notice, setNotice] = useState('');
  const [sessionEnded, setSessionEnded] = useState('');
  const [copied, setCopied] = useState(false);
  const settlingQuestionIds = useRef(new Set<string>());
  const submitLockRef = useRef<string | null>(null);
  const countdownFallbackRef = useRef<{ key: string; endsAt: number } | null>(null);
  const playerHeartbeatObservationsRef = useRef(new Map<string, { timestamp: number; receivedAt: number }>());
  const stalePlayerCleanupAttemptsRef = useRef(new Map<string, { observedAt: number; attemptedAt: number }>());
  const selectedWords = useMemo(
    () => selectArenaWords(cards, decks, settings.source, settings.jlptLevel),
    [cards, decks, settings.source, settings.jlptLevel]
  );
  const availableCount = useMemo(
    () => countArenaEligibleWords(selectedWords, settings.questionMode),
    [selectedWords, settings.questionMode]
  );
  const maxQuestionCount = Math.min(availableCount, ARENA_MAX_QUESTIONS);
  const isHost = Boolean(room && sessionUid && room.hostUid === sessionUid);
  const localPlayer = players.find((player) => player.uid === sessionUid);
  const activePlayers = players.filter((player) => player.status === 'active');
  const activeAnsweredCount = answers.filter((answer) => activePlayers.some((player) => player.uid === answer.uid)).length;
  const inviteLink = room
    ? `${window.location.origin}${window.location.pathname}?arena=${room.roomCode}`
    : '';
  const countdownEnds = room ? arenaCountdownEndsAt(room) : null;
  const questionEnds = room ? arenaQuestionEndsAt(room) : null;
  const revealEnds = room ? arenaRevealEndsAt(room) : null;
  const countdownNumber = countdownEnds === null ? 3 : Math.max(1, Math.ceil((countdownEnds - now) / 1_000));
  const timeLeft = questionEnds === null ? room?.settings.timeLimitSeconds ?? 0 : Math.max(0, Math.ceil((questionEnds - now) / 1_000));
  const timeProgress = room?.settings.timeLimitSeconds
    ? Math.max(0, Math.min(100, ((questionEnds ?? now) - now) / (room.settings.timeLimitSeconds * 1_000) * 100))
    : 0;
  const hasSubmitted = Boolean(ownAnswer || submittedQuestionId === room?.activeQuestionId);
  const ownResult = reveal?.results.find((result) => result.uid === sessionUid);
  const handleSubscriptionError = useCallback((error: { code?: string; message: string }) => {
    if (isPermissionDenied(error)) {
      setSessionEnded('Bạn không còn quyền truy cập phiên này. Hãy vào lại phòng bằng cùng tài khoản nếu phiên còn hoạt động.');
      setRoomId(null);
      return;
    }
    setNotice(error.message);
  }, []);

  useEffect(() => {
    if (!roomId || !room || ['closed', 'finished'].includes(room.status)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [roomId, room?.status]);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setPlayers([]);
      setQuestion(null);
      setOwnAnswer(null);
      setAnswers([]);
      setReveal(null);
      return;
    }

    const unsubscribeRoom = subscribeArenaRoom(roomId, setRoom, handleSubscriptionError);
    const unsubscribePlayers = subscribeArenaPlayers(roomId, (nextPlayers) => {
      const receivedAt = Date.now();
      const presentUids = new Set(nextPlayers.map((player) => player.uid));
      for (const player of nextPlayers) {
        const timestamp = player.lastSeenAt?.toMillis() ?? player.joinedAt?.toMillis() ?? 0;
        const previous = playerHeartbeatObservationsRef.current.get(player.uid);
        if (!previous || previous.timestamp !== timestamp) {
          playerHeartbeatObservationsRef.current.set(player.uid, { timestamp, receivedAt });
        }
      }
      for (const uid of playerHeartbeatObservationsRef.current.keys()) {
        if (!presentUids.has(uid)) playerHeartbeatObservationsRef.current.delete(uid);
      }
      setPlayers(nextPlayers);
    }, handleSubscriptionError);
    return () => {
      unsubscribeRoom();
      unsubscribePlayers();
      playerHeartbeatObservationsRef.current.clear();
      stalePlayerCleanupAttemptsRef.current.clear();
    };
  }, [roomId, handleSubscriptionError]);

  useEffect(() => {
    if (!roomId || !room?.activeQuestionId) {
      setQuestion(null);
      return;
    }
    const unsubscribe = subscribeArenaQuestion(roomId, room.activeQuestionId, setQuestion, handleSubscriptionError);
    return unsubscribe;
  }, [roomId, room?.activeQuestionId, handleSubscriptionError]);

  useEffect(() => {
    setOwnAnswer(null);
    setAnswers([]);
    setReveal(null);
    setSubmittedQuestionId(null);
    setDraftAnswer('');
    if (!roomId || !room?.activeQuestionId || !sessionUid) return;
    const unsubscribe = subscribeArenaOwnAnswer(roomId, room.activeQuestionId, sessionUid, setOwnAnswer, handleSubscriptionError);
    return unsubscribe;
  }, [roomId, room?.activeQuestionId, sessionUid, handleSubscriptionError]);

  useEffect(() => {
    if (!roomId || !room?.activeQuestionId || room.status !== 'reveal' || !sessionUid) {
      setReveal(null);
      return;
    }
    const unsubscribe = subscribeArenaReveal(roomId, room.activeQuestionId, setReveal, handleSubscriptionError);
    return unsubscribe;
  }, [roomId, room?.activeQuestionId, room?.status, sessionUid, handleSubscriptionError]);

  useEffect(() => {
    if (!roomId || !isHost || room?.status !== 'question' || !room.activeQuestionId) {
      setAnswers([]);
      setAnswersForQuestionId(null);
      return;
    }
    setAnswers([]);
    setAnswersForQuestionId(room.activeQuestionId);
    const unsubscribe = subscribeArenaQuestionAnswers(roomId, room.activeQuestionId, setAnswers, handleSubscriptionError);
    return unsubscribe;
  }, [roomId, room?.activeQuestionId, room?.status, isHost, handleSubscriptionError]);

  useEffect(() => {
    if (!roomId || !room || !sessionUid || localPlayer?.status !== 'active' || ['closed', 'finished'].includes(room.status)) return;
    const heartbeat = () => {
      void sendArenaPlayerHeartbeat(roomId, sessionUid).catch((error) => {
        if (!isPermissionDenied(error)) setNotice(errorText(error));
      });
      if (isHost) {
        void sendArenaHeartbeat(roomId, room.hostUid).catch((error) => setNotice(errorText(error)));
      }
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, isHost ? ARENA_HOST_HEARTBEAT_MS : ARENA_PLAYER_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [roomId, room?.hostUid, room?.status, sessionUid, isHost, localPlayer?.status]);

  useEffect(() => {
    if (isHost || !room || !roomId || room.status === 'closed' || room.status === 'finished' || !room.hostHeartbeatAt) return;
    if (now - room.hostHeartbeatAt.toMillis() <= ARENA_HOST_TIMEOUT_MS) return;
    setSessionEnded('Không nhận được tín hiệu từ chủ phòng trong thời gian dài. Hãy đợi chủ phòng kết nối lại.');
    setRoomId(null);
  }, [isHost, room, roomId, now]);

  useEffect(() => {
    if (roomId && room?.status === 'closed') {
      setSessionEnded(room.closedReason === 'host_refresh' || room.closedReason === 'host_left'
        ? 'Chủ phòng đã rời. Phòng chơi đã kết thúc.'
        : room.closedReason === 'all_guests_left'
          ? 'Phòng đã đóng vì chỉ còn chủ phòng.'
          : 'Phòng chơi đã kết thúc.');
      setRoomId(null);
    }
  }, [roomId, room?.status, room?.closedReason]);

  useEffect(() => {
    if (!roomId || localPlayer?.status !== 'left') return;
    setSessionEnded('Bạn đã mất kết nối khỏi phòng. Vào lại bằng cùng tài khoản nếu phiên còn hoạt động.');
    setRoomId(null);
  }, [roomId, localPlayer?.status]);

  useEffect(() => {
    if (!roomId || !isHost || !room || !['lobby', 'reveal'].includes(room.status)) return;
    if (room.status === 'lobby' && !room.hasHadGuest) return;
    if (!players.some((player) => player.uid === room.hostUid && player.status === 'active')) return;
    if (activePlayers.length > 1) return;
    if (activePlayers.length !== room.playerCount) return;
    void closeArenaRoomIfOnlyHostRemains(roomId, room.hostUid, players).catch((error) => setNotice(errorText(error)));
  }, [roomId, room?.status, room?.hostUid, isHost, activePlayers.length, players]);

  useEffect(() => {
    if (!roomId || !isHost || !room || !['lobby', 'countdown', 'question', 'reveal'].includes(room.status)) return;
    const stalePlayers = players.flatMap((player) => {
      if (player.uid === room.hostUid || player.status !== 'active') return [];
      const observation = playerHeartbeatObservationsRef.current.get(player.uid);
      if (!observation || now - observation.receivedAt <= ARENA_PLAYER_TIMEOUT_MS) return [];
      const previousAttempt = stalePlayerCleanupAttemptsRef.current.get(player.uid);
      if (previousAttempt?.observedAt === observation.receivedAt && now - previousAttempt.attemptedAt < 5_000) return [];
      return [{ uid: player.uid, lastSeenAtMillis: observation.timestamp, observedAt: observation.receivedAt }];
    });
    if (stalePlayers.length === 0) return;
    for (const player of stalePlayers) stalePlayerCleanupAttemptsRef.current.set(player.uid, { observedAt: player.observedAt, attemptedAt: now });
    void removeStaleArenaPlayers(roomId, room.hostUid, stalePlayers)
      .catch((error) => {
        setNotice(errorText(error));
      });
  }, [roomId, room?.status, room?.hostUid, isHost, players, now]);

  useEffect(() => {
    if (!roomId || !isHost || !room || room.status !== 'countdown') {
      countdownFallbackRef.current = null;
      return;
    }
    const countdownKey = `${roomId}:${room.activeQuestionId || room.activeQuestionIndex}`;
    if (room.countdownStartedAt) {
      countdownFallbackRef.current = null;
    } else if (countdownFallbackRef.current?.key !== countdownKey) {
      countdownFallbackRef.current = { key: countdownKey, endsAt: Date.now() + ARENA_COUNTDOWN_MS + 500 };
    }
    const endsAt = arenaCountdownEndsAt(room) ?? countdownFallbackRef.current?.endsAt ?? null;
    if (endsAt === null) return;
    const timer = window.setTimeout(() => {
      void startArenaQuestion(roomId, room.hostUid, room.activeQuestionIndex, room.activeQuestionId || `q${room.activeQuestionIndex}`)
        .catch((error) => setNotice(errorText(error)));
    }, Math.max(0, endsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [roomId, room?.status, room?.hostUid, room?.activeQuestionId, room?.activeQuestionIndex, room?.countdownStartedAt, isHost]);

  useEffect(() => {
    if (!roomId || !isHost || !room || room.status !== 'question' || !room.activeQuestionId) return;
    const allActiveAnswered = activePlayers.length > 0 && activePlayers.every((player) =>
      answersForQuestionId === room.activeQuestionId && answers.some((answer) => answer.uid === player.uid)
    );
    const timeExpired = questionEnds !== null && questionEnds + ARENA_SUBMISSION_GRACE_MS <= now;
    if (!allActiveAnswered && !timeExpired) return;
    if (settlingQuestionIds.current.has(room.activeQuestionId)) return;
    settlingQuestionIds.current.add(room.activeQuestionId);
    void settleArenaQuestion(roomId, room.hostUid, room.activeQuestionId, true)
      .catch((error) => {
        settlingQuestionIds.current.delete(room.activeQuestionId!);
        setNotice(errorText(error));
      });
  }, [roomId, room?.status, room?.hostUid, room?.activeQuestionId, answers, answersForQuestionId, activePlayers, questionEnds, now, isHost]);

  useEffect(() => {
    if (!roomId || !isHost || !room || room.status !== 'reveal' || !room.activeQuestionId) return;
    const endsAt = revealEnds ?? (room.revealedAt?.toMillis() ?? Date.now()) + ARENA_REVEAL_MS;
    const timer = window.setTimeout(() => {
      void advanceArenaGame(roomId, room.hostUid, room.activeQuestionIndex, room.questionCount)
        .catch((error) => setNotice(errorText(error)));
    }, Math.max(0, endsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [roomId, room?.status, room?.hostUid, room?.activeQuestionId, room?.activeQuestionIndex, room?.questionCount, room?.revealedAt, revealEnds, isHost]);

  useEffect(() => {
    if (availableCount === 0) return;
    setSettings((current) => current.questionCount > maxQuestionCount
      ? { ...current, questionCount: maxQuestionCount }
      : current);
  }, [maxQuestionCount]);

  const ensureUid = useCallback(async () => {
    await auth.authStateReady();
    const currentUser = auth.currentUser || (await signInAnonymously(auth)).user;
    setSessionUid(currentUser.uid);
    return currentUser.uid;
  }, []);

  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = nickname.trim().replace(/\s+/gu, ' ').slice(0, 20);
    if (!cleanName) {
      setNotice('Nhập nickname trước khi tạo phòng.');
      return;
    }
    if (!Number.isInteger(settings.questionCount) || settings.questionCount < 1 || settings.questionCount > maxQuestionCount) {
      setNotice(`Chọn từ 1 đến ${maxQuestionCount} câu phù hợp với cấu hình này.`);
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const uid = await ensureUid();
      localStorage.setItem('raku-arena-nickname', cleanName);
      const normalizedSettings = { ...settings };
      if (normalizedSettings.source !== 'jlpt') delete normalizedSettings.jlptLevel;
      const result = await createArenaRoom({
        uid,
        nickname: cleanName,
        settings: normalizedSettings,
        words: selectedWords
      });
      setRoomCodeInput(result.roomCode);
      setRoomId(result.roomId);
      setSessionEnded('');
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const enterRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = nickname.trim().replace(/\s+/gu, ' ').slice(0, 20);
    if (!cleanName) {
      setNotice('Nhập nickname trước khi vào phòng.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const uid = await ensureUid();
      localStorage.setItem('raku-arena-nickname', cleanName);
      const joinedRoomId = await joinArenaRoom(roomCodeInput, uid, cleanName);
      setRoomId(joinedRoomId);
      setSessionEnded('');
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const returnHome = () => {
    setRoomId(null);
    setSessionEnded('');
    setNotice('');
    setRoomCodeInput('');
    const url = new URL(window.location.href);
    url.searchParams.delete('arena');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const exitRoom = async () => {
    if (!room || !sessionUid || !roomId) return;
    setBusy(true);
    try {
      if (isHost) {
        await closeArenaRoom(roomId, sessionUid);
      } else {
        await leaveArenaRoom(roomId, sessionUid);
      }
      returnHome();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setNotice('Không thể sao chép link trên thiết bị này. Hãy nhập mã phòng để mời bạn.');
    }
  };

  const submitAnswer = async (answer: string) => {
    const questionId = room?.activeQuestionId;
    if (!roomId || !sessionUid || !questionId || submitLockRef.current === questionId
      || hasSubmitted || timeLeft <= 0 || submitPending) return;
    if (localPlayer?.status !== 'active') {
      setNotice('Bạn đã mất kết nối khỏi phòng.');
      return;
    }
    if (!navigator.onLine) {
      setNotice('Mất kết nối mạng. Đáp án chưa được gửi.');
      return;
    }
    if (auth.currentUser?.uid !== sessionUid) {
      setSessionEnded('Phiên đăng nhập đã thay đổi. Hãy vào lại phòng để tiếp tục.');
      setRoomId(null);
      return;
    }
    submitLockRef.current = questionId;
    setSubmitPending(true);
    setSubmittedQuestionId(questionId);
    setNotice('');
    try {
      await submitArenaAnswer(roomId, questionId, sessionUid, answer);
    } catch (error) {
      if (isPermissionDenied(error)) {
        try {
          const submissionState = await getArenaSubmissionState(roomId, questionId, sessionUid);
          if (submissionState.answer) {
            setNotice('Đáp án đã được ghi nhận.');
            return;
          }
          if (submissionState.playerStatus !== 'active') {
            setSessionEnded('Bạn đã mất kết nối khỏi phòng. Vào lại bằng cùng tài khoản nếu phiên còn hoạt động.');
            setRoomId(null);
            return;
          }
          if (submissionState.roomStatus !== 'question' || submissionState.activeQuestionId !== questionId) {
            setNotice('Câu hỏi đã kết thúc. Đáp án chưa được ghi nhận.');
            return;
          }
          setNotice('Không thể gửi đáp án lúc này. Vui lòng thử lại.');
        } catch {
          setNotice('Không thể xác nhận trạng thái đáp án. Kiểm tra kết nối rồi thử lại.');
        }
      } else {
        setNotice(errorText(error));
      }
      if (timeLeft > 0) setSubmittedQuestionId(null);
    } finally {
      if (submitLockRef.current === questionId) submitLockRef.current = null;
      setSubmitPending(false);
    }
  };

  const startGame = async () => {
    if (!roomId || !sessionUid) return;
    setBusy(true);
    setNotice('');
    try {
      await startArenaGame(roomId, sessionUid);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const rematch = async () => {
    if (!room || !isHost || !sessionUid) {
      returnHome();
      setShowCreate(true);
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const words = selectArenaWords(cards, decks, room.settings.source, room.settings.jlptLevel);
      const result = await createArenaRoom({
        uid: sessionUid,
        nickname: room.hostNickname,
        settings: room.settings,
        words
      });
      setRoomCodeInput(result.roomCode);
      setRoomId(result.roomId);
      setSessionEnded('');
    } catch (error) {
      const message = errorText(error);
      returnHome();
      setShowCreate(true);
      setNotice(message);
    } finally {
      setBusy(false);
    }
  };

  if (sessionEnded) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-raku-line bg-raku-surface p-6 text-center shadow-sm sm:p-8" aria-live="polite">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-raku-signal/10 text-raku-signal">
          <DoorOpen className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-raku-ink">Phòng đã kết thúc</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-raku-muted">{sessionEnded}</p>
        <ArenaButton onClick={returnHome} className="mt-6 w-full">Về trang Đấu trường</ArenaButton>
      </section>
    );
  }

  if (room && roomId) {
    const currentQuestionIndex = room.activeQuestionIndex + 1;
    const displayOption = (optionId: string) => question?.choices?.find((choice) => choice.id === optionId)?.text || optionId;
    const rankablePlayers = rankArenaPlayers(players.map((player) => ({
      ...player,
      totalCorrectResponseMs: player.totalCorrectResponseMs
    })));

    if (room.status === 'finished') {
      const winner = rankablePlayers[0];
      return (
        <section className="mx-auto max-w-3xl space-y-5" aria-live="polite">
          <div className="relative overflow-hidden rounded-3xl border border-raku-line bg-raku-surface p-6 shadow-sm sm:p-8">
            <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-raku-signal/5" />
            <div className="relative mx-auto max-w-xl text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-raku-accent-soft text-raku-accent"><Trophy className="h-8 w-8" /></span>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-raku-accent">Trận đấu đã khép lại</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-raku-ink">{winner ? `${winner.nickname} dẫn đầu!` : 'Cảm ơn đã tham gia!'}</h2>
              <p className="mt-2 text-sm leading-6 text-raku-muted">Mỗi câu trả lời đúng là một bước tiến. Hẹn gặp lại bạn ở ván tiếp theo.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {rankablePlayers.slice(0, 3).map((player, index) => (
              <div key={player.uid} className={`rounded-2xl border p-4 ${index === 0 ? 'border-raku-signal/30 bg-raku-signal/5 sm:-translate-y-1' : 'border-raku-line bg-raku-surface'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-raku-muted">Hạng {index + 1}</span>
                  {index === 0 && <Crown className="h-4 w-4 text-raku-signal" />}
                </div>
                <p className="mt-3 truncate text-lg font-bold text-raku-ink">{player.nickname}</p>
                <p className="mt-1 font-mono text-lg font-bold text-raku-accent">{player.score.toLocaleString('vi-VN')} <span className="font-sans text-xs font-semibold">điểm</span></p>
              </div>
            ))}
          </div>
          <section className="rounded-2xl border border-raku-line bg-raku-surface p-4 sm:p-5" aria-labelledby="arena-final-rank-title">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h3 id="arena-final-rank-title" className="font-bold text-raku-ink">Bảng xếp hạng</h3><p className="mt-1 text-xs text-raku-muted">Tổng điểm và số câu đúng trong ván này</p></div>
              <span className="rounded-full bg-raku-accent-soft px-3 py-1 text-xs font-semibold text-raku-accent">{room.questionCount} câu</span>
            </div>
            <ol className="space-y-2">
              {rankablePlayers.map((player, index) => (
                <li key={player.uid} className="flex items-center gap-3 rounded-xl bg-raku-canvas px-3 py-2.5">
                  <span className="w-7 font-mono text-sm font-bold text-raku-muted">{String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-raku-ink">{player.nickname}{player.uid === sessionUid ? ' · Bạn' : ''}</span>
                  <span className="text-right"><span className="block font-mono text-sm font-bold text-raku-ink">{player.score.toLocaleString('vi-VN')}</span><span className="text-xs text-raku-muted">{player.correctCount}/{room.questionCount} đúng</span></span>
                </li>
              ))}
            </ol>
          </section>
          <ArenaButton onClick={() => void rematch()} disabled={busy} className="w-full">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{isHost ? 'Tái đấu · tạo phòng mới' : 'Về trang Đấu trường'}</ArenaButton>
        </section>
      );
    }

    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-raku-accent-soft text-raku-accent"><Swords className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="truncate text-xs font-semibold text-raku-muted">ĐẤU TRƯỜNG · {room.roomCode}</p><h2 className="truncate text-lg font-bold text-raku-ink">{room.status === 'lobby' ? 'Phòng chờ' : `Câu ${currentQuestionIndex} / ${room.questionCount}`}</h2></div>
          </div>
          <ArenaButton onClick={() => void exitRoom()} disabled={busy} variant="secondary" className="min-h-11 shrink-0 px-3 py-2 text-xs"><DoorOpen className="h-4 w-4" />{isHost ? 'Đóng phòng' : 'Rời phòng'}</ArenaButton>
        </div>

        {notice && <p role="alert" className="rounded-xl border border-raku-signal/25 bg-raku-signal/5 px-4 py-3 text-sm text-raku-signal">{notice}</p>}
        {isHost && ['countdown', 'question', 'reveal'].includes(room.status) && (
          <p className="rounded-xl border border-raku-accent/20 bg-raku-accent-soft/60 px-4 py-3 text-sm leading-5 text-raku-accent">
            Giữ tab Đấu trường mở trong suốt trận để đồng hồ và kết quả được cập nhật ổn định.
          </p>
        )}

        {room.status === 'lobby' && (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-3xl bg-[#243430] p-5 text-[#FFFCF5] shadow-sm sm:p-7">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#DCEBE0]"><Users className="h-4 w-4" /> Mời mọi người vào phòng</div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#BCC7BC]">Mã phòng</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="font-mono text-3xl font-bold tracking-[0.18em]">{room.roomCode}</p>
                <button onClick={() => void copyInviteLink()} aria-label="Sao chép link mời" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/15">
                  {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                </button>
              </div>
              <p className="mt-3 flex items-center gap-2 break-all text-xs leading-5 text-[#DCEBE0]"><Link2 className="h-4 w-4 shrink-0" />{inviteLink}</p>
              <div className="mt-5 flex items-center justify-between rounded-xl bg-white/10 px-4 py-3 text-sm"><span className="text-[#DCEBE0]">Người chơi</span><span className="font-bold">{activePlayers.length} / {ARENA_MAX_PLAYERS}</span></div>
              {isHost ? (
                <ArenaButton onClick={() => void startGame()} disabled={busy || activePlayers.length < 2} className="mt-4 w-full bg-[#DCEBE0] text-[#243430] hover:bg-white disabled:bg-white/20 disabled:text-white/60">
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {activePlayers.length < 2 ? 'Chờ thêm người chơi' : 'Bắt đầu trận'}
                </ArenaButton>
              ) : <p className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-center text-sm text-[#DCEBE0]">Đã vào phòng. Chủ phòng sẽ bắt đầu ngay.</p>}
            </section>
            <section className="rounded-3xl border border-raku-line bg-raku-surface p-4 sm:p-5" aria-labelledby="arena-lobby-player-title">
              <div className="mb-4 flex items-center justify-between"><h3 id="arena-lobby-player-title" className="font-bold text-raku-ink">Người chơi</h3><span className="rounded-full bg-raku-accent-soft px-3 py-1 text-xs font-semibold text-raku-accent">{activePlayers.length} đang chờ</span></div>
              <ArenaPlayerList players={players} hostUid={room.hostUid} />
            </section>
          </div>
        )}

        {room.status === 'countdown' && (
          <section className="rounded-3xl border border-raku-line bg-raku-surface px-5 py-12 text-center shadow-sm sm:py-16">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-raku-accent">Câu {currentQuestionIndex} sắp bắt đầu</p>
            <div className="mx-auto mt-5 flex h-36 w-36 items-center justify-center rounded-full border-[6px] border-raku-accent/20 bg-raku-accent-soft sm:h-44 sm:w-44">
              <span key={countdownNumber} aria-live="polite" aria-atomic="true" className="font-mono text-7xl font-bold text-raku-accent sm:text-8xl">{countdownNumber}</span>
            </div>
            <p className="mt-5 text-sm text-raku-muted">Cùng nhìn màn hình — câu hỏi sẽ xuất hiện cho tất cả người chơi.</p>
          </section>
        )}

        {room.status === 'question' && (
          <div className="space-y-4">
            <section className="rounded-3xl border border-raku-line bg-raku-surface p-4 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-raku-muted"><span className="rounded-full bg-raku-accent-soft px-3 py-1 text-raku-accent">Câu {currentQuestionIndex}/{room.questionCount}</span><span className="hidden sm:inline">{question?.type === 'vi-to-jp' ? 'Tiếng Việt → từ vựng' : question?.type === 'jp-to-reading' ? 'Từ vựng → cách đọc' : 'Từ vựng → nghĩa'}</span></div>
                <div className={`flex h-12 min-w-16 items-center justify-center gap-1 rounded-xl px-3 font-mono text-lg font-bold ${timeLeft <= 5 ? 'bg-raku-signal/10 text-raku-signal' : 'bg-raku-canvas text-raku-ink'}`} aria-label={`Còn ${timeLeft} giây`} aria-live="off"><Clock3 className="h-4 w-4" />{timeLeft}<span className="font-sans text-xs">s</span></div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-raku-subtle"><div className={`h-full rounded-full transition-[width] duration-200 ${timeLeft <= 5 ? 'bg-raku-signal' : 'bg-raku-accent'}`} style={{ width: `${timeProgress}%` }} /></div>
              <div className="px-1 py-8 text-center sm:py-10">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-raku-muted">{question?.type === 'vi-to-jp' ? 'Chọn từ tiếng Nhật đúng' : 'Hãy nhập đáp án của bạn'}</p>
                <h3 className="mx-auto mt-3 max-w-2xl text-3xl font-bold tracking-tight text-raku-ink">{question?.prompt || 'Đang tải câu hỏi…'}</h3>
              </div>
              {!question ? <div className="flex justify-center py-5"><LoaderCircle className="h-6 w-6 animate-spin text-raku-accent" /></div> : question.type === 'vi-to-jp' ? (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {question.choices?.map((choice, index) => {
                    const isCorrect = reveal?.correctChoiceId === choice.id;
                    const isOwnWrong = ownAnswer?.answer === choice.id && reveal && !isCorrect;
                    return <button key={choice.id} disabled={hasSubmitted || submitPending || timeLeft <= 0} onClick={() => void submitAnswer(choice.id)} className={`flex min-h-[4.25rem] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:cursor-default disabled:opacity-75 ${reveal && isCorrect ? 'border-raku-accent bg-raku-accent-soft ring-2 ring-raku-accent/20' : isOwnWrong ? 'border-raku-signal bg-raku-signal/5' : 'border-raku-line bg-raku-canvas hover:border-raku-accent/50 hover:bg-raku-accent-soft/50'}`}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-raku-line bg-raku-surface font-mono text-sm font-bold text-raku-muted">{String.fromCharCode(65 + index)}</span><span className="min-w-0 flex-1 text-lg font-semibold text-raku-ink">{choice.text}</span>{reveal && isCorrect && <Check className="h-5 w-5 text-raku-accent" />}
                    </button>;
                  })}
                </div>
              ) : (
                <form onSubmit={(event) => { event.preventDefault(); void submitAnswer(draftAnswer); }} className="space-y-3">
                  <ArenaField label={question.type === 'jp-to-reading' ? 'Cách đọc (Hiragana hoặc Katakana)' : 'Nghĩa tiếng Việt'}>
                    <input
                      autoComplete="off"
                      autoCapitalize="off"
                      value={draftAnswer}
                      onChange={(event) => setDraftAnswer(event.target.value)}
                      onFocus={(event) => { const target = event.currentTarget; window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250); }}
                      disabled={hasSubmitted || submitPending || timeLeft <= 0}
                      maxLength={240}
                      placeholder={question.type === 'jp-to-reading' ? 'Ví dụ: べんきょう' : 'Nhập nghĩa của từ'}
                      className="min-h-14 scroll-mt-28 rounded-2xl border border-raku-line bg-raku-canvas px-4 text-lg text-raku-ink placeholder:text-raku-muted/70 disabled:opacity-60"
                    />
                  </ArenaField>
                  <ArenaButton type="submit" disabled={!draftAnswer.trim() || hasSubmitted || submitPending || timeLeft <= 0} className="w-full sm:w-auto sm:min-w-48">
                    {submitPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Gửi đáp án
                  </ArenaButton>
                </form>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-raku-line pt-4 text-xs text-raku-muted">
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{isHost ? `${activeAnsweredCount} / ${activePlayers.length} đã trả lời` : `${activePlayers.length} người đang chơi`}</span>
                <span role="status" aria-live="polite" aria-atomic="true" className="font-semibold text-raku-accent">{hasSubmitted ? 'Đáp án đã khóa' : timeLeft <= 0 ? 'Đang chốt đáp án…' : 'Chưa gửi đáp án'}</span>
              </div>
            </section>
          </div>
        )}

        {room.status === 'reveal' && reveal?.questionId === room.activeQuestionId && (
          <section className="space-y-4" aria-live="polite">
            <div className="rounded-3xl border border-raku-accent/25 bg-raku-accent-soft/50 p-5 sm:p-7">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-raku-accent"><Check className="h-4 w-4" /> Đáp án đã được chốt</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div><p className="text-xs font-semibold text-raku-muted">Đáp án đúng</p><p className="mt-1 text-3xl font-bold text-raku-ink">{reveal.correctAnswer}</p><p className="mt-2 text-sm leading-6 text-raku-muted">{reveal.explanationVi}</p></div>
                <div className="rounded-2xl bg-raku-surface px-5 py-4 sm:min-w-36 sm:text-right"><p className="text-xs font-semibold text-raku-muted">Điểm câu này</p><p className="mt-1 font-mono text-3xl font-bold text-raku-accent">+{ownResult?.points ?? 0}</p></div>
              </div>
              {ownResult?.submittedAnswer && <p className="mt-4 rounded-xl bg-raku-surface/70 px-4 py-3 text-sm text-raku-muted">Bạn trả lời: <span className="font-semibold text-raku-ink">{question?.type === 'vi-to-jp' ? displayOption(ownResult.submittedAnswer) : ownResult.submittedAnswer}</span>{ownResult.isCorrect ? ' · Chính xác' : ' · Chưa đúng'}</p>}
              {!ownResult?.submittedAnswer && <p className="mt-4 rounded-xl bg-raku-surface/70 px-4 py-3 text-sm text-raku-muted">Bạn chưa gửi đáp án ở câu này.</p>}
            </div>
            <section className="rounded-2xl border border-raku-line bg-raku-surface p-4 sm:p-5" aria-labelledby="arena-question-rank-title">
              <div className="mb-4 flex items-center justify-between gap-3"><div><h3 id="arena-question-rank-title" className="font-bold text-raku-ink">Bảng xếp hạng</h3><p className="mt-1 text-xs text-raku-muted">Câu tiếp theo sau vài giây…</p></div><span className="rounded-full bg-raku-accent-soft px-3 py-1 text-xs font-semibold text-raku-accent">Câu {currentQuestionIndex}</span></div>
              <ol className="space-y-2">
                {reveal.rankings.map((player) => <li key={player.uid} className="flex items-center gap-3 rounded-xl bg-raku-canvas px-3 py-2.5"><span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${player.rank === 1 ? 'bg-raku-signal/10 text-raku-signal' : 'bg-raku-subtle text-raku-muted'}`}>{player.rank}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold text-raku-ink">{player.nickname}{player.uid === sessionUid ? ' · Bạn' : ''}</span><span className="text-right"><span className="block font-mono text-sm font-bold text-raku-ink">{player.totalScore.toLocaleString('vi-VN')}</span><span className="text-xs text-raku-muted">{player.correctCount} câu đúng</span></span></li>)}
              </ol>
            </section>
          </section>
        )}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-[#243430] p-5 text-[#FFFCF5] shadow-sm sm:p-8 lg:p-10">
        <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full border-[28px] border-white/5" />
        <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#DCEBE0]"><Swords className="h-4 w-4" /> HỌC CÙNG NHAU · TIẾN BỘ CÙNG NHAU</div>
            <h2 className="mt-5 text-3xl font-bold tracking-tight">Đấu trường từ vựng</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#DCEBE0]">Tạo phòng, mời bạn bè và cùng ôn từ tiếng Nhật theo thời gian thực. Mỗi phòng tối đa 8 người.</p>
          </div>
          <div className="hidden h-24 w-24 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-[#DCEBE0] sm:flex"><Trophy className="h-11 w-11" /></div>
        </div>
      </div>

      {notice && <p role="alert" className="rounded-xl border border-raku-signal/25 bg-raku-signal/5 px-4 py-3 text-sm text-raku-signal">{notice}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-raku-line bg-raku-surface p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-raku-accent-soft text-raku-accent"><Crown className="h-5 w-5" /></span><div><h3 className="text-lg font-bold text-raku-ink">Tạo phòng mới</h3><p className="mt-1 text-sm leading-5 text-raku-muted">Chọn bộ từ, cài thời gian rồi gửi mã mời cho nhóm.</p></div></div>
          {!showCreate ? <ArenaButton onClick={() => setShowCreate(true)} className="mt-5 w-full">Thiết lập phòng</ArenaButton> : (
            <form onSubmit={(event) => void createRoom(event)} className="mt-5 space-y-4">
              <ArenaField label="Nickname"><input required maxLength={20} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Tên mọi người sẽ thấy" className="min-h-12 rounded-xl border border-raku-line bg-raku-canvas px-3 text-sm text-raku-ink placeholder:text-raku-muted/70" /></ArenaField>
              <ArenaField label="Nguồn từ vựng"><ArenaSelect value={settings.source} onChange={(value) => setSettings((current) => ({ ...current, source: value as ArenaWordSource, jlptLevel: value === 'jlpt' ? current.jlptLevel || 'N5' : current.jlptLevel }))}>{sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</ArenaSelect></ArenaField>
              {settings.source === 'jlpt' && <ArenaField label="Cấp độ"><ArenaSelect value={settings.jlptLevel || 'N5'} onChange={(value) => setSettings((current) => ({ ...current, jlptLevel: value as JlptLevel }))}>{(['N5', 'N4', 'N3', 'N2', 'N1'] as const).map((level) => <option key={level} value={level}>{level}</option>)}</ArenaSelect></ArenaField>}
              <div className="grid grid-cols-2 gap-3">
                <ArenaField label={`Số câu (tối đa ${ARENA_MAX_QUESTIONS})`}><input type="number" min={1} max={Math.max(1, maxQuestionCount)} step={1} value={settings.questionCount} onChange={(event) => setSettings((current) => ({ ...current, questionCount: Number(event.target.value) }))} className="min-h-12 w-full rounded-xl border border-raku-line bg-raku-canvas px-3 text-sm text-raku-ink" /></ArenaField>
                <ArenaField label="Thời gian"><ArenaSelect value={String(settings.timeLimitSeconds)} onChange={(value) => setSettings((current) => ({ ...current, timeLimitSeconds: Number(value) as ArenaSettings['timeLimitSeconds'] }))}>{ARENA_TIME_LIMITS.map((seconds) => <option key={seconds} value={seconds}>{seconds} giây</option>)}</ArenaSelect></ArenaField>
              </div>
              <ArenaField label="Dạng câu hỏi"><ArenaSelect value={settings.questionMode} onChange={(value) => setSettings((current) => ({ ...current, questionMode: value as ArenaQuestionMode }))}>{modeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</ArenaSelect></ArenaField>
              <div className="flex items-start gap-2 rounded-xl bg-raku-canvas px-3 py-3 text-xs leading-5 text-raku-muted"><BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-raku-accent" /><span>Có <strong className="text-raku-ink">{availableCount}</strong> từ phù hợp. Mỗi từ chỉ xuất hiện một lần trong ván.</span></div>
              {availableCount === 0 && <p className="text-xs leading-5 text-raku-signal">Chưa có từ phù hợp. Hãy chọn nguồn khác hoặc thêm từ vào bộ thẻ.</p>}
              {availableCount > 0 && settings.questionCount > maxQuestionCount && <p className="text-xs leading-5 text-raku-signal">Mỗi phòng tối đa {ARENA_MAX_QUESTIONS} câu và không vượt quá số từ hợp lệ.</p>}
              <div className="flex gap-2 pt-1"><ArenaButton type="submit" disabled={busy || availableCount === 0 || !Number.isInteger(settings.questionCount) || settings.questionCount < 1 || settings.questionCount > maxQuestionCount} className="flex-1">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}Tạo phòng</ArenaButton><ArenaButton onClick={() => setShowCreate(false)} variant="secondary" disabled={busy}>Hủy</ArenaButton></div>
            </form>
          )}
        </section>

        <section className="rounded-3xl border border-raku-line bg-raku-surface p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-raku-signal/10 text-raku-signal"><Users className="h-5 w-5" /></span><div><h3 className="text-lg font-bold text-raku-ink">Vào phòng bạn bè</h3><p className="mt-1 text-sm leading-5 text-raku-muted">Nhập mã 6 ký tự hoặc mở link mời để tham gia.</p></div></div>
          <form onSubmit={(event) => void enterRoom(event)} className="mt-5 space-y-4">
            <ArenaField label="Nickname"><input required maxLength={20} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Tên mọi người sẽ thấy" className="min-h-12 rounded-xl border border-raku-line bg-raku-canvas px-3 text-sm text-raku-ink placeholder:text-raku-muted/70" /></ArenaField>
            <ArenaField label="Mã phòng"><input required minLength={6} maxLength={6} value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase().replace(/\s/gu, ''))} placeholder="VD: 7K2MP9" autoCapitalize="characters" className="min-h-14 rounded-xl border border-raku-line bg-raku-canvas px-4 font-mono text-3xl font-bold tracking-[0.18em] text-raku-ink placeholder:text-raku-muted/50" /></ArenaField>
            <ArenaButton type="submit" disabled={busy || roomCodeInput.trim().length !== 6} variant="secondary" className="w-full">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4 rotate-180" />}Vào phòng</ArenaButton>
          </form>
          <p className="mt-4 flex items-start gap-2 border-t border-raku-line pt-4 text-xs leading-5 text-raku-muted"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" />Không cần đăng nhập Google. Dùng nickname để chơi cùng nhóm.</p>
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[['2–8', 'người mỗi phòng'], ['4 dạng', 'trắc nghiệm và tự nhập'], ['10 giây', 'mặc định mỗi câu']].map(([value, label]) => <div key={label} className="rounded-2xl border border-raku-line bg-raku-surface px-4 py-4"><p className="font-mono text-lg font-bold text-raku-accent">{value}</p><p className="mt-1 text-xs text-raku-muted">{label}</p></div>)}
      </div>
      <p className="px-1 text-center text-xs text-raku-muted">Mỗi đáp án bị khóa ngay sau khi gửi. Kết quả chỉ hiện khi cả nhóm đã trả lời hoặc hết giờ.</p>
    </section>
  );
}
