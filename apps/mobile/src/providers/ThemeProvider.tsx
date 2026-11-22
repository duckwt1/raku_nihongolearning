import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
  RAKU_COLORS,
  RAKU_RADIUS,
  RAKU_SPACING,
  RAKU_TYPOGRAPHY,
  type RakuColorPalette,
  type ThemeMode
} from '@raku/design-tokens';

export type ThemePreference = 'system' | ThemeMode;

interface ThemeContextValue {
  mode: ThemeMode;
  preference: ThemePreference;
  colors: RakuColorPalette;
  spacing: typeof RAKU_SPACING;
  radius: typeof RAKU_RADIUS;
  typography: typeof RAKU_TYPOGRAPHY;
  setPreference: (pref: ThemePreference) => void;
}

const THEME_STORAGE_KEY = 'raku_mobile_theme_pref_v1';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    void AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setPreferenceState(saved);
        }
      })
      .catch(() => {});
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
  };

  const mode: ThemeMode =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      preference,
      colors: RAKU_COLORS[mode],
      spacing: RAKU_SPACING,
      radius: RAKU_RADIUS,
      typography: RAKU_TYPOGRAPHY,
      setPreference
    }),
    [mode, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useRakuTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useRakuTheme must be used inside ThemeProvider');
  }
  return ctx;
}
