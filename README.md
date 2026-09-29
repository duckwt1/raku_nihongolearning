# Raku Nihongo (楽) - Tự học Tiếng Nhật liên kết Kanji & Từ vựng

Ứng dụng web tự học tiếng Nhật chuyên sâu cho người Việt:
- **Từ vựng liên kết theo Kanji**: Ôn theo thuật toán lặp lại ngắt quãng FSRS (bản TypeScript `ts-fsrs`).
- **Ngữ pháp & Bài tập**: Trắc nghiệm K1..K7, sắp xếp câu, điền từ vào chỗ trống, dịch qua lại.
- **Import thông minh**: Nhập văn bản dạng Quizlet (CSV, TSV, văn bản tự do), lọc trùng, liên kết từ điển, tích hợp AI phân tích.
- **Hạ tầng Cloudflare & Firebase**: Cloudflare Workers (Static Assets + API) và Firebase Authentication + Cloud Firestore (hỗ trợ offline đa tab).

---

## 🏗️ Cấu trúc Monorepo

```
/
├── apps/
│   └── web/              # React 19 + TypeScript + Vite + Tailwind CSS (PWA)
├── packages/
│   └── core/             # Pure TS: Chuẩn hóa Kana, chấm đáp án, FSRS scheduler, Zod schemas
├── worker/               # Cloudflare Worker API (/api/*) + serving static assets
├── firebase/             # firestore.rules, firestore.indexes.json, firebase.json (Emulator)
├── scripts/              # Scripts nạp dữ liệu từ điển & kiểm định
└── .github/workflows/    # CI tự động typecheck & test
```

---

## 🚀 Khởi chạy trên Local Development

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Chạy kiểm tra kiểu & Unit Test
```bash
# Typecheck toàn bộ workspaces
npm run typecheck

# Chạy toàn bộ Unit Tests (@raku/core, @raku/worker, apps/web)
npm run test
```

### 3. Chạy Firebase Local Emulator Suite
Cần cài đặt Java Runtime Environment (JRE) để chạy Firebase Firestore Emulator:
```bash
# Chạy Auth (cổng 9099), Firestore (cổng 8080) và Emulator UI (cổng 4000)
npm run emulators
```
Giao diện quản lý Emulator UI truy cập tại: `http://localhost:4000`

### 4. Chạy Frontend (Vite)
```bash
npm run dev
# Ứng dụng chạy tại: http://localhost:3000
```

### 5. Chạy Cloudflare Worker (Wrangler)
```bash
npm run dev:worker
# Worker API chạy tại: http://localhost:8787
```

---

## 🔒 Quy tắc bảo mật & Quản lý Secret
- **Không đặt secret ở client**: Toàn bộ secret (Gemini API key, v.v.) chỉ được cấu hình trong Cloudflare Workers qua `wrangler secret put`.
- **Xác thực token**: Cloudflare Worker xác thực Firebase ID Token bằng thư viện `jose` với Google JWKS công khai.
- **Firestore Security Rules**: Đảm bảo người dùng chỉ đọc/ghi dữ liệu cá nhân (`users/{uid}/*`), kho dữ liệu dùng chung (`kanji`, `words`, `sentences`, `grammar`) là chỉ đọc với người dùng đã xác thực.
