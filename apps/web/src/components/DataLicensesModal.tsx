import { X, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';

interface DataLicensesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DataLicensesModal({ isOpen, onClose }: DataLicensesModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="licenses-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            <h2 id="licenses-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Nguồn dữ liệu &amp; Giấy phép
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 touch-target flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-sm text-slate-600 dark:text-slate-300">
          {/* AI Disclaimer */}
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-200 text-xs">
                Lưu ý quan trọng về nội dung AI:
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Các câu hỏi, giải thích hoặc trường từ vựng do AI tạo ra đều được đánh dấu nhãn &ldquo;AI đề xuất, chưa kiểm chứng&rdquo;. Luôn luôn đối chiếu với từ điển và xem lại trước khi đưa vào kho chính thức.
              </p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center">
              1. Bộ từ điển KANJIDIC2 &amp; JMdict (EDRDG)
            </h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Dữ liệu Kanji và Từ điển tiếng Nhật thuộc bản quyền của Electronic Dictionary Research and Development Group (EDRDG), được phát hành theo giấy phép Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0).
            </p>
            <a
              href="https://www.edrdg.org/edrdg/licence.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-xs text-sky-600 dark:text-sky-400 hover:underline mt-1"
            >
              Xem chi tiết giấy phép EDRDG
              <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center">
              2. Bộ từ vựng &amp; Câu ví dụ N3 Mimikara Nihongo
            </h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Nguồn dữ liệu từ vựng và câu ví dụ song ngữ học tập cá nhân được nạp từ bộ dữ liệu của người dùng, phân chia theo 30 ngày học với 880 từ vựng và câu ví dụ ngữ cảnh.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center">
              3. Đối chiếu âm Hán Việt
            </h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Hệ thống âm đọc Hán Việt được đối chiếu theo Từ điển Hán-Việt Thiều Chửu và Trần Văn Chánh, chuẩn hóa toàn bộ dấu tiếng Việt về định dạng chuẩn Unicode NFC.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center">
              4. Cấp độ JLPT
            </h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Các nhãn cấp độ (N5, N4, N3, N2, N1) được sử dụng để định hướng học tập theo phân loại thông dụng trong cộng đồng và giáo trình, không đại diện cho danh sách chính thức từ ban tổ chức kỳ thi JLPT (The Japan Foundation).
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg touch-target flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}
