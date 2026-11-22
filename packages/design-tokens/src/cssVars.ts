import { RAKU_COLORS, RAKU_NEUTRAL_SCALE, type ThemeMode } from './tokens.js';

/**
 * Converts a 6-digit hex color (e.g. "#F6F3EB") into space-separated RGB channels
 * ("246 243 235") compatible with Tailwind `rgb(var(--token) / <alpha-value>)`.
 */
export function hexToRgbChannels(hex: string): string {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Invalid 6-digit hex color: ${hex}`);
  }
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export function buildRakuCssVariables(mode: ThemeMode): Record<string, string> {
  const palette = RAKU_COLORS[mode];
  const neutral = RAKU_NEUTRAL_SCALE[mode];
  const vars: Record<string, string> = {
    '--raku-canvas': hexToRgbChannels(palette.canvas),
    '--raku-surface': hexToRgbChannels(palette.surface),
    '--raku-subtle': hexToRgbChannels(palette.subtle),
    '--raku-ink': hexToRgbChannels(palette.ink),
    '--raku-body': hexToRgbChannels(palette.body),
    '--raku-muted': hexToRgbChannels(palette.muted),
    '--raku-line': hexToRgbChannels(palette.line),
    '--raku-line-strong': hexToRgbChannels(palette.lineStrong),
    '--raku-accent': hexToRgbChannels(palette.accent),
    '--raku-accent-hover': hexToRgbChannels(palette.accentHover),
    '--raku-accent-soft': hexToRgbChannels(palette.accentSoft),
    '--raku-on-accent': hexToRgbChannels(palette.onAccent),
    '--raku-signal': hexToRgbChannels(palette.signal),
    '--raku-signal-soft': hexToRgbChannels(palette.signalSoft),
    '--raku-again': hexToRgbChannels(palette.again),
    '--raku-again-soft': hexToRgbChannels(palette.againSoft),
    '--raku-hard': hexToRgbChannels(palette.hard),
    '--raku-hard-soft': hexToRgbChannels(palette.hardSoft),
    '--raku-good': hexToRgbChannels(palette.good),
    '--raku-good-soft': hexToRgbChannels(palette.goodSoft),
    '--raku-easy': hexToRgbChannels(palette.easy),
    '--raku-easy-soft': hexToRgbChannels(palette.easySoft)
  };

  for (const [step, hex] of Object.entries(neutral)) {
    vars[`--raku-neutral-${step}`] = hexToRgbChannels(hex);
  }

  return vars;
}
