import { describe, expect, it, beforeEach } from 'vitest';

class StorageMock implements Storage {
  private store: Record<string, string> = {};
  get length() {
    return Object.keys(this.store).length;
  }
  clear() {
    this.store = {};
  }
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  key(index: number) {
    return Object.keys(this.store)[index] ?? null;
  }
}

const mockLocal = new StorageMock();
const mockSession = new StorageMock();

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocal,
  writable: true
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSession,
  writable: true
});
Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true
});

import {
  getSyncPassword,
  isSyncAuthorized,
  verifyAndAuthorizeSync,
  revokeSyncAuthorization,
  setCustomSyncPassword,
  resetSyncPasswordToDefault,
  isRememberedOnDevice,
  isRequireSyncPasswordEnabled,
  setRequireSyncPassword
} from './syncSecurity';

describe('syncSecurity service', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setRequireSyncPassword(false);
  });

  it('defaults to password check disabled for easy sharing', () => {
    expect(isRequireSyncPasswordEnabled()).toBe(false);
    expect(isSyncAuthorized()).toBe(true);
  });

  it('defaults to configured password or raku2026', () => {
    const pwd = getSyncPassword();
    expect(pwd).toBeDefined();
    expect(typeof pwd).toBe('string');
    expect(pwd.length).toBeGreaterThanOrEqual(4);
  });

  describe('when requireSyncPassword is enabled', () => {
    beforeEach(() => {
      setRequireSyncPassword(true);
    });

    it('starts unauthorized initially', () => {
      expect(isSyncAuthorized()).toBe(false);
    });

    it('rejects wrong password', () => {
      const success = verifyAndAuthorizeSync('wrong_pass_123', false);
      expect(success).toBe(false);
      expect(isSyncAuthorized()).toBe(false);
    });

    it('authorizes session when correct password is provided without remembering', () => {
      const pwd = getSyncPassword();
      const success = verifyAndAuthorizeSync(pwd, false);
      expect(success).toBe(true);
      expect(isSyncAuthorized()).toBe(true);
      expect(isRememberedOnDevice()).toBe(false);
    });

    it('remembers on device when remember checkbox is true', () => {
      const pwd = getSyncPassword();
      const success = verifyAndAuthorizeSync(pwd, true);
      expect(success).toBe(true);
      expect(isSyncAuthorized()).toBe(true);
      expect(isRememberedOnDevice()).toBe(true);
    });

    it('revokes authorization correctly', () => {
      const pwd = getSyncPassword();
      verifyAndAuthorizeSync(pwd, true);
      expect(isSyncAuthorized()).toBe(true);

      revokeSyncAuthorization();
      expect(isSyncAuthorized()).toBe(false);
      expect(isRememberedOnDevice()).toBe(false);
    });
  });

  it('allows changing custom password with current password verification', () => {
    const current = getSyncPassword();
    const res = setCustomSyncPassword(current, 'my_new_secret_pwd');
    expect(res.success).toBe(true);
    expect(getSyncPassword()).toBe('my_new_secret_pwd');

    // Previous password shouldn't work anymore
    revokeSyncAuthorization();
    expect(verifyAndAuthorizeSync(current, false)).toBe(false);

    // New password works
    expect(verifyAndAuthorizeSync('my_new_secret_pwd', false)).toBe(true);
  });

  it('resets custom password back to default', () => {
    const current = getSyncPassword();
    setCustomSyncPassword(current, 'custom_secret');
    expect(getSyncPassword()).toBe('custom_secret');

    const resetRes = resetSyncPasswordToDefault('custom_secret');
    expect(resetRes.success).toBe(true);
    expect(getSyncPassword()).toBe(current);
  });
});
