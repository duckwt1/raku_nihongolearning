import { UploadCloud, RefreshCw, AlertTriangle, X } from 'lucide-react';

interface CloudConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadToCloud: () => void;
  onResetToCloud: () => void;
  localReviewedCount: number;
  pendingQueueCount: number;
}

export function CloudConflictModal({
  isOpen,
  onClose,
  onUploadToCloud,
  onResetToCloud,
  localReviewedCount,
  pendingQueueCount
}: CloudConflictModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              Dữ liệu đám mây không khớp
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg touch-target"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Description */}
        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
          <p>
            Hệ thống phát hiện tài khoản trên <strong>Cloud Firestore</strong> của bạn đang trống (hoặc đã bị xóa trên Firebase).
          </p>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <span>Trạng thái trên máy này:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
              <li><strong>{localReviewedCount}</strong> thẻ đã ghi nhận tiến độ học tập</li>
              <li><strong>{pendingQueueCount}</strong> lượt ôn tập chờ sao lưu</li>
            </ul>
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-200 pt-1">
            Giống như trong Anki, bạn muốn giải quyết sự chênh lệch này theo hướng nào?
          </p>
        </div>

        {/* Choices */}
        <div className="space-y-3 pt-1">
          {/* Option 1: Upload to Cloud */}
          <button
            onClick={() => {
              onUploadToCloud();
              onClose();
            }}
            className="w-full p-3.5 rounded-2xl border-2 border-sky-500 bg-sky-50/60 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-950/80 text-left transition flex items-start space-x-3 group touch-target"
          >
            <div className="p-2 rounded-xl bg-sky-600 text-white shrink-0 shadow-sm mt-0.5">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-xs text-sky-900 dark:text-sky-100 flex items-center justify-between">
                <span>Tải lên đám mây (Upload to Cloud)</span>
                <span className="text-[10px] bg-sky-200 dark:bg-sky-800 text-sky-800 dark:text-sky-200 px-2 py-0.5 rounded-full font-medium">Khuyên dùng</span>
              </div>
              <p className="text-[11px] text-sky-700 dark:text-sky-300 mt-0.5 leading-normal">
                Giữ nguyên tiến độ học trên máy này và sao lưu mới lên Cloud Firestore.
              </p>
            </div>
          </button>

          {/* Option 2: Reset Local Data to Match Cloud */}
          <button
            onClick={() => {
              onResetToCloud();
              onClose();
            }}
            className="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-rose-50 hover:border-rose-300 dark:hover:bg-rose-950/40 dark:hover:border-rose-900 text-left transition flex items-start space-x-3 group touch-target"
          >
            <div className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 group-hover:bg-rose-600 group-hover:text-white shrink-0 shadow-sm mt-0.5 transition">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-rose-700 dark:group-hover:text-rose-300">
                Đặt lại theo đám mây (Reset Local)
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 group-hover:text-rose-600/90 dark:group-hover:text-rose-300/90 mt-0.5 leading-normal">
                Xóa sạch tiến độ học trên máy này về mặc định để đồng bộ với Cloud trống.
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl"
          >
            Để sau (Hủy)
          </button>
        </div>
      </div>
    </div>
  );
}
