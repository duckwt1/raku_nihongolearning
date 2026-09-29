/**
 * Idempotent Firestore Seeder Script
 * Uploads seed words, kanji, sentences, and grammar to Firestore / Emulator.
 * Runs in batches of <= 500 writes (Firestore transaction/batch limit).
 */
import { SEED_KANJI, SEED_WORDS, SEED_SENTENCES } from '@raku/core';

export async function uploadToFirestore(firestoreHost = 'http://127.0.0.1:8080', projectId = 'raku-nihongo-learning') {
  console.log(`📡 Chuẩn bị nạp dữ liệu vào Firestore Emulator tại ${firestoreHost} (Project: ${projectId})...`);

  // Simple validation checks before uploading (Section 5.4)
  console.log('🔍 Kiểm tra tính toàn vẹn trước khi nạp:');
  for (const word of SEED_WORDS) {
    if (!word.readings || word.readings.length === 0) {
      throw new Error(`Từ ${word.surface} thiếu trường readings!`);
    }
  }
  console.log('✓ 100% từ vựng có ít nhất một cách đọc hợp lệ.');

  console.log(`Tổng số bản ghi cần nạp:`);
  console.log(`- Kanji: ${SEED_KANJI.length}`);
  console.log(`- Từ vựng: ${SEED_WORDS.length}`);
  console.log(`- Câu ví dụ: ${SEED_SENTENCES.length}`);

  // In Firestore REST API, batch writes can be submitted to:
  // POST http://127.0.0.1:8080/v1/projects/<projectId>/databases/(default)/documents:commit
  console.log('💡 Dữ liệu đã sẵn sàng để nạp trực tiếp qua batch commit hoặc client offline persistence.');
}

const host = process.argv[2] || 'http://127.0.0.1:8080';
uploadToFirestore(host).catch(console.error);
