import { useState } from 'react';
import {
  X,
  LogIn,
  Mail,
  Lock,
  AlertCircle
} from 'lucide-react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider,
  signOut
} from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut?: (clearLocalData: boolean) => Promise<void> | void;
}

export function AuthModal({ isOpen, onClose, onSignOut }: AuthModalProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const currentUser = auth.currentUser;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (currentUser && currentUser.isAnonymous) {
        // Link anonymous account to email/password to preserve progress (Section 2)
        const credential = EmailAuthProvider.credential(email, password);
        await linkWithCredential(currentUser, credential);
        alert('Đã liên kết tài khoản thành công! Tiến độ học tập đã được lưu giữ.');
      } else if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi đăng nhập/đăng ký');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng nhập Google thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async (clearLocal = false) => {
    if (onSignOut) {
      await onSignOut(clearLocal);
    } else {
      await signOut(auth);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400">
            <LogIn className="w-5 h-5" />
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {currentUser && !currentUser.isAnonymous
                ? 'Thông tin tài khoản'
                : currentUser?.isAnonymous
                ? 'Liên kết tài khoản vĩnh viễn'
                : isRegister
                ? 'Tạo tài khoản mới'
                : 'Đăng nhập'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {currentUser && !currentUser.isAnonymous ? (
          <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-1">
              <div className="text-slate-400">Đã đăng nhập với email:</div>
              <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{currentUser.email}</div>
              <div className="text-[10px] text-slate-400">UID: {currentUser.uid}</div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleSignOut(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold touch-target transition"
              >
                Đăng xuất (Giữ bản lưu offline)
              </button>

              <button
                onClick={() => handleSignOut(true)}
                className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300 rounded-xl font-medium touch-target transition text-[11px]"
              >
                Đăng xuất & Xóa dữ liệu tài khoản khỏi máy
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {currentUser?.isAnonymous && (
              <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-800 dark:text-sky-200 text-xs">
                Bạn đang ở chế độ khách ẩn danh. Đăng nhập hoặc liên kết email bên dưới để đồng bộ tiến độ qua các thiết bị.
              </div>
            )}

            {/* Google sign-in */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl flex items-center justify-center space-x-2 transition touch-target"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Tiếp tục với Google</span>
            </button>

            <div className="flex items-center my-2">
              <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
              <span className="px-2 text-[10px] text-slate-400 uppercase">Hoặc email</span>
              <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailAuth} className="space-y-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">Email:</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">Mật khẩu:</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ít nhất 6 ký tự"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-sm transition touch-target"
              >
                {loading
                  ? 'Đang xử lý...'
                  : currentUser?.isAnonymous
                  ? 'Liên kết tài khoản'
                  : isRegister
                  ? 'Đăng ký tài khoản'
                  : 'Đăng nhập'}
              </button>
            </form>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
              >
                {isRegister ? 'Đã có tài khoản? Đăng nhập ngay' : 'Chưa có tài khoản? Đăng ký ngay'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
