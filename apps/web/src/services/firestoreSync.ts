import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { StudyCard } from '@raku/core';
import { db } from './firebase';

/**
 * Đồng bộ thông tin người dùng lên collection /users/{uid}
 */
export async function syncUserProfile(user: User): Promise<void> {
  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || null,
        isAnonymous: user.isAnonymous,
        lastActiveAt: serverTimestamp(),
        createdAt: serverTimestamp()
      },
      { merge: true }
    );
    console.log(`✓ Đã đồng bộ tài khoản người dùng lên Firestore (/users/${user.uid})`);
  } catch (err) {
    console.warn('Lưu thông tin người dùng lên Firestore thất bại (có thể do offline hoặc chưa thiết lập .env):', err);
  }
}

/**
 * Lưu tiến độ thẻ ôn tập FSRS và ghi nhật ký ôn tập vào Firestore
 */
export async function saveCardProgress(
  userId: string,
  card: StudyCard,
  rating: number
): Promise<void> {
  try {
    // 1. Cập nhật trạng thái thẻ FSRS tại /users/{uid}/cards/{cardId}
    const cardRef = doc(db, 'users', userId, 'cards', card.id);
    await setDoc(
      cardRef,
      {
        id: card.id,
        refId: card.refId,
        type: card.type,
        due: card.fsrsCard.due ? new Date(card.fsrsCard.due).toISOString() : null,
        stability: card.fsrsCard.stability,
        difficulty: card.fsrsCard.difficulty,
        elapsed_days: card.fsrsCard.elapsed_days,
        scheduled_days: card.fsrsCard.scheduled_days,
        reps: card.fsrsCard.reps,
        lapses: card.fsrsCard.lapses,
        state: card.fsrsCard.state,
        last_review: card.fsrsCard.last_review
          ? new Date(card.fsrsCard.last_review).toISOString()
          : null,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    // 2. Ghi thêm vào nhật ký /users/{uid}/reviewLogs/{logId} (Luật Firestore: append-only)
    const logsCol = collection(db, 'users', userId, 'reviewLogs');
    await addDoc(logsCol, {
      cardId: card.id,
      rating,
      state: card.fsrsCard.state,
      reviewedAt: serverTimestamp()
    });

    console.log(`✓ Đã lưu lịch sử ôn tập FSRS thẻ ${card.id} lên Firestore`);
  } catch (err) {
    console.warn('Lưu tiến độ FSRS lên Firestore thất bại:', err);
  }
}
