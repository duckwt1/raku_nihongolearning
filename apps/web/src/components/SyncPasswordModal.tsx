import { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, X, ShieldAlert } from 'lucide-react';
import { verifyAndAuthorizeSync, isRememberedOnDevice } from '../services/syncSecurity';

interface SyncPasswordModalProps {
  isOpen: boolean;
  actionTitle?: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function SyncPasswordModal({
  isOpen,
  actionTitle = 'Tải dữ liệu lên Cloud Firestore',
  onSuccess,
  onClose
}: SyncPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => isRememberedOnDevice());
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Vui lòng nhập mật khẩu xác thực.');
      return;
    }

    const isValid = verifyAndAuthorizeSync(password, remember);
    if (isValid) {
      setPassword('');
      setError(null);
      onSuccess();
    } else {
      setError('Mật khẩu không chính xác. Vui lòng kiểm tra lại!');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-pwd-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 text-sky-600 dark:text-sky-400">
          <div className="p-3 bg-sky-50 dark:bg-sky-950/80 rounded-2xl border border-sky-100 dark:border-sky-900">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h3 id="sync-pwd-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Mật khẩu tải lên Firestore
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kiểm soát &amp; Hạn chế lượt ghi (Write Quota)
            </p>
          </div>
        </div>

        {/* Notice Info Box */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Thao tác yêu cầu quyền:</span>
          </div>
          <p className="font-medium text-sky-700 dark:text-sky-300 pl-5">
            {actionTitle}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-5">
            Dữ liệu học tập và thẻ từ vựng luôn được lưu an toàn trên máy (Local). Thao tác ghi lên Firestore cần mật khẩu do chủ sở hữu cung cấp.
          </p>
        </div>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nhập mật khẩu xác thực:
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Nhập mật khẩu sync..."
                autoFocus
                className="w-full px-3.5 py-2.5 pr-10 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember check */}
          <label className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>Ghi nhớ quyền trên thiết bị này (không hỏi lại)</span>
          </label>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-xs transition flex items-center space-x-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Xác nhận &amp; Tiến hành</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
