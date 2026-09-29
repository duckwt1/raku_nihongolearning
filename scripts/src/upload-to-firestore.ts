import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import { SEED_KANJI, SEED_WORDS, SEED_GRAMMAR, SEED_SENTENCES } from '@raku/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Load env from apps/web/.env or root .env
loadEnvFile(path.resolve(__dirname, '../../apps/web/.env'));
loadEnvFile(path.resolve(__dirname, '../../.env'));

const apiKey = process.env.VITE_FIREBASE_API_KEY;
const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'raku-nihongo-learning';
const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       RAKU NIHONGO - XUẤT TOÀN BỘ DATABASE N3 LÊN FIRESTORE   ');
  console.log('═══════════════════════════════════════════════════════════════');

  if (!apiKey || apiKey === 'fake-api-key-for-emulator') {
    console.warn('⚠️  CẢNH BÁO: Chưa tìm thấy VITE_FIREBASE_API_KEY trong file apps/web/.env!');
    console.warn('Vui lòng tạo file apps/web/.env và điền thông tin dự án Firebase của bạn.');
    console.warn('Xem mẫu cấu hình tại apps/web/.env.example\n');
  }

  console.log(`📡 Đang kết nối tới Firebase Project: [ ${projectId} ]...`);

  const app = initializeApp({
    apiKey: apiKey || 'fake-api-key-for-emulator',
    authDomain,
    projectId
  });

  const auth = getAuth(app);
  const db = getFirestore(app);

  // Authenticate anonymously so requests satisfy isAuthenticated() in firestore.rules
  try {
    console.log('🔑 Đang xác thực phiên làm việc ẩn danh với Firebase...');
    const userCredential = await signInAnonymously(auth);
    console.log(`✓ Xác thực thành công (UID: ${userCredential.user.uid})`);
  } catch (err: any) {
    console.warn('⚠️ Lưu ý khi xác thực:', err.message || err);
    console.log('Tiếp tục thử ghi dữ liệu...');
  }

  const BATCH_SIZE = 450; // Firestore limit is 500 writes per batch

  // 1. Upload Kanji
  console.log(`\n[1/4] Đang nạp ${SEED_KANJI.length} chữ Kanji N3 vào collection "kanji"...`);
  for (let i = 0; i < SEED_KANJI.length; i += BATCH_SIZE) {
    const chunk = SEED_KANJI.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const k of chunk) {
      batch.set(doc(db, 'kanji', k.char), k);
    }
    await batch.commit();
    console.log(`  ✓ Đã ghi ${Math.min(i + BATCH_SIZE, SEED_KANJI.length)} / ${SEED_KANJI.length} Kanji`);
  }

  // 2. Upload Words
  console.log(`\n[2/4] Đang nạp ${SEED_WORDS.length} từ vựng Mimikara N3 vào collection "words"...`);
  for (let i = 0; i < SEED_WORDS.length; i += BATCH_SIZE) {
    const chunk = SEED_WORDS.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const w of chunk) {
      batch.set(doc(db, 'words', w.id), w);
    }
    await batch.commit();
    console.log(`  ✓ Đã ghi ${Math.min(i + BATCH_SIZE, SEED_WORDS.length)} / ${SEED_WORDS.length} Từ vựng`);
  }

  // 3. Upload Grammar
  console.log(`\n[3/4] Đang nạp ${SEED_GRAMMAR.length} mẫu ngữ pháp N3 vào collection "grammar"...`);
  for (let i = 0; i < SEED_GRAMMAR.length; i += BATCH_SIZE) {
    const chunk = SEED_GRAMMAR.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const g of chunk) {
      batch.set(doc(db, 'grammar', g.id), g);
    }
    await batch.commit();
    console.log(`  ✓ Đã ghi ${Math.min(i + BATCH_SIZE, SEED_GRAMMAR.length)} / ${SEED_GRAMMAR.length} Ngữ pháp`);
  }

  // 4. Upload Sentences
  console.log(`\n[4/4] Đang nạp ${SEED_SENTENCES.length} câu ví dụ vào collection "sentences"...`);
  for (let i = 0; i < SEED_SENTENCES.length; i += BATCH_SIZE) {
    const chunk = SEED_SENTENCES.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const s of chunk) {
      batch.set(doc(db, 'sentences', s.id), s);
    }
    await batch.commit();
    console.log(`  ✓ Đã ghi ${Math.min(i + BATCH_SIZE, SEED_SENTENCES.length)} / ${SEED_SENTENCES.length} Câu ví dụ`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🎉 XUẤT DỮ LIỆU HOÀN TẤT THÀNH CÔNG!');
  console.log(`- 609 Kanji đã được nạp vào /kanji`);
  console.log(`- 880 Từ vựng đã được nạp vào /words`);
  console.log(`- 97 Ngữ pháp đã được nạp vào /grammar`);
  console.log(`- 880 Câu ví dụ đã được nạp vào /sentences`);
  console.log('Tổng cộng: 2,466 bản ghi đã sẵn sàng trên Firebase Cloud Firestore!');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Lỗi khi nạp dữ liệu lên Firestore:', err);
  process.exit(1);
});
