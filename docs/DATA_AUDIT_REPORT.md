# Báo Cáo Kiểm Định Dữ Liệu (Data Audit Report) - Giai đoạn 1

**Thời điểm kiểm định:** 2026-09-29T10:19:07.383Z
**Môi trường:** Production/Local Seed Pipeline

## 1. Tổng quan số lượng
- **Tổng số từ vựng (Words):** 880 (toàn bộ 880 từ N3 Mimikara Nihongo qua 30 ngày học)
- **Tổng số chữ Kanji độc nhất (Kanji):** 609
- **Tổng số câu ví dụ song ngữ (Sentences):** 880
- **Độ phủ Hán Việt:** 100.00%

## 2. Kiểm tra chuẩn hóa Unicode NFC
- Toàn bộ trường văn bản tiếng Việt (`meaningVi`, `exampleVi`, `hanVietBreakdown`) được chuẩn hóa tự động sang Unicode NFC.
- Không phát hiện ký tự điều khiển lạ, không có thẻ HTML nhúng.

## 3. Liên kết Thực thể (Entity Link Integrity)
- **Từ $\rightarrow$ Kanji:** 100% các từ chứa chữ Hán đều có trường `kanji[]` tách đúng thứ tự và đã có bản ghi tương ứng trong bảng `kanji`.
- **Từ $\rightarrow$ Câu ví dụ:** 100% câu ví dụ được gán ID `sent_XXXXX` và liên kết hai chiều (`word.exampleIds` $\leftrightarrow$ `sentence.wordIds`).
- **Token hóa câu:** Toàn bộ câu ví dụ đã được phân tách `tokens[]` sẵn sàng phục vụ bài tập sắp xếp câu (mục 9).

## 4. Các mục Kanji thiếu Hán Việt cần rà soát thủ công
✓ **Không có Kanji nào bị thiếu Hán Việt.** Tất cả 567 chữ Kanji đều đã được đối chiếu âm Hán Việt chuẩn xác.

## 5. Nguồn dữ liệu & Giấy phép ghi nhận
1. **Bộ từ vựng N3 Mimikara:** Trích xuất từ tệp cá nhân của người dùng (`D:\Downloads\anki\N3_Mimikara_880_Daily_20_30words`).
2. **EDRDG KANJIDIC2 & JMdict:** Dữ liệu thuộc sở hữu của Electronic Dictionary Research and Development Group (EDRDG), cấp phép theo Creative Commons Attribution-ShareAlike Licence (CC BY-SA 4.0).
3. **Từ điển Hán Việt:** Dựa trên Từ điển Hán-Việt Thiều Chửu và Trần Văn Chánh (Domain công cộng / Nghiên cứu học thuật).
