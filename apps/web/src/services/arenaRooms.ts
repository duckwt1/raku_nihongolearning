import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Word } from '@raku/core';
import {
  ARENA_COUNTDOWN_MS,
  ARENA_MAX_PLAYERS,
  ARENA_MAX_QUESTIONS,
  ARENA_SUBMISSION_GRACE_MS,
  ARENA_REVEAL_MS,
  calculateArenaScore,
  generateArenaQuiz,
  gradeArenaAnswer,
  rankArenaPlayers,
  type ArenaAnswerKey,
  type ArenaQuestion,
  type ArenaQuestionMode,
  type ArenaQuestionType,
  type ArenaSettings
} from '@raku/core';

export type ArenaRoomStatus =
  | 'preparing'
  | 'lobby'
  | 'countdown'
  | 'question'
  | 'reveal'
  | 'finished'
  | 'closed';

export type ArenaPlayerStatus = 'active' | 'left';

export interface ArenaRoom {
  roomId: string;
  roomCode: string;
  hostUid: string;
  hostNickname: string;
  status: ArenaRoomStatus;
  settings: ArenaSettings;
  questionCount: number;
  playerCount: number;
  hasHadGuest: boolean;
  activeQuestionIndex: number;
  activeQuestionId: string | null;
  answeredCount: number;
  countdownStartedAt?: Timestamp | null;
  questionStartedAt?: Timestamp | null;
  hostHeartbeatAt?: Timestamp | null;
  revealedAt?: Timestamp | null;
  closedReason?: string;
  expiresAt: Timestamp;
  createdAt?: Timestamp;
}

export interface ArenaPlayer {
  uid: string;
  nickname: string;
  status: ArenaPlayerStatus;
  score: number;
  correctCount: number;
  totalCorrectResponseMs: number;
  answeredQuestionId: string | null;
  lastSeenAt?: Timestamp;
  joinedAt?: Timestamp;
  leftAt?: Timestamp;
}

export interface ArenaAnswer {
  answer: string;
  submittedAt?: Timestamp;
}

export class ArenaSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArenaSubmissionError';
  }
}

export interface ArenaSubmissionState {
  roomStatus: ArenaRoomStatus | null;
  activeQuestionId: string | null;
  playerStatus: ArenaPlayerStatus | null;
  answer: ArenaAnswer | null;
}

export interface ArenaQuestionResult {
  uid: string;
  nickname: string;
  status: ArenaPlayerStatus;
  submittedAnswer: string | null;
  isCorrect: boolean;
  points: number;
  responseTimeMs: number | null;
  totalScore: number;
  correctCount: number;
  totalCorrectResponseMs: number;
  rank: number;
}

export interface ArenaReveal {
  questionId: string;
  questionIndex: number;
  questionType: ArenaQuestionType;
  correctAnswer: string;
  correctChoiceId?: string;
  acceptedAnswers: string[];
  readings: string[];
  meanings: string[];
  explanationVi: string;
  results: ArenaQuestionResult[];
  rankings: Array<Pick<ArenaQuestionResult, 'uid' | 'nickname' | 'status' | 'totalScore' | 'correctCount' | 'rank'>>;
  expiresAt: Timestamp;
}

export interface CreateArenaRoomInput {
  uid: string;
  nickname: string;
  settings: ArenaSettings;
  words: Word[];
}

const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 6;
const ROOM_RETENTION_HOURS = 24;
const MAX_BATCH_OPERATIONS = 400;

class ArenaRoomCodeCollision extends Error {}

function arenaRoomsCollection() {
  return collection(db, 'arenaRooms');
}

function roomRef(roomId: string) {
  return doc(db, 'arenaRooms', roomId);
}

function playersCollection(roomId: string) {
  return collection(db, 'arenaRooms', roomId, 'players');
}

function playerRef(roomId: string, uid: string) {
  return doc(db, 'arenaRooms', roomId, 'players', uid);
}

function questionRef(roomId: string, questionId: string) {
  return doc(db, 'arenaRooms', roomId, 'questions', questionId);
}

function answerKeyRef(roomId: string, questionId: string) {
  return doc(db, 'arenaRooms', roomId, 'answerKeys', questionId);
}

function revealRef(roomId: string, questionId: string) {
  return doc(db, 'arenaRooms', roomId, 'reveals', questionId);
}

function answersCollection(roomId: string, questionId: string) {
  return collection(db, 'arenaRooms', roomId, 'questions', questionId, 'answers');
}

function answerRef(roomId: string, questionId: string, uid: string) {
  return doc(db, 'arenaRooms', roomId, 'questions', questionId, 'answers', uid);
}

function createRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}

function getExpireAt(): Timestamp {
  return Timestamp.fromMillis(Date.now() + ROOM_RETENTION_HOURS * 60 * 60 * 1_000);
}

function cleanNickname(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').slice(0, 20);
}

function playerDocument(uid: string, nickname: string, expiresAt: Timestamp): DocumentData {
  return {
    uid,
    nickname: cleanNickname(nickname),
    status: 'active',
    score: 0,
    correctCount: 0,
    totalCorrectResponseMs: 0,
    answeredQuestionId: null,
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    expiresAt
  };
}

export async function createArenaRoom(input: CreateArenaRoomInput): Promise<{ roomId: string; roomCode: string }> {
  const nickname = cleanNickname(input.nickname);
  if (!nickname) throw new Error('Nhập nickname trước khi tạo phòng.');

  const questionCount = Math.trunc(input.settings.questionCount);
  if (!Number.isFinite(input.settings.questionCount) || questionCount !== input.settings.questionCount
    || questionCount < 1 || questionCount > ARENA_MAX_QUESTIONS) {
    throw new Error(`Mỗi phòng cần có từ 1 đến ${ARENA_MAX_QUESTIONS} câu hỏi.`);
  }
  const settings: ArenaSettings = { ...input.settings, questionCount };
  const bundles = generateArenaQuiz(input.words, questionCount, settings.questionMode);
  const expiresAt = getExpireAt();
  const newRoomRef = doc(arenaRoomsCollection());
  const hostRef = playerRef(newRoomRef.id, input.uid);
  let roomCode = '';
  let committed = false;

  for (let attempt = 0; attempt < 8 && !committed; attempt++) {
    roomCode = createRoomCode();
    const codeRef = doc(db, 'arenaRoomCodes', roomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const existingCode = await transaction.get(codeRef);
        if (existingCode.exists()) throw new ArenaRoomCodeCollision();

        transaction.set(newRoomRef, {
          roomCode,
          hostUid: input.uid,
          hostNickname: nickname,
          status: 'preparing',
          settings: settings.jlptLevel
            ? settings
            : {
                source: settings.source,
                questionCount,
                timeLimitSeconds: settings.timeLimitSeconds,
                questionMode: settings.questionMode
              },
          questionCount: bundles.length,
          playerCount: 1,
          hasHadGuest: false,
          activeQuestionIndex: -1,
          activeQuestionId: null,
          answeredCount: 0,
          hostHeartbeatAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          expiresAt
        });
        transaction.set(codeRef, {
          roomId: newRoomRef.id,
          hostUid: input.uid,
          expiresAt
        });
        transaction.set(hostRef, playerDocument(input.uid, nickname, expiresAt));
      });
      committed = true;
    } catch (error) {
      if (!(error instanceof ArenaRoomCodeCollision)) throw error;
    }
  }

  if (!committed) throw new Error('Không tạo được mã phòng. Vui lòng thử lại.');

  try {
    for (let index = 0; index < bundles.length; index += MAX_BATCH_OPERATIONS / 2) {
      const batch = writeBatch(db);
      for (const bundle of bundles.slice(index, index + MAX_BATCH_OPERATIONS / 2)) {
        batch.set(questionRef(newRoomRef.id, bundle.question.id), {
          ...bundle.question,
          expiresAt
        });
        batch.set(answerKeyRef(newRoomRef.id, bundle.question.id), {
          ...bundle.answerKey,
          expiresAt
        });
      }
      await batch.commit();
    }
    await updateDoc(newRoomRef, { status: 'lobby' });
  } catch (error) {
    await updateDoc(newRoomRef, {
      status: 'closed',
      closedReason: 'setup_failed'
    }).catch(() => undefined);
    throw error;
  }

  return { roomId: newRoomRef.id, roomCode };
}

export async function joinArenaRoom(roomCodeInput: string, uid: string, nicknameInput: string): Promise<string> {
  const roomCode = roomCodeInput.trim().toUpperCase();
  const nickname = cleanNickname(nicknameInput);
  if (!/^[2-9A-HJ-NP-Z]{6}$/u.test(roomCode)) throw new Error('Mã phòng cần gồm 6 ký tự.');
  if (!nickname) throw new Error('Nhập nickname trước khi vào phòng.');

  const codeRef = doc(db, 'arenaRoomCodes', roomCode);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) throw new Error('Không tìm thấy phòng. Kiểm tra lại mã mời.');
  const roomId = String(codeSnap.data().roomId || '');
  if (!roomId) throw new Error('Mã phòng không hợp lệ.');

  await runTransaction(db, async (transaction) => {
    const roomDocument = await transaction.get(roomRef(roomId));
    const ownPlayer = await transaction.get(playerRef(roomId, uid));
    if (!roomDocument.exists()) throw new Error('Phòng đã kết thúc hoặc không còn tồn tại.');
    const room = roomDocument.data() as ArenaRoom;
    if (room.expiresAt.toMillis() <= Date.now()) throw new Error('Phòng đã hết hạn.');
    if (!['lobby', 'countdown', 'question', 'reveal'].includes(room.status)) {
      throw new Error('Phòng đã kết thúc hoặc đã đóng.');
    }
    if (ownPlayer.exists()) {
      const player = ownPlayer.data() as ArenaPlayer;
      if (player.status !== 'active') {
        throw new Error('Bạn đã rời phiên này nên không thể vào lại phòng.');
      }
      transaction.update(playerRef(roomId, uid), { lastSeenAt: serverTimestamp() });
      return;
    }
    if (room.status !== 'lobby') throw new Error('Phòng đã bắt đầu. Chỉ người chơi đã vào phòng mới có thể kết nối lại.');
    if (room.playerCount >= ARENA_MAX_PLAYERS) throw new Error('Phòng đã đủ 8 người.');

    transaction.set(playerRef(roomId, uid), playerDocument(uid, nickname, room.expiresAt));
    transaction.update(roomRef(roomId), { playerCount: room.playerCount + 1, hasHadGuest: true });
  });

  return roomId;
}

export function subscribeArenaRoom(
  roomId: string,
  onRoom: (room: ArenaRoom | null) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(roomRef(roomId), (snapshot) => {
    onRoom(snapshot.exists() ? ({ ...snapshot.data(), roomId: snapshot.id } as ArenaRoom) : null);
  }, onError);
}

export function subscribeArenaPlayers(
  roomId: string,
  onPlayers: (players: ArenaPlayer[]) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(query(playersCollection(roomId)), (snapshot) => {
    const players = snapshot.docs.map((item) => item.data() as ArenaPlayer);
    onPlayers(players.sort((left, right) =>
      (left.joinedAt?.toMillis() ?? 0) - (right.joinedAt?.toMillis() ?? 0)
    ));
  }, onError);
}

export function subscribeArenaQuestion(
  roomId: string,
  questionId: string,
  onQuestion: (question: ArenaQuestion | null) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(questionRef(roomId, questionId), (snapshot) => {
    onQuestion(snapshot.exists() ? (snapshot.data() as ArenaQuestion) : null);
  }, onError);
}

export function subscribeArenaAnswerKey(
  roomId: string,
  questionId: string,
  onAnswerKey: (answerKey: ArenaAnswerKey | null) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(answerKeyRef(roomId, questionId), (snapshot) => {
    onAnswerKey(snapshot.exists() ? (snapshot.data() as ArenaAnswerKey) : null);
  }, onError);
}

export function subscribeArenaQuestionAnswers(
  roomId: string,
  questionId: string,
  onAnswers: (answers: Array<ArenaAnswer & { uid: string }>) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(query(answersCollection(roomId, questionId)), (snapshot) => {
    onAnswers(snapshot.docs.map((item) => ({ ...item.data(), uid: item.id }) as ArenaAnswer & { uid: string }));
  }, onError);
}

export function subscribeArenaOwnAnswer(
  roomId: string,
  questionId: string,
  uid: string,
  onAnswer: (answer: ArenaAnswer | null) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(answerRef(roomId, questionId, uid), (snapshot) => {
    onAnswer(snapshot.exists() ? (snapshot.data() as ArenaAnswer) : null);
  }, onError);
}

export function subscribeArenaReveal(
  roomId: string,
  questionId: string,
  onReveal: (reveal: ArenaReveal | null) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(revealRef(roomId, questionId), (snapshot) => {
    onReveal(snapshot.exists() ? (snapshot.data() as ArenaReveal) : null);
  }, onError);
}

export async function submitArenaAnswer(
  roomId: string,
  questionId: string,
  uid: string,
  answer: string
): Promise<void> {
  const trimmed = answer.trim();
  if (!trimmed) throw new Error('Nhập hoặc chọn đáp án trước khi gửi.');
  if (trimmed.length > 240) throw new Error('Đáp án dài quá giới hạn.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new ArenaSubmissionError('Mất kết nối mạng. Đáp án chưa được gửi.');
  }
  if (auth.currentUser?.uid !== uid) {
    throw new ArenaSubmissionError('Phiên đăng nhập đã thay đổi. Hãy vào lại phòng để tiếp tục.');
  }

  await runTransaction(db, async (transaction) => {
    const currentRoomRef = roomRef(roomId);
    const currentPlayerRef = playerRef(roomId, uid);
    const [roomSnapshot, playerSnapshot] = await Promise.all([
      transaction.get(currentRoomRef),
      transaction.get(currentPlayerRef)
    ]);
    if (!roomSnapshot.exists()) throw new ArenaSubmissionError('Phòng không còn tồn tại.');
    if (!playerSnapshot.exists() || (playerSnapshot.data() as ArenaPlayer).status !== 'active') {
      throw new ArenaSubmissionError('Bạn đã mất kết nối khỏi phòng.');
    }

    const currentAnswerRef = answerRef(roomId, questionId, uid);
    const existingAnswer = await transaction.get(currentAnswerRef);
    if (existingAnswer.exists()) return;

    const room = roomSnapshot.data() as ArenaRoom;
    if (room.status !== 'question' || room.activeQuestionId !== questionId) {
      throw new ArenaSubmissionError('Câu hỏi đã kết thúc. Đáp án chưa được gửi.');
    }
    transaction.set(currentAnswerRef, {
      answer: trimmed,
      submittedAt: serverTimestamp(),
      expiresAt: room.expiresAt
    });
  });
}

export async function getArenaSubmissionState(
  roomId: string,
  questionId: string,
  uid: string
): Promise<ArenaSubmissionState> {
  const [roomSnapshot, playerSnapshot] = await Promise.all([
    getDoc(roomRef(roomId)),
    getDoc(playerRef(roomId, uid))
  ]);
  const room = roomSnapshot.exists() ? roomSnapshot.data() as ArenaRoom : null;
  const player = playerSnapshot.exists() ? playerSnapshot.data() as ArenaPlayer : null;
  const answerSnapshot = player?.status === 'active'
    ? await getDoc(answerRef(roomId, questionId, uid))
    : null;
  return {
    roomStatus: room?.status ?? null,
    activeQuestionId: room?.activeQuestionId ?? null,
    playerStatus: player?.status ?? null,
    answer: answerSnapshot?.exists() ? answerSnapshot.data() as ArenaAnswer : null
  };
}

export async function startArenaGame(roomId: string, hostUid: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef(roomId));
    if (!snapshot.exists()) throw new Error('Không tìm thấy phòng.');
    const room = snapshot.data() as ArenaRoom;
    if (room.hostUid !== hostUid) throw new Error('Chỉ chủ phòng mới có thể bắt đầu.');
    if (room.status !== 'lobby') throw new Error('Phòng không còn ở trạng thái chờ.');
    if (room.playerCount < 2) throw new Error('Cần ít nhất 2 người chơi để bắt đầu.');
    transaction.update(roomRef(roomId), {
      status: 'countdown',
      activeQuestionIndex: 0,
      activeQuestionId: 'q0',
      answeredCount: 0,
      countdownStartedAt: serverTimestamp(),
      questionStartedAt: null
    });
  });
}

export async function startArenaQuestion(
  roomId: string,
  hostUid: string,
  questionIndex: number,
  questionId: string
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef(roomId));
    if (!snapshot.exists()) return;
    const room = snapshot.data() as ArenaRoom;
    if (
      room.hostUid !== hostUid || room.status !== 'countdown' ||
      room.activeQuestionIndex !== questionIndex || room.activeQuestionId !== questionId
    ) return;
    transaction.update(roomRef(roomId), {
      status: 'question',
      questionStartedAt: serverTimestamp(),
      answeredCount: 0
    });
  });
}

export async function settleArenaQuestion(
  roomId: string,
  hostUid: string,
  questionId: string,
  force = false
): Promise<ArenaReveal | null> {
  // Membership is fixed once the lobby starts, so a bounded pre-read gives us
  // the player IDs. The transaction then reads each participant document and
  // their answer individually (the Web SDK transaction API does not read queries).
  const participantIds = (await getDocs(query(playersCollection(roomId)))).docs.map((snapshot) => snapshot.id);
  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef(roomId));
    if (!roomSnapshot.exists()) return null;
    const room = roomSnapshot.data() as ArenaRoom;
    if (
      room.hostUid !== hostUid || room.status !== 'question' ||
      room.activeQuestionId !== questionId || !room.questionStartedAt
    ) return null;

    const playerSnapshots = await Promise.all(participantIds.map((uid) => transaction.get(playerRef(roomId, uid))));
    const playerDocuments = playerSnapshots
      .filter((snapshot) => snapshot.exists())
      .map((snapshot) => ({ ref: playerRef(roomId, snapshot.id), player: snapshot.data() as ArenaPlayer }));
    const answerSnapshots = await Promise.all(playerDocuments.map(({ player }) =>
      transaction.get(answerRef(roomId, questionId, player.uid))
    ));
    const keySnapshot = await transaction.get(answerKeyRef(roomId, questionId));
    const questionSnapshot = await transaction.get(questionRef(roomId, questionId));
    if (!keySnapshot.exists() || !questionSnapshot.exists()) return null;

    const activeAnswers = playerDocuments
      .map(({ player }, index) => ({ player, answerSnapshot: answerSnapshots[index]! }))
      .filter(({ player }) => player.status === 'active');
    if (!force && activeAnswers.some(({ answerSnapshot }) => !answerSnapshot.exists())) return null;

    const answerKey = keySnapshot.data() as ArenaAnswerKey;
    const question = questionSnapshot.data() as ArenaQuestion;
    const questionStartMs = room.questionStartedAt.toMillis();
    const timeLimitMs = room.settings.timeLimitSeconds * 1_000;
    const updatedPlayers = playerDocuments.map(({ player }, index) => {
      const answerSnapshot = answerSnapshots[index]!;
      const answer = answerSnapshot.exists() ? answerSnapshot.data() as ArenaAnswer : null;
      const submittedAt = answer?.submittedAt?.toMillis();
      const responseTimeMs = submittedAt === undefined ? null : submittedAt - questionStartMs;
      const withinLimit = responseTimeMs !== null && responseTimeMs >= 0
        && responseTimeMs <= timeLimitMs + ARENA_SUBMISSION_GRACE_MS;
      const isCorrect = Boolean(
        answer && withinLimit && gradeArenaAnswer(question.type, answerKey, answer.answer)
      );
      const points = calculateArenaScore(isCorrect, responseTimeMs ?? -1, room.settings.timeLimitSeconds);
      const totalScore = player.score + points;
      const correctCount = player.correctCount + Number(isCorrect);
      const totalCorrectResponseMs = player.totalCorrectResponseMs + (isCorrect ? responseTimeMs! : 0);
      return {
        player,
        answer: answer?.answer ?? null,
        isCorrect,
        points,
        responseTimeMs,
        totalScore,
        correctCount,
        totalCorrectResponseMs
      };
    });

    const ranking = rankArenaPlayers(updatedPlayers.map((entry) => ({
      uid: entry.player.uid,
      nickname: entry.player.nickname,
      status: entry.player.status,
      score: entry.totalScore,
      correctCount: entry.correctCount,
      totalCorrectResponseMs: entry.totalCorrectResponseMs
    })));
    const rankByUid = new Map(ranking.map((entry, index) => [entry.uid, index + 1]));
    const results: ArenaQuestionResult[] = updatedPlayers.map((entry) => ({
      uid: entry.player.uid,
      nickname: entry.player.nickname,
      status: entry.player.status,
      submittedAnswer: entry.answer,
      isCorrect: entry.isCorrect,
      points: entry.points,
      responseTimeMs: entry.responseTimeMs,
      totalScore: entry.totalScore,
      correctCount: entry.correctCount,
      totalCorrectResponseMs: entry.totalCorrectResponseMs,
      rank: rankByUid.get(entry.player.uid) || updatedPlayers.length
    }));
    const reveal: ArenaReveal = {
      questionId,
      questionIndex: room.activeQuestionIndex,
      questionType: question.type,
      correctAnswer: answerKey.answer,
      ...(answerKey.correctChoiceId ? { correctChoiceId: answerKey.correctChoiceId } : {}),
      acceptedAnswers: answerKey.acceptedAnswers,
      readings: answerKey.readings,
      meanings: answerKey.meanings,
      explanationVi: answerKey.explanationVi,
      results,
      rankings: results
        .slice()
        .sort((left, right) => left.rank - right.rank)
        .map(({ uid, nickname, status, totalScore, correctCount, rank }) => ({
          uid, nickname, status, totalScore, correctCount, rank
        })),
      expiresAt: room.expiresAt
    };

    // All reads are complete. Only the host writes the computed scores and reveals the key.
    for (const entry of updatedPlayers) {
      transaction.update(playerRef(roomId, entry.player.uid), {
        score: entry.totalScore,
        correctCount: entry.correctCount,
        totalCorrectResponseMs: entry.totalCorrectResponseMs,
        answeredQuestionId: questionId
      });
    }
    transaction.set(revealRef(roomId, questionId), reveal);
    transaction.update(roomRef(roomId), {
      status: 'reveal',
      answeredCount: activeAnswers.filter(({ answerSnapshot }) => answerSnapshot.exists()).length,
      revealedAt: serverTimestamp()
    });
    return reveal;
  });
}

export async function advanceArenaGame(
  roomId: string,
  hostUid: string,
  currentQuestionIndex: number,
  questionCount: number
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef(roomId));
    if (!snapshot.exists()) return;
    const room = snapshot.data() as ArenaRoom;
    if (room.hostUid !== hostUid || room.status !== 'reveal' || room.activeQuestionIndex !== currentQuestionIndex) return;
    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex >= questionCount) {
      transaction.update(roomRef(roomId), { status: 'finished', finishedAt: serverTimestamp() });
      return;
    }
    transaction.update(roomRef(roomId), {
      status: 'question',
      activeQuestionIndex: nextIndex,
      activeQuestionId: `q${nextIndex}`,
      answeredCount: 0,
      countdownStartedAt: null,
      questionStartedAt: serverTimestamp()
    });
  });
}

export async function sendArenaHeartbeat(roomId: string, hostUid: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef(roomId));
    if (!snapshot.exists() || snapshot.data().hostUid !== hostUid) return;
    transaction.update(roomRef(roomId), { hostHeartbeatAt: serverTimestamp() });
  });
}

export interface ArenaStalePlayerCandidate {
  uid: string;
  lastSeenAtMillis: number;
}

/** Marks players offline only if their heartbeat has not changed since the host observed it. */
export async function removeStaleArenaPlayers(
  roomId: string,
  hostUid: string,
  candidates: ArenaStalePlayerCandidate[]
): Promise<void> {
  if (candidates.length === 0) return;
  await runTransaction(db, async (transaction) => {
    const currentRoomRef = roomRef(roomId);
    const roomSnapshot = await transaction.get(currentRoomRef);
    if (!roomSnapshot.exists()) return;
    const room = roomSnapshot.data() as ArenaRoom;
    if (room.hostUid !== hostUid || !['lobby', 'reveal'].includes(room.status)) return;

    const snapshots = await Promise.all(candidates.map((candidate) =>
      transaction.get(playerRef(roomId, candidate.uid))
    ));
    const staleRefs = snapshots.flatMap((snapshot, index) => {
      if (!snapshot.exists()) return [];
      const player = snapshot.data() as ArenaPlayer;
      const candidate = candidates[index]!;
      const lastSeenAtMillis = player.lastSeenAt?.toMillis() ?? player.joinedAt?.toMillis() ?? 0;
      return player.status === 'active' && lastSeenAtMillis === candidate.lastSeenAtMillis
        ? [playerRef(roomId, player.uid)]
        : [];
    });
    if (staleRefs.length === 0) return;

    const leftAt = serverTimestamp();
    for (const ref of staleRefs) transaction.update(ref, { status: 'left', leftAt });
    transaction.update(currentRoomRef, { playerCount: Math.max(1, room.playerCount - staleRefs.length) });
  });
}

export async function sendArenaPlayerHeartbeat(roomId: string, uid: string): Promise<void> {
  await updateDoc(playerRef(roomId, uid), { lastSeenAt: serverTimestamp() });
}

export async function closeArenaRoom(roomId: string, hostUid: string, reason = 'host_left'): Promise<void> {
  const snapshot = await getDoc(roomRef(roomId));
  if (!snapshot.exists() || snapshot.data().hostUid !== hostUid) return;
  await updateDoc(roomRef(roomId), {
    status: 'closed',
    closedReason: reason,
    closedAt: serverTimestamp()
  });
}

export async function leaveArenaRoom(roomId: string, uid: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef(roomId));
    const playerSnapshot = await transaction.get(playerRef(roomId, uid));
    if (!roomSnapshot.exists() || !playerSnapshot.exists()) return;
    const room = roomSnapshot.data() as ArenaRoom;
    const player = playerSnapshot.data() as ArenaPlayer;
    if (room.hostUid === uid || player.status === 'left') return;
    transaction.update(playerRef(roomId, uid), {
      status: 'left',
      leftAt: serverTimestamp()
    });
    transaction.update(roomRef(roomId), {
      playerCount: Math.max(1, room.playerCount - 1)
    });
  });
}

export async function closeArenaRoomIfOnlyHostRemains(
  roomId: string,
  hostUid: string,
  activePlayers: ArenaPlayer[]
): Promise<void> {
  if (activePlayers.filter((player) => player.status === 'active').length > 1) return;
  await closeArenaRoom(roomId, hostUid, 'all_guests_left');
}

export function arenaCountdownEndsAt(room: ArenaRoom): number | null {
  return room.countdownStartedAt ? room.countdownStartedAt.toMillis() + ARENA_COUNTDOWN_MS : null;
}

export function arenaQuestionEndsAt(room: ArenaRoom): number | null {
  return room.questionStartedAt
    ? room.questionStartedAt.toMillis() + room.settings.timeLimitSeconds * 1_000
    : null;
}

export function arenaRevealEndsAt(room: ArenaRoom): number | null {
  return room.revealedAt ? room.revealedAt.toMillis() + ARENA_REVEAL_MS : null;
}

export function asQuestionMode(value: string): ArenaQuestionMode {
  return value as ArenaQuestionMode;
}
