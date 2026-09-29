import {
  doc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  type StudyCard,
  type Folder,
  type Deck,
  SEED_KANJI,
  SEED_WORDS,
  SEED_GRAMMAR,
  SEED_SENTENCES
} from '@raku/core';
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
    console.warn(
      'Lưu thông tin người dùng lên Firestore thất bại (có thể do offline hoặc chưa thiết lập .env):',
      err
    );
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

/**
 * Xuất toàn bộ cơ sở dữ liệu N3 (Kanji, Từ vựng, Ngữ pháp, Câu ví dụ) lên Cloud Firestore
 * Sử dụng writeBatch phân đoạn tối đa 450 bản ghi/lần (giới hạn Firestore: 500)
 */
export async function seedAllN3DataToFirestore(
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<{
  kanjiCount: number;
  wordsCount: number;
  grammarCount: number;
  sentencesCount: number;
}> {
  const BATCH_SIZE = 450;

  // 1. Xuất 609 chữ Kanji
  onProgress?.('Chữ Hán Kanji', 0, SEED_KANJI.length);
  for (let i = 0; i < SEED_KANJI.length; i += BATCH_SIZE) {
    const chunk = SEED_KANJI.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const k of chunk) {
      const ref = doc(db, 'kanji', k.char);
      batch.set(ref, k);
    }
    await batch.commit();
    onProgress?.('Chữ Hán Kanji', Math.min(i + BATCH_SIZE, SEED_KANJI.length), SEED_KANJI.length);
  }

  // 2. Xuất 880 từ vựng Mimikara
  onProgress?.('Từ vựng Mimikara N3', 0, SEED_WORDS.length);
  for (let i = 0; i < SEED_WORDS.length; i += BATCH_SIZE) {
    const chunk = SEED_WORDS.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const w of chunk) {
      const ref = doc(db, 'words', w.id);
      batch.set(ref, w);
    }
    await batch.commit();
    onProgress?.(
      'Từ vựng Mimikara N3',
      Math.min(i + BATCH_SIZE, SEED_WORDS.length),
      SEED_WORDS.length
    );
  }

  // 3. Xuất 97 mẫu ngữ pháp N3
  onProgress?.('Ngữ pháp N3', 0, SEED_GRAMMAR.length);
  for (let i = 0; i < SEED_GRAMMAR.length; i += BATCH_SIZE) {
    const chunk = SEED_GRAMMAR.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const g of chunk) {
      const ref = doc(db, 'grammar', g.id);
      batch.set(ref, g);
    }
    await batch.commit();
    onProgress?.('Ngữ pháp N3', Math.min(i + BATCH_SIZE, SEED_GRAMMAR.length), SEED_GRAMMAR.length);
  }

  // 4. Xuất 880 câu ví dụ
  onProgress?.('Câu ví dụ minh họa', 0, SEED_SENTENCES.length);
  for (let i = 0; i < SEED_SENTENCES.length; i += BATCH_SIZE) {
    const chunk = SEED_SENTENCES.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const s of chunk) {
      const ref = doc(db, 'sentences', s.id);
      batch.set(ref, s);
    }
    await batch.commit();
    onProgress?.(
      'Câu ví dụ minh họa',
      Math.min(i + BATCH_SIZE, SEED_SENTENCES.length),
      SEED_SENTENCES.length
    );
  }

  return {
    kanjiCount: SEED_KANJI.length,
    wordsCount: SEED_WORDS.length,
    grammarCount: SEED_GRAMMAR.length,
    sentencesCount: SEED_SENTENCES.length
  };
}

/**
 * Tải toàn bộ tiến độ thẻ và cấu trúc Deck từ Firestore về máy
 */
export async function pullDataFromFirestore(userId: string): Promise<{
  cards: Record<string, any>;
  folders?: Folder[];
  decks?: Deck[];
}> {
  const cardsMap: Record<string, any> = {};

  try {
    // 1. Tải danh sách thẻ ôn tập
    const cardsSnapshot = await getDocs(collection(db, 'users', userId, 'cards'));
    cardsSnapshot.forEach((d) => {
      cardsMap[d.id] = d.data();
    });

    // 2. Tải folders nếu có
    const foldersSnapshot = await getDocs(collection(db, 'users', userId, 'folders'));
    const folders: Folder[] = [];
    foldersSnapshot.forEach((d) => {
      folders.push(d.data() as Folder);
    });

    // 3. Tải decks nếu có
    const decksSnapshot = await getDocs(collection(db, 'users', userId, 'decks'));
    const decks: Deck[] = [];
    decksSnapshot.forEach((d) => {
      decks.push(d.data() as Deck);
    });

    return {
      cards: cardsMap,
      folders: folders.length > 0 ? folders : undefined,
      decks: decks.length > 0 ? decks : undefined
    };
  } catch (err) {
    console.warn('Lỗi khi tải dữ liệu từ Firestore:', err);
    return { cards: {} };
  }
}

/**
 * Đồng bộ cấu trúc folders và decks lên Firestore
 */
export async function syncFoldersAndDecks(
  userId: string,
  folders: Folder[],
  decks: Deck[]
): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const f of folders) {
      const ref = doc(db, 'users', userId, 'folders', f.id);
      batch.set(ref, f, { merge: true });
    }
    for (const d of decks) {
      const ref = doc(db, 'users', userId, 'decks', d.id);
      batch.set(ref, d, { merge: true });
    }
    await batch.commit();
    console.log('✓ Đã đồng bộ cấu trúc Thư mục và Deck lên Firestore');
  } catch (err) {
    console.warn('Không thể đồng bộ Thư mục & Deck lên Firestore:', err);
  }
}
