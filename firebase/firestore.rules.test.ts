import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore
} from 'firebase/firestore';

const projectId = 'demo-raku-arena-rules';
let testEnv: RulesTestEnvironment;

const roomId = 'arena-test-room';
const questionId = 'q0';
const hostUid = 'host-user';
const guestUid = 'guest-user';
const otherUid = 'other-user';

function paths(db: Firestore) {
  const room = doc(db, 'arenaRooms', roomId);
  const players = collection(db, 'arenaRooms', roomId, 'players');
  const answers = collection(db, 'arenaRooms', roomId, 'questions', questionId, 'answers');
  return {
    room,
    host: doc(players, hostUid),
    guest: doc(players, guestUid),
    other: doc(players, otherUid),
    answer: doc(answers, guestUid),
    otherAnswer: doc(answers, otherUid),
    answerKey: doc(db, 'arenaRooms', roomId, 'answerKeys', questionId),
    answers
  };
}

function modularFirestore(context: RulesTestContext): Firestore {
  // Rules Test Context exposes the compat Firestore type while the app and
  // assertions use modular Firestore helpers.
  return context.firestore() as unknown as Firestore;
}

async function seedRoom(status: 'question' | 'reveal' = 'question', startedAgoMs = 1_000) {
  const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1_000);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = modularFirestore(context);
    const refs = paths(db);
    await Promise.all([
      setDoc(refs.room, {
        roomCode: '7K2MP9',
        hostUid,
        hostNickname: 'Chủ phòng',
        status,
        settings: { source: 'all', questionCount: 1, timeLimitSeconds: 15, questionMode: 'mixed' },
        questionCount: 1,
        playerCount: 3,
        hasHadGuest: true,
        activeQuestionIndex: 0,
        activeQuestionId: questionId,
        answeredCount: 0,
        questionStartedAt: Timestamp.fromMillis(Date.now() - startedAgoMs),
        hostHeartbeatAt: Timestamp.fromMillis(Date.now()),
        createdAt: Timestamp.fromMillis(Date.now() - 5_000),
        expiresAt
      }),
      setDoc(refs.host, {
        uid: hostUid, nickname: 'Chủ phòng', status: 'active', score: 0, correctCount: 0,
        totalCorrectResponseMs: 0, answeredQuestionId: null, joinedAt: Timestamp.fromMillis(Date.now()), expiresAt
      }),
      setDoc(refs.guest, {
        uid: guestUid, nickname: 'Người chơi', status: 'active', score: 0, correctCount: 0,
        totalCorrectResponseMs: 0, answeredQuestionId: null, joinedAt: Timestamp.fromMillis(Date.now()), expiresAt
      }),
      setDoc(refs.other, {
        uid: otherUid, nickname: 'Bạn chơi', status: 'active', score: 0, correctCount: 0,
        totalCorrectResponseMs: 0, answeredQuestionId: null, joinedAt: Timestamp.fromMillis(Date.now()), expiresAt
      }),
      setDoc(doc(db, 'arenaRooms', roomId, 'questions', questionId), {
        id: questionId, index: 0, type: 'jp-to-reading', prompt: '勉強', surface: '勉強', expiresAt
      }),
      setDoc(refs.answerKey, {
        answer: 'べんきょう', acceptedAnswers: ['べんきょう'], readings: ['べんきょう'],
        meanings: ['học tập'], explanationVi: '勉強 đọc là べんきょう.', expiresAt
      })
    ]);
  });
}

async function writeAnswer(db: Firestore, uid: string, targetUid = uid) {
  const ref = doc(db, 'arenaRooms', roomId, 'questions', questionId, 'answers', targetUid);
  const room = await getDoc(doc(db, 'arenaRooms', roomId));
  return setDoc(ref, {
    answer: 'べんきょう',
    submittedAt: serverTimestamp(),
    expiresAt: room.data()!.expiresAt
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(fileURLToPath(new URL('./firestore.rules', import.meta.url)), 'utf8')
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Arena Firestore security rules', () => {
  it('keeps answer keys private to the host', async () => {
    await seedRoom();
    const guestDb = modularFirestore(testEnv.authenticatedContext(guestUid));
    const hostDb = modularFirestore(testEnv.authenticatedContext(hostUid));
    const guestKey = doc(guestDb, 'arenaRooms', roomId, 'answerKeys', questionId);
    const hostKey = doc(hostDb, 'arenaRooms', roomId, 'answerKeys', questionId);

    await assertFails(getDoc(guestKey));
    await assertSucceeds(getDoc(hostKey));
  });

  it('creates the room snapshot atomically and pairs guest joins with the player count', async () => {
    const hostDb = modularFirestore(testEnv.authenticatedContext(hostUid));
    const guestDb = modularFirestore(testEnv.authenticatedContext(guestUid));
    const createdRoomId = 'created-arena-room';
    const roomRef = doc(hostDb, 'arenaRooms', createdRoomId);
    const codeRef = doc(hostDb, 'arenaRoomCodes', '2ABC34');
    const hostRef = doc(hostDb, 'arenaRooms', createdRoomId, 'players', hostUid);
    const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1_000);

    await assertSucceeds(runTransaction(hostDb, async (transaction) => {
      transaction.set(roomRef, {
        roomCode: '2ABC34', hostUid, hostNickname: 'Chủ phòng', status: 'preparing',
        settings: { source: 'all', questionCount: 1, timeLimitSeconds: 15, questionMode: 'mixed' },
        questionCount: 1, playerCount: 1, hasHadGuest: false, activeQuestionIndex: -1,
        activeQuestionId: null, answeredCount: 0, hostHeartbeatAt: serverTimestamp(),
        createdAt: serverTimestamp(), expiresAt
      });
      transaction.set(codeRef, { roomId: createdRoomId, hostUid, expiresAt });
      transaction.set(hostRef, {
        uid: hostUid, nickname: 'Chủ phòng', status: 'active', score: 0, correctCount: 0,
        totalCorrectResponseMs: 0, answeredQuestionId: null, joinedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(), expiresAt
      });
    }));

    const questionRef = doc(hostDb, 'arenaRooms', createdRoomId, 'questions', 'q0');
    const keyRef = doc(hostDb, 'arenaRooms', createdRoomId, 'answerKeys', 'q0');
    await assertSucceeds(setDoc(questionRef, {
      id: 'q0', index: 0, type: 'jp-to-reading', prompt: '勉強', expiresAt
    }));
    await assertSucceeds(setDoc(keyRef, {
      answer: 'べんきょう', acceptedAnswers: ['べんきょう'], readings: ['べんきょう'],
      meanings: ['học tập'], explanationVi: '勉強 đọc là べんきょう.', expiresAt
    }));
    await assertSucceeds(updateDoc(roomRef, { status: 'lobby' }));

    const guestRoomRef = doc(guestDb, 'arenaRooms', createdRoomId);
    const guestRef = doc(guestDb, 'arenaRooms', createdRoomId, 'players', guestUid);
    await assertSucceeds(runTransaction(guestDb, async (transaction) => {
      const roomSnapshot = await transaction.get(guestRoomRef);
      const ownPlayer = await transaction.get(guestRef);
      expect(ownPlayer.exists()).toBe(false);
      transaction.set(guestRef, {
        uid: guestUid, nickname: 'Người chơi', status: 'active', score: 0, correctCount: 0,
        totalCorrectResponseMs: 0, answeredQuestionId: null, joinedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(), expiresAt
      });
      transaction.update(guestRoomRef, {
        playerCount: roomSnapshot.data()!.playerCount + 1,
        hasHadGuest: true
      });
    }));

    await assertFails(getDoc(doc(guestDb, 'arenaRooms', createdRoomId, 'answerKeys', 'q0')));
    await assertFails(runTransaction(guestDb, async (transaction) => {
      const roomSnapshot = await transaction.get(guestRoomRef);
      transaction.set(guestRef, {
        uid: guestUid, nickname: 'Người chơi', status: 'active', score: 0, correctCount: 0,
        totalCorrectResponseMs: 0, answeredQuestionId: null, joinedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(), expiresAt
      });
      transaction.update(guestRoomRef, {
        playerCount: roomSnapshot.data()!.playerCount + 1,
        hasHadGuest: true
      });
    }));
  });

  it('lets a player read only their own answer until the reveal', async () => {
    await seedRoom();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const refs = paths(modularFirestore(context));
      await Promise.all([
        setDoc(refs.answer, { answer: 'べんきょう', submittedAt: Timestamp.fromMillis(Date.now()), expiresAt: (await getDoc(refs.room)).data()!.expiresAt }),
        setDoc(refs.otherAnswer, { answer: 'べんきょう', submittedAt: Timestamp.fromMillis(Date.now()), expiresAt: (await getDoc(refs.room)).data()!.expiresAt })
      ]);
    });
    const guestDb = modularFirestore(testEnv.authenticatedContext(guestUid));
    const refs = paths(guestDb);

    await assertSucceeds(getDoc(refs.answer));
    await assertFails(getDoc(refs.otherAnswer));
    await assertFails(getDocs(query(refs.answers)));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(modularFirestore(context), 'arenaRooms', roomId), { status: 'reveal' });
    });
    await assertSucceeds(getDoc(refs.otherAnswer));
    await assertSucceeds(getDocs(query(refs.answers)));
  });

  it('allows the host to start the next question directly after a reveal', async () => {
    await seedRoom('reveal');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(modularFirestore(context), 'arenaRooms', roomId), {
        questionCount: 2,
        settings: { source: 'all', questionCount: 2, timeLimitSeconds: 15, questionMode: 'mixed' }
      });
    });
    const hostDb = modularFirestore(testEnv.authenticatedContext(hostUid));
    await assertSucceeds(updateDoc(doc(hostDb, 'arenaRooms', roomId), {
      status: 'question',
      activeQuestionIndex: 1,
      activeQuestionId: 'q1',
      answeredCount: 0,
      countdownStartedAt: null,
      questionStartedAt: serverTimestamp()
    }));
  });

  it('blocks players from changing score or another player’s answer', async () => {
    await seedRoom();
    const guestDb = modularFirestore(testEnv.authenticatedContext(guestUid));
    const refs = paths(guestDb);

    await assertFails(updateDoc(refs.guest, { score: 99_999 }));
    await assertFails(writeAnswer(guestDb, guestUid, otherUid));
  });

  it('accepts one answer in the time window and rejects edits or duplicates', async () => {
    await seedRoom('question', 1_000);
    const guestDb = modularFirestore(testEnv.authenticatedContext(guestUid));
    const refs = paths(guestDb);

    await assertSucceeds(writeAnswer(guestDb, guestUid));
    await assertFails(writeAnswer(guestDb, guestUid));
    await assertFails(updateDoc(refs.answer, { answer: 'wrong' }));
  });

  it('rejects an answer submitted after the question deadline', async () => {
    await seedRoom('question', 20_000);
    const guestDb = modularFirestore(testEnv.authenticatedContext(guestUid));
    await assertFails(writeAnswer(guestDb, guestUid));
  });

  it('allows simultaneous answers from different players without sharing write access', async () => {
    await seedRoom('question', 1_000);
    const guestDb = modularFirestore(testEnv.authenticatedContext(guestUid));
    const otherDb = modularFirestore(testEnv.authenticatedContext(otherUid));

    await assertSucceeds(Promise.all([
      writeAnswer(guestDb, guestUid),
      writeAnswer(otherDb, otherUid)
    ]));
  });

  it('allows a guest to leave by changing only their own status with the room count', async () => {
    await seedRoom('question');
    const guestDb = modularFirestore(testEnv.authenticatedContext(guestUid));
    const refs = paths(guestDb);
    await assertSucceeds(runTransaction(guestDb, async (transaction) => {
      const roomSnapshot = await transaction.get(refs.room);
      const playerSnapshot = await transaction.get(refs.guest);
      transaction.update(refs.guest, { status: 'left', leftAt: serverTimestamp() });
      transaction.update(refs.room, { playerCount: roomSnapshot.data()!.playerCount - 1 });
      expect(playerSnapshot.data()!.status).toBe('active');
    }));
  });
});
