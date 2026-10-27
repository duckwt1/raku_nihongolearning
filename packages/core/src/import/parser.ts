import { normalizeKana, normalizeNfc } from '../text/normalize.js';
import { ImportRecord, JlptLevel } from '../models/schemas.js';
import { WORDS_BY_SURFACE, KANJI_BY_CHAR } from '../data/index.js';

export type Delimiter = '\t' | ',' | ';' | '|';

export interface ColumnMapping {
  surfaceIndex: number;
  readingIndex?: number;
  meaningIndex?: number;
  hanVietIndex?: number;
  posIndex?: number;
  exampleJpIndex?: number;
  exampleViIndex?: number;
  tagsIndex?: number;
}

export interface ParseOptions {
  delimiter?: Delimiter;
  hasHeaderRow?: boolean;
  columnMapping?: ColumnMapping;
  targetJlpt?: JlptLevel;
  batchTags?: string[];
}

export interface ParseResult {
  records: ImportRecord[];
  totalLines: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  duplicateCount: number;
  newKanjiChars: string[];
}

/**
 * Automatically detects the most likely delimiter from text lines.
 */
export function detectDelimiter(text: string): Delimiter {
  const sampleLines = text.split(/\r?\n/).slice(0, 10).filter((l) => l.trim().length > 0);
  if (sampleLines.length === 0) return '\t';

  const counts: Record<Delimiter, number> = { '\t': 0, ',': 0, ';': 0, '|': 0 };

  for (const line of sampleLines) {
    counts['\t'] += (line.match(/\t/g) || []).length;
    counts[','] += (line.match(/,/g) || []).length;
    counts[';'] += (line.match(/;/g) || []).length;
    counts['|'] += (line.match(/\|/g) || []).length;
  }

  const sorted = (Object.keys(counts) as Delimiter[]).sort((a, b) => counts[b] - counts[a]);
  const best = sorted[0];
  return counts[best || '\t'] > 0 ? (best || '\t') : '\t';
}

/**
 * Parses a single CSV line supporting standard quoted fields (RFC-4180).
 */
export function parseDelimitedLine(line: string, delimiter: Delimiter): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Strips HTML tags and dangerous characters, converts to plain text.
 */
export function cleanRawText(input: string): string {
  if (!input) return '';
  return input
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); // remove control chars
}

/**
 * Generates a deterministic ID for a vocabulary item: `word_${hash}`
 */
export function generateDeterministicWordId(surface: string, reading: string): string {
  const key = `${normalizeNfc(surface)}_${normalizeKana(reading)}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return `w_${Math.abs(hash).toString(36)}`;
}

/**
 * Parses and filters text/file input (Section 5B.1–5B.3).
 */
export function parseAndFilterImport(
  rawText: string,
  options: ParseOptions = {}
): ParseResult {
  // 1. Clean input & normalize
  const cleanInput = cleanRawText(rawText);
  const normalized = normalizeNfc(cleanInput.replace(/^\uFEFF/, '')); // strip BOM

  const lines = normalized.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = options.delimiter || detectDelimiter(normalized);

  const startIndex = options.hasHeaderRow ? 1 : 0;
  const processedLines = lines.slice(startIndex);

  const records: ImportRecord[] = [];
  const seenBatchKeys = new Set<string>();
  const newKanjiSet = new Set<string>();

  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;

  processedLines.forEach((line, idx) => {
    const rowNumber = idx + startIndex + 1;
    const cols = parseDelimitedLine(line, delimiter);

    // Tự động nhận diện cấu trúc cột thông minh nếu người dùng không chỉ định columnMapping
    let mapping: ColumnMapping;
    if (options.columnMapping) {
      mapping = options.columnMapping;
    } else {
      const c1 = cols[1]?.trim() || '';
      const isCol1Kana = /^[\u3040-\u309F\u30A0-\u30FF\u30FC\s（）()・/、,]+$/.test(c1);
      // Nếu cột 1 là Kana hoặc bỏ trống (để tra từ điển), cột 1 là cột cách đọc
      const isCol1Reading = isCol1Kana || c1 === '';
      const containsJapanese = (str: string) => /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(str);

      if (cols.length >= 6) {
        if (isCol1Reading) {
          // 6 cột chuẩn: Từ vựng -> Cách đọc -> Nghĩa -> Hán Việt -> Ví dụ tiếng Nhật -> Dịch nghĩa
          mapping = {
            surfaceIndex: 0,
            readingIndex: 1,
            meaningIndex: 2,
            hanVietIndex: 3,
            exampleJpIndex: 4,
            exampleViIndex: 5
          };
        } else {
          // 6 cột không có cách đọc riêng: Từ vựng -> Nghĩa -> Hán Việt -> Ví dụ tiếng Nhật -> Dịch nghĩa -> Khác
          mapping = {
            surfaceIndex: 0,
            meaningIndex: 1,
            hanVietIndex: 2,
            exampleJpIndex: 3,
            exampleViIndex: 4,
            posIndex: 5
          };
        }
      } else if (cols.length === 5) {
        if (isCol1Reading) {
          if (containsJapanese(cols[3] || '')) {
            // 5 cột có cách đọc: Từ vựng -> Cách đọc -> Nghĩa -> Ví dụ tiếng Nhật -> Dịch nghĩa
            mapping = {
              surfaceIndex: 0,
              readingIndex: 1,
              meaningIndex: 2,
              exampleJpIndex: 3,
              exampleViIndex: 4
            };
          } else {
            // 5 cột: Từ vựng -> Cách đọc -> Nghĩa -> Hán Việt -> Ví dụ JP
            mapping = {
              surfaceIndex: 0,
              readingIndex: 1,
              meaningIndex: 2,
              hanVietIndex: 3,
              exampleJpIndex: 4
            };
          }
        } else {
          // 5 CỘT ĐÚNG CHUẨN USER YÊU CẦU: Từ vựng -> Nghĩa -> Hán Việt -> Ví dụ tiếng Nhật -> Dịch nghĩa
          mapping = {
            surfaceIndex: 0,
            meaningIndex: 1,
            hanVietIndex: 2,
            exampleJpIndex: 3,
            exampleViIndex: 4
          };
        }
      } else if (cols.length === 4) {
        if (isCol1Reading) {
          const c3 = cols[3]?.trim() || '';
          const isPos = /^(danh từ|động từ|tính từ|phó từ|thành ngữ|trợ từ|liên từ|lượng từ|noun|verb|adj|adverb|名詞|動詞|形容詞|副詞)/i.test(c3);
          const isExJp = containsJapanese(c3);
          mapping = {
            surfaceIndex: 0,
            readingIndex: 1,
            meaningIndex: 2,
            posIndex: isPos ? 3 : undefined,
            exampleJpIndex: !isPos && isExJp ? 3 : undefined,
            hanVietIndex: !isPos && !isExJp ? 3 : undefined
          };
        } else {
          // Từ vựng -> Nghĩa -> Hán Việt -> Ví dụ hoặc Từ loại
          const c3 = cols[3]?.trim() || '';
          const isPos = /^(danh từ|động từ|tính từ|phó từ|thành ngữ|trợ từ|liên từ|lượng từ|noun|verb|adj|adverb|名詞|動詞|形容詞|副詞)/i.test(c3);
          mapping = {
            surfaceIndex: 0,
            meaningIndex: 1,
            hanVietIndex: 2,
            posIndex: isPos ? 3 : undefined,
            exampleJpIndex: !isPos ? 3 : undefined
          };
        }
      } else if (cols.length === 3) {
        if (isCol1Reading) {
          mapping = { surfaceIndex: 0, readingIndex: 1, meaningIndex: 2 };
        } else {
          mapping = { surfaceIndex: 0, meaningIndex: 1, hanVietIndex: 2 };
        }
      } else {
        mapping = { surfaceIndex: 0, meaningIndex: 1 };
      }
    }

    const surfaceRaw = cols[mapping.surfaceIndex] || '';
    const readingRaw = mapping.readingIndex !== undefined ? cols[mapping.readingIndex] || '' : '';
    const meaningRaw = mapping.meaningIndex !== undefined ? cols[mapping.meaningIndex] || '' : '';
    const hanVietRaw = mapping.hanVietIndex !== undefined ? cols[mapping.hanVietIndex] || '' : '';
    const posRaw = mapping.posIndex !== undefined ? cols[mapping.posIndex] || '' : '';
    const exJpRaw = mapping.exampleJpIndex !== undefined ? cols[mapping.exampleJpIndex] || '' : '';
    const exViRaw = mapping.exampleViIndex !== undefined ? cols[mapping.exampleViIndex] || '' : '';
    const tagsRaw = mapping.tagsIndex !== undefined ? cols[mapping.tagsIndex] || '' : '';

    let surface = normalizeNfc(surfaceRaw.trim());
    let reading = normalizeKana(readingRaw.trim());

    // Tự động bóc tách cách đọc nếu từ vựng được viết dạng: 預かる[あずかる] hoặc 男性(だんせい)
    const bracketMatch = surface.match(/^(.+?)[\[\(（]([\u3040-\u309F\u30A0-\u30FF\u30FC\s]+)[\]\)）]$/);
    if (bracketMatch && bracketMatch[1] && bracketMatch[2]) {
      surface = bracketMatch[1].trim();
      if (!reading) {
        reading = normalizeKana(bracketMatch[2].trim());
      }
    }

    let meaningVi = normalizeNfc(meaningRaw.trim());
    let pos = posRaw ? normalizeNfc(posRaw.trim()) : undefined;
    let hanViet = hanVietRaw
      ? hanVietRaw
          .split(/[\s,;—–-]+/)
          .filter((x) => x && !/^[-—–_x/]+$/i.test(x))
      : undefined;
    if (hanViet && hanViet.length === 0) {
      hanViet = undefined;
    }

    const provenance: ImportRecord['provenance'] = {
      surface: 'user'
    };
    const issues: string[] = [];

    // Validation checks (Section 5B.3)
    if (!surface) {
      errorCount++;
      issues.push('Thiếu từ (surface)');
      records.push({
        sourceRow: rowNumber,
        sourceText: line,
        surface: '',
        readings: [],
        meaningVi: '',
        confidence: 0,
        provenance,
        issues
      });
      return;
    }

    const hasKanji = /[\u4E00-\u9FAF\u3400-\u4DBF]/.test(surface);

    // Cross-reference internal dictionary (Section 5B.3.4)
    const dictMatches = WORDS_BY_SURFACE.get(surface);
    if (dictMatches && dictMatches.length > 0) {
      const match = dictMatches[0]!;

      // Propose missing reading from dictionary
      if (!reading && match.readings[0]) {
        reading = match.readings[0];
        provenance.readings = 'dictionary';
        issues.push('Cách đọc được điền tự động từ từ điển nội bộ');
      } else if (reading && match.readings[0] && reading !== match.readings[0]) {
        issues.push(`Cách đọc (${reading}) khác với từ điển (${match.readings[0]})`);
      }

      // Propose missing meaning
      if (!meaningVi && match.meaningVi) {
        meaningVi = match.meaningVi;
        provenance.meaningVi = 'dictionary';
        issues.push('Nghĩa tiếng Việt được điền từ từ điển');
      }

      // Propose missing Han Viet & POS
      if (!hanViet && match.hanVietBreakdown?.length) {
        hanViet = match.hanVietBreakdown;
        provenance.hanViet = 'dictionary';
      }
      if (!pos && match.pos) {
        pos = match.pos;
        provenance.pos = 'dictionary';
      }
    }

    // Kanji check
    if (hasKanji) {
      const kanjiChars = surface.match(/[\u4E00-\u9FAF\u3400-\u4DBF]/g) || [];
      for (const k of kanjiChars) {
        if (!KANJI_BY_CHAR.has(k)) {
          newKanjiSet.add(k);
          issues.push(`Chữ Hán "${k}" chưa có trong từ điển chuẩn`);
        }
      }

      if (!reading) {
        issues.push('Từ có chữ Hán nhưng thiếu cách đọc hiragana');
      }
    } else {
      // Kana-only word: reading is surface if empty
      if (!reading) {
        reading = surface;
      }
    }

    if (!meaningVi) {
      issues.push('Thiếu nghĩa tiếng Việt');
    }

    // De-duplication check within batch
    const dedupeKey = `${surface}_${reading}`;
    if (seenBatchKeys.has(dedupeKey)) {
      duplicateCount++;
      issues.push('Trùng lặp với dòng trước trong cùng tệp');
    } else {
      seenBatchKeys.add(dedupeKey);
    }

    // Status classification
    const hasError = !surface || (hasKanji && !reading && !dictMatches);
    const hasWarning = issues.length > 0 && !hasError;

    if (hasError) {
      errorCount++;
    } else if (hasWarning) {
      warningCount++;
    } else {
      validCount++;
    }

    const tags = [
      ...(options.batchTags || []),
      ...(tagsRaw ? tagsRaw.split(/[,;\s]+/).filter(Boolean) : [])
    ];

    records.push({
      sourceRow: rowNumber,
      sourceText: line,
      surface,
      readings: reading ? [reading] : [],
      meaningVi,
      hanViet,
      pos,
      jlpt: options.targetJlpt,
      exampleJp: exJpRaw ? normalizeNfc(exJpRaw.trim()) : undefined,
      exampleVi: exViRaw ? normalizeNfc(exViRaw.trim()) : undefined,
      tags: tags.length > 0 ? tags : undefined,
      confidence: hasError ? 0.2 : hasWarning ? 0.7 : 1.0,
      provenance,
      issues
    });
  });

  return {
    records,
    totalLines: processedLines.length,
    validCount,
    warningCount,
    errorCount,
    duplicateCount,
    newKanjiChars: Array.from(newKanjiSet)
  };
}

/**
 * Exports an array of records to standard CSV / TSV text (roundtrip).
 */
export function exportRecordsToDelimited(
  records: ImportRecord[],
  delimiter: Delimiter = '\t'
): string {
  const header = ['surface', 'reading', 'meaningVi', 'hanViet', 'pos', 'exampleJp', 'exampleVi', 'tags'];
  const lines: string[] = [header.join(delimiter)];

  for (const r of records) {
    const reading = r.readings[0] || '';
    const hanViet = (r.hanViet || []).join(' ');
    const tags = (r.tags || []).join(';');

    // Quote fields if they contain delimiter or quotes
    const quote = (val: string) => {
      if (val.includes(delimiter) || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    lines.push(
      [
        quote(r.surface),
        quote(reading),
        quote(r.meaningVi),
        quote(hanViet),
        quote(r.pos || ''),
        quote(r.exampleJp || ''),
        quote(r.exampleVi || ''),
        quote(tags)
      ].join(delimiter)
    );
  }

  return lines.join('\n');
}
