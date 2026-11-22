import { describe, expect, it } from 'vitest';
import {
  RAKU_COLORS,
  RAKU_NEUTRAL_SCALE,
  RAKU_SPACING,
  RAKU_TYPOGRAPHY,
  buildRakuCssVariables,
  hexToRgbChannels
} from './index.js';

describe('@raku/design-tokens', () => {
  it('defines complete light and dark palettes with valid 6-digit hex codes', () => {
    const lightKeys = Object.keys(RAKU_COLORS.light).sort();
    const darkKeys = Object.keys(RAKU_COLORS.dark).sort();
    expect(lightKeys).toEqual(darkKeys);

    for (const mode of ['light', 'dark'] as const) {
      for (const hex of Object.values(RAKU_COLORS[mode])) {
        expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      for (const hex of Object.values(RAKU_NEUTRAL_SCALE[mode])) {
        expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('keeps spacing values aligned to the 4/8-point grid', () => {
    for (const value of Object.values(RAKU_SPACING)) {
      expect(value % 4).toBe(0);
    }
  });

  it('converts hex tokens to Tailwind RGB channel strings', () => {
    expect(hexToRgbChannels('#F6F3EB')).toBe('246 243 235');
    expect(hexToRgbChannels('#245C52')).toBe('36 92 82');
    expect(() => hexToRgbChannels('#FFF')).toThrow();

    const lightVars = buildRakuCssVariables('light');
    const darkVars = buildRakuCssVariables('dark');
    expect(lightVars['--raku-canvas']).toBe('246 243 235');
    expect(darkVars['--raku-canvas']).toBe('21 29 27');
    expect(Object.keys(lightVars).sort()).toEqual(Object.keys(darkVars).sort());
  });

  it('declares Vietnamese and Japanese font families cleanly', () => {
    expect(RAKU_TYPOGRAPHY.fontFamily.viWeb[0]).toContain('Be Vietnam Pro');
    expect(RAKU_TYPOGRAPHY.fontFamily.jpWeb[0]).toContain('Zen Kaku Gothic New');
  });
});
