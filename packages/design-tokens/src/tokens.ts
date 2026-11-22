export type ThemeMode = 'light' | 'dark';

export interface RakuColorPalette {
  canvas: string;
  surface: string;
  subtle: string;
  ink: string;
  body: string;
  muted: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  onAccent: string;
  signal: string;
  signalSoft: string;
  again: string;
  againSoft: string;
  hard: string;
  hardSoft: string;
  good: string;
  goodSoft: string;
  easy: string;
  easySoft: string;
}

/**
 * Washi · Sumi · Hanko palette (60/30/10 rule).
 * Shared as the single source of truth between @raku/web and @raku/mobile.
 */
export const RAKU_COLORS: Record<ThemeMode, RakuColorPalette> = {
  light: {
    canvas: '#F6F3EB',
    surface: '#FFFCF7',
    subtle: '#EFE9DC',
    ink: '#1F2D29',
    body: '#364640',
    muted: '#5B6B65',
    line: '#E2DACB',
    lineStrong: '#CFC5B2',
    accent: '#245C52',
    accentHover: '#1C4B42',
    accentSoft: '#E2ECE5',
    onAccent: '#FFFCF7',
    signal: '#B84A39',
    signalSoft: '#F7E6E2',
    again: '#B84A39',
    againSoft: '#F7E6E2',
    hard: '#A46822',
    hardSoft: '#F6ECD8',
    good: '#245C52',
    goodSoft: '#E2ECE5',
    easy: '#3B6D8C',
    easySoft: '#E3EEF4'
  },
  dark: {
    canvas: '#151D1B',
    surface: '#1D2724',
    subtle: '#25332F',
    ink: '#F2EFE6',
    body: '#D3DDD6',
    muted: '#96A89E',
    line: '#2E3E39',
    lineStrong: '#3E524B',
    accent: '#8CC9A4',
    accentHover: '#A2D6B6',
    accentSoft: '#23372F',
    onAccent: '#151D1B',
    signal: '#EE8B75',
    signalSoft: '#3A2521',
    again: '#EE8B75',
    againSoft: '#3A2521',
    hard: '#E3B46F',
    hardSoft: '#362D1F',
    good: '#8CC9A4',
    goodSoft: '#23372F',
    easy: '#88BBD9',
    easySoft: '#21323D'
  }
};

/**
 * Neutral ramp mapped cleanly to Washi/Sumi tones for Tailwind slate compatibility.
 */
export const RAKU_NEUTRAL_SCALE: Record<ThemeMode, Record<string, string>> = {
  light: {
    '50': '#F6F3EB',
    '100': '#EFE9DC',
    '200': '#E2DACB',
    '300': '#C5BEAF',
    '400': '#8B9993',
    '500': '#6B7B74',
    '600': '#5B6B65',
    '700': '#44544E',
    '800': '#31403B',
    '900': '#1F2D29',
    '950': '#151D1B'
  },
  dark: {
    '50': '#F2EFE6',
    '100': '#DCE3DC',
    '200': '#B8C5BC',
    '300': '#96A89E',
    '400': '#7D9287',
    '500': '#63796E',
    '600': '#4B6157',
    '700': '#3A4E46',
    '800': '#25332F',
    '900': '#1D2724',
    '950': '#151D1B'
  }
};

/**
 * Typography tokens: 4 core UI sizes + dedicated Japanese card display sizes.
 */
export const RAKU_TYPOGRAPHY = {
  fontFamily: {
    viWeb: ['"Be Vietnam Pro"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
    jpWeb: ['"Zen Kaku Gothic New"', '"Noto Sans JP"', 'sans-serif'],
    viNative: {
      regular: 'BeVietnamPro_400Regular',
      medium: 'BeVietnamPro_500Medium',
      semibold: 'BeVietnamPro_600SemiBold',
      bold: 'BeVietnamPro_700Bold'
    },
    jpNative: {
      regular: 'ZenKakuGothicNew_400Regular',
      medium: 'ZenKakuGothicNew_500Medium',
      bold: 'ZenKakuGothicNew_700Bold'
    }
  },
  size: {
    caption: 12,
    body: 15,
    title: 20,
    display: 28,
    jpWord: 40,
    jpKanji: 56
  },
  lineHeight: {
    caption: 16,
    body: 22,
    title: 26,
    display: 34,
    jpWord: 52,
    jpKanji: 68
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700'
  }
} as const;

/**
 * 8-point grid spacing scale (divisible by 4 or 8).
 */
export const RAKU_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48
} as const;

/**
 * Calm, natural radii — avoiding overuse of oversized pill/3xl corners.
 */
export const RAKU_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 9999
} as const;

/**
 * Subtle, grounded motion durations (ms).
 */
export const RAKU_MOTION = {
  pressMs: 110,
  transitionMs: 180,
  cardEnterMs: 220,
  shakeMs: 260,
  progressMs: 300
} as const;
