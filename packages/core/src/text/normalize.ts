/**
 * Text normalization utilities for Japanese and Vietnamese.
 * Pure TS, zero runtime dependencies.
 */

// Mapping table for half-width katakana to full-width katakana
const HALF_TO_FULL_KANA: Record<string, string> = {
  'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
  'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ', 'ｯ': 'ッ', 'ｰ': 'ー',
  'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
  'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
  'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
  'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
  'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
  'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
  'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
  'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
  'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
  'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
  '･': '・'
};

const DAKUTEN_MAP: Record<string, string> = {
  'ｶ': 'ガ', 'ｷ': 'ギ', 'ｸ': 'グ', 'ｹ': 'ゲ', 'ｺ': 'ゴ',
  'ｻ': 'ザ', 'ｼ': 'ジ', 'ｽ': 'ズ', 'ｾ': 'ゼ', 'ｿ': 'ゾ',
  'ﾀ': 'ダ', 'ﾁ': 'ヂ', 'ﾂ': 'ヅ', 'ﾃ': 'デ', 'ﾄ': 'ド',
  'ﾊ': 'バ', 'ﾋ': 'ビ', 'ﾌ': 'ブ', 'ﾍ': 'ベ', 'ﾎ': 'ボ',
  'ｳ': 'ヴ'
};

const HANDAKUTEN_MAP: Record<string, string> = {
  'ﾊ': 'パ', 'ﾋ': 'ピ', 'ﾌ': 'プ', 'ﾍ': 'ペ', 'ﾎ': 'ポ'
};

/**
 * Normalizes text to Unicode NFC form.
 * Ensures Vietnamese combining accents are composed cleanly (e.g. đồ instead of đô`).
 */
export function normalizeNfc(text: string): string {
  if (!text) return '';
  return text.normalize('NFC');
}

/**
 * Converts half-width katakana (and voiced marks ﾞ, ﾟ) to full-width katakana.
 */
export function halfWidthKatakanaToFullWidth(text: string): string {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!char) continue;
    const nextChar = text[i + 1];

    if (nextChar === 'ﾞ' && DAKUTEN_MAP[char]) {
      result += DAKUTEN_MAP[char];
      i++; // skip dakuten
    } else if (nextChar === 'ﾟ' && HANDAKUTEN_MAP[char]) {
      result += HANDAKUTEN_MAP[char];
      i++; // skip handakuten
    } else if (HALF_TO_FULL_KANA[char]) {
      result += HALF_TO_FULL_KANA[char];
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Converts full-width Katakana to Hiragana.
 * Preserves prolonged sound mark 'ー', spaces, and non-katakana characters.
 */
export function katakanaToHiragana(text: string): string {
  if (!text) return '';
  return text.replace(/[\u30A1-\u30F6]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0x60);
  });
}

/**
 * Standardizes Japanese kana readings:
 * 1. NFC normalization.
 * 2. Full-width spaces and control spaces -> removed.
 * 3. Half-width katakana -> full-width katakana.
 * 4. Katakana -> Hiragana.
 * 5. Trims leading/trailing whitespace.
 */
export function normalizeKana(text: string): string {
  if (!text) return '';
  const nfc = normalizeNfc(text);
  const withoutSpaces = nfc.replace(/[\s\u3000]+/g, '');
  const fullWidthKana = halfWidthKatakanaToFullWidth(withoutSpaces);
  return katakanaToHiragana(fullWidthKana);
}
