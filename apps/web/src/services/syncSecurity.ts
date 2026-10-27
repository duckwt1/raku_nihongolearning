/**
 * Quản lý mật khẩu và quyền bảo vệ khi ghi dữ liệu lên Cloud Firestore.
 * Giúp người dùng kiểm soát hạn ngạch ghi (Write Quotas), tránh ghi bừa bãi hoặc tự động.
 */

const SESSION_AUTH_KEY = 'raku_sync_authorized';
const REMEMBER_AUTH_KEY = 'raku_sync_remembered';
const CUSTOM_PASSWORD_KEY = 'raku_sync_password_custom';
const DEFAULT_PASSWORD = 'raku2026';

/**
 * Cờ bật/tắt tính năng mật khẩu bảo vệ khi tải lên Firestore.
 * - Mặc định = false: Tắt kiểm tra mật khẩu (chia sẻ cho bạn bè dùng không bị hỏi mật khẩu).
 * - Đổi thành true: Mở lại tính năng yêu cầu mật khẩu để hạn chế số lượt ghi (Write Quotas).
 */
let requireSyncPasswordFlag = false;

export function isRequireSyncPasswordEnabled(): boolean {
  return requireSyncPasswordFlag;
}

export function setRequireSyncPassword(enabled: boolean): void {
  requireSyncPasswordFlag = enabled;
}

/**
 * Lấy mật khẩu yêu cầu khi tải lên Firestore.
 * Ưu tiên:
 * 1. Mật khẩu tùy chỉnh người dùng đã đổi trong Cài đặt (localStorage)
 * 2. Biến môi trường VITE_FIRESTORE_SYNC_PASSWORD (trong .env)
 * 3. Mặc định 'raku2026'
 */
export function getSyncPassword(): string {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const custom = localStorage.getItem(CUSTOM_PASSWORD_KEY);
    if (custom && custom.trim()) {
      return custom.trim();
    }
  }

  const envPass = import.meta.env.VITE_FIRESTORE_SYNC_PASSWORD;
  if (envPass && typeof envPass === 'string' && envPass.trim()) {
    return envPass.trim();
  }

  return DEFAULT_PASSWORD;
}

/**
 * Kiểm tra xem thiết bị/phiên hiện tại đã được cấp quyền ghi lên Firestore chưa.
 */
export function isSyncAuthorized(): boolean {
  // Nếu đang tắt yêu cầu mật khẩu thì luôn cho phép
  if (!requireSyncPasswordFlag) return true;

  if (typeof window === 'undefined') return false;

  try {
    if (sessionStorage.getItem(SESSION_AUTH_KEY) === 'true') {
      return true;
    }
    if (localStorage.getItem(REMEMBER_AUTH_KEY) === 'true') {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Xác minh mật khẩu do người dùng nhập và kích hoạt quyền ghi nếu khớp.
 */
export function verifyAndAuthorizeSync(inputPassword: string, rememberOnDevice = false): boolean {
  if (!inputPassword) return false;
  const expected = getSyncPassword();

  if (inputPassword.trim() === expected) {
    try {
      sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
      if (rememberOnDevice) {
        localStorage.setItem(REMEMBER_AUTH_KEY, 'true');
      }
    } catch (e) {
      console.warn('Lỗi lưu trạng thái xác thực sync:', e);
    }
    return true;
  }

  return false;
}

/**
 * Thu hồi quyền ghi Firestore (khóa lại, yêu cầu nhập mật khẩu lần sau).
 */
export function revokeSyncAuthorization(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_AUTH_KEY);
    localStorage.removeItem(REMEMBER_AUTH_KEY);
  } catch (e) {
    console.warn('Lỗi thu hồi quyền sync:', e);
  }
}

/**
 * Đổi mật khẩu bảo vệ tải lên Firestore.
 */
export function setCustomSyncPassword(currentPassword: string, newPassword: string): { success: boolean; error?: string } {
  if (!newPassword || newPassword.trim().length < 4) {
    return { success: false, error: 'Mật khẩu mới phải có ít nhất 4 ký tự.' };
  }

  const expected = getSyncPassword();
  if (currentPassword.trim() !== expected) {
    return { success: false, error: 'Mật khẩu hiện tại không đúng.' };
  }

  try {
    localStorage.setItem(CUSTOM_PASSWORD_KEY, newPassword.trim());
    sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Không thể lưu mật khẩu.' };
  }
}

/**
 * Đặt lại mật khẩu về mặc định của hệ thống (.env hoặc raku2026)
 */
export function resetSyncPasswordToDefault(currentPassword: string): { success: boolean; error?: string } {
  const expected = getSyncPassword();
  if (currentPassword.trim() !== expected) {
    return { success: false, error: 'Mật khẩu hiện tại không đúng.' };
  }

  try {
    localStorage.removeItem(CUSTOM_PASSWORD_KEY);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi khi đặt lại mật khẩu.' };
  }
}

/**
 * Kiểm tra xem người dùng có đang lưu mật khẩu nhớ trên thiết bị không.
 */
export function isRememberedOnDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(REMEMBER_AUTH_KEY) === 'true';
  } catch {
    return false;
  }
}
