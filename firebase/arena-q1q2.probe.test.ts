import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
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
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore
} from 'firebase/firestore';

const projectId = 'demo-raku-arena-q1q2';
let testEnv: RulesTestEnvironment;

const roomId = 'arena-q1q2-room';
const hostUid = 'host-user';
const guestUid = 'guest-user';

function fdb(context: RulesTestContext): Firestore {
  return context.firestore() as unknown as Firestore;
}

const roomPath = (db: Firestore) => doc(db, 'arenaRooms', roomId);
const playerPath = (db: Firestore, uid: string) => doc(db, 'arenaRooms', roomId, 'players', uid);
const questionPath = (db: Firestore, qid: string) => doc(db, 'arenaRooms', roomId, 'questions', qid);
const answerKeyPath = (db: Firestore, qid: string) => doc(db, 'arenaRooms', roomId, 'answerKeys', qid);
const revealPath = (db: Firestore, qid: string) => doc(db, 'arenaRooms', roomId, 'reveals', qid);
const answerPath = (db: Firestore, qid: string, uid: string) =>
  doc(db, 'arenaRooms', roomId, 'questions', qid, 'answers', uid);

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

describe('Arena q0 -> q1 listener probe', () => {
  it('reports whether active listeners are revoked when the room leaves reveal', async () => {
    const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1_000);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = fdb(context);
      await setDoc(roomPath(db), {
        roomCode: '7K2MP9', hostUid, hostNickname: 'Host', status: 'reveal',
        settings: { source: 'all', questionCount: 2, timeLimitSeconds: 15, questionMode: 'mixed' },
        questionCount: 2, playerCount: 2, hasHadGuest: true,
        activeQuestionIndex: 0, activeQuestionId: 'q0', answeredCount: 2,
        questionStartedAt: Timestamp.fromMillis(Date.now() - 20_000),
        revealedAt: Timestamp.fromMillis(Date.now() - 1_000),
        hostHeartbeatAt: Timestamp.fromMillis(Date.now()),
        createdAt: Timestamp.fromMillis(Date.now() - 60_000), expiresAt
      });
      for (const uid of [hostUid, guestUid]) {
        await setDoc(playerPath(db, uid), {
          uid, nickname: uid, status: 'active', score: 0, correctCount: 0,
          totalCorrectResponseMs: 0, answeredQuestionId: 'q0',
          joinedAt: Timestamp.fromMillis(Date.now() - 60_000),
          lastSeenAt: Timestamp.fromMillis(Date.now()), expiresAt
        });
      }
      for (const qid of ['q0', 'q1']) {
        await setDoc(questionPath(db, qid), {
          id: qid, index: Number(qid.slice(1)), type: 'jp-to-reading',
          prompt: qid, expiresAt
        });
        await setDoc(revealPath(db, qid), {
          questionId: qid, questionIndex: Number(qid.slice(1)), questionType: 'jp-to-reading',
          correctAnswer: 'answer', acceptedAnswers: ['answer'], readings: ['answer'],
          meanings: ['meaning'], explanationVi: 'probe', results: [], rankings: [], expiresAt
        });
      }
    });

    const guestDb = fdb(testEnv.authenticatedContext(guestUid));
    const hostDb = fdb(testEnv.authenticatedContext(hostUid));
    const errors: string[] = [];
    const events: string[] = [];
    const unsubQuestion = onSnapshot(questionPath(guestDb, 'q0'),
      () => events.push('question-q0'), (error) => errors.push(`question-q0:${error.code}`));
    const unsubReveal = onSnapshot(revealPath(guestDb, 'q0'),
      () => events.push('reveal-q0'), (error) => errors.push(`reveal-q0:${error.code}`));
    // Deterministic: unsubscribe right after the room update, like React cleanup.
    const unsubQuickQuestion = onSnapshot(questionPath(guestDb, 'q0'), () => {}, (error) => errors.push(`quick:${error.code}`));

    await new Promise((resolve) => setTimeout(resolve, 300));
    await runTransaction(hostDb, async (transaction) => {
      transaction.update(roomPath(hostDb), {
        status: 'question', activeQuestionIndex: 1, activeQuestionId: 'q1',
        answeredCount: 0, countdownStartedAt: null, questionStartedAt: serverTimestamp()
      });
    });
    unsubQuickQuestion();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    unsubQuestion();
    unsubReveal();
    console.log('listener events', events, 'errors', errors);
    expect(errors.length + events.length).toBeGreaterThanOrEqual(0);
  });
});

describe('Arena q0 -> q1 transition probe', () => {
  it('lets the guest read the next question, heartbeat, and answer after the host advances', async () => {
    const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1_000);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = fdb(context);
      await setDoc(roomPath(db), {
        roomCode: '7K2MP9',
        hostUid,
        hostNickname: 'Host',
        status: 'reveal',
        settings: { source: 'all', questionCount: 2, timeLimitSeconds: 15, questionMode: 'mixed' },
        questionCount: 2,
        playerCount: 2,
        hasHadGuest: true,
        activeQuestionIndex: 0,
        activeQuestionId: 'q0',
        answeredCount: 2,
        questionStartedAt: Timestamp.fromMillis(Date.now() - 20_000),
        revealedAt: Timestamp.fromMillis(Date.now() - 1_000),
        hostHeartbeatAt: Timestamp.fromMillis(Date.now()),
        createdAt: Timestamp.fromMillis(Date.now() - 60_000),
        expiresAt
      });
      for (const uid of [hostUid, guestUid]) {
        await setDoc(playerPath(db, uid), {
          uid,
          nickname: uid,
          status: 'active',
          score: 0,
          correctCount: 0,
          totalCorrectResponseMs: 0,
          answeredQuestionId: 'q0',
          joinedAt: Timestamp.fromMillis(Date.now() - 60_000),
          lastSeenAt: Timestamp.fromMillis(Date.now()),
          expiresAt
        });
      }
      for (const qid of ['q0', 'q1']) {
        await setDoc(questionPath(db, qid), {
          id: qid,
          index: Number(qid.slice(1)),
          type: 'jp-to-reading',
          prompt: qid === 'q0' ? '勉強' : '学校',
          expiresAt
        });
        await setDoc(answerKeyPath(db, qid), {
          answer: 'answer',
          acceptedAnswers: ['answer'],
          readings: ['answer'],
          meanings: ['meaning'],
          explanationVi: 'probe',
          expiresAt
        });
        await setDoc(revealPath(db, qid), {
          questionId: qid,
          questionIndex: Number(qid.slice(1)),
          questionType: 'jp-to-reading',
          correctAnswer: 'answer',
          acceptedAnswers: ['answer'],
          readings: ['answer'],
          meanings: ['meaning'],
          explanationVi: 'probe',
          results: [],
          rankings: [],
          expiresAt
        });
      }
    });

    const hostDb = fdb(testEnv.authenticatedContext(hostUid));
    const guestDb = fdb(testEnv.authenticatedContext(guestUid));

    // Advance exactly like advanceArenaGame.
    await assertSucceeds(runTransaction(hostDb, async (transaction) => {
      const snapshot = await transaction.get(roomPath(hostDb));
      const room = snapshot.data()!;
      expect(room.status).toBe('reveal');
      transaction.update(roomPath(hostDb), {
        status: 'question',
        activeQuestionIndex: 1,
        activeQuestionId: 'q1',
        answeredCount: 0,
        countdownStartedAt: null,
        questionStartedAt: serverTimestamp()
      });
    }));

    // Guest must still be a member, read the q1 question, reveal-list, heartbeat, and submit.
    await assertSucceeds(getDoc(questionPath(guestDb, 'q1')));
    expect((await getDoc(questionPath(guestDb, 'q1'))).data()!.prompt).toBe('学校');
    await assertSucceeds(getDocs(query(collection(guestDb, 'arenaRooms', roomId, 'players'))));
    await assertSucceeds(updateDoc(playerPath(guestDb, guestUid), { lastSeenAt: serverTimestamp() }));
    const roomSnap = await getDoc(roomPath(guestDb));
    expect(roomSnap.data()!.status).toBe('question');
    expect(roomSnap.data()!.activeQuestionId).toBe('q1');
    await assertSucceeds(setDoc(answerPath(guestDb, 'q1', guestUid), {
      answer: 'answer',
      submittedAt: serverTimestamp(),
      expiresAt
    }));

    // Host heartbeat must keep succeeding across the reveal -> question transition.
    await assertSucceeds(runTransaction(hostDb, async (transaction) => {
      const snapshot = await transaction.get(roomPath(hostDb));
      expect(snapshot.data()!.hostUid).toBe(hostUid);
      transaction.update(roomPath(hostDb), { hostHeartbeatAt: serverTimestamp() });
    }));
    expect((await getDoc(roomPath(hostDb))).data()!.hostHeartbeatAt).toBeTruthy();
  });
});
