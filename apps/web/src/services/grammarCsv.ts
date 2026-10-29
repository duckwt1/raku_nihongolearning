import Papa from 'papaparse';
import JSZip from 'jszip';
import {
  GrammarSchema,
  JlptLevelSchema,
  type Grammar,
  type GrammarComparison,
  type GrammarExample,
  type GrammarFormation,
  type GrammarMistake,
  type GrammarUsage,
  type JlptLevel
} from '@raku/core';

export const GRAMMAR_CSV_FILES = {
  points: 'grammar_points.csv',
  examples: 'grammar_examples.csv',
  formation: 'grammar_formation.csv',
  usage: 'grammar_usage.csv',
  mistakes: 'grammar_mistakes.csv',
  comparisons: 'grammar_comparisons.csv',
  relations: 'grammar_relations.csv'
} as const;

export interface GrammarCsvBundle {
  files: Record<string, string>;
}

export interface GrammarCsvIssue {
  file: string;
  row?: number;
  message: string;
}

export interface GrammarCsvStats {
  points: number;
  examples: number;
  formation: number;
  usage: number;
  mistakes: number;
  comparisons: number;
  relations: number;
}

export interface GrammarCsvParseResult {
  points: Grammar[];
  issues: GrammarCsvIssue[];
  stats: GrammarCsvStats;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function parseCsv(text: string, file: string, issues: GrammarCsvIssue[]): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(stripBom(text), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim()
  });

  for (const error of parsed.errors) {
    issues.push({
      file,
      row: error.row !== undefined ? error.row + 2 : undefined,
      message: error.message
    });
  }

  return parsed.data.map((row) => {
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      clean[key] = typeof value === 'string' ? value.trim() : '';
    }
    return clean;
  });
}

function splitList(value?: string): string[] {
  if (!value) return [];
  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value?: string): number | undefined {
  if (!value || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function readZip(file: File): Promise<GrammarCsvBundle> {
  const zip = await JSZip.loadAsync(file);
  const files: Record<string, string> = {};
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  for (const entry of entries) {
    const baseName = entry.name.split('/').pop() || entry.name;
    if (!Object.values(GRAMMAR_CSV_FILES).includes(baseName as never)) continue;
    files[baseName] = await entry.async('string');
  }
  return { files };
}

async function readFiles(files: File[]): Promise<GrammarCsvBundle> {
  const bundle: GrammarCsvBundle = { files: {} };
  for (const file of files) {
    const baseName = file.name.split('/').pop() || file.name;
    if (!Object.values(GRAMMAR_CSV_FILES).includes(baseName as never)) continue;
    bundle.files[baseName] = await file.text();
  }
  return bundle;
}

export async function readGrammarCsvBundle(files: File[]): Promise<GrammarCsvBundle> {
  if (files.length === 1 && /\.zip$/i.test(files[0]!.name)) {
    return readZip(files[0]!);
  }
  return readFiles(files);
}

export function parseGrammarCsvBundle(bundle: GrammarCsvBundle): GrammarCsvParseResult {
  const issues: GrammarCsvIssue[] = [];
  const stats: GrammarCsvStats = {
    points: 0,
    examples: 0,
    formation: 0,
    usage: 0,
    mistakes: 0,
    comparisons: 0,
    relations: 0
  };

  const pointsFile = GRAMMAR_CSV_FILES.points;
  if (!bundle.files[pointsFile]) {
    return {
      points: [],
      issues: [{ file: pointsFile, message: 'Thiếu file grammar_points.csv.' }],
      stats
    };
  }

  const pointRows = parseCsv(bundle.files[pointsFile]!, pointsFile, issues);
  const exampleRows = bundle.files[GRAMMAR_CSV_FILES.examples]
    ? parseCsv(bundle.files[GRAMMAR_CSV_FILES.examples]!, GRAMMAR_CSV_FILES.examples, issues)
    : [];
  const formationRows = bundle.files[GRAMMAR_CSV_FILES.formation]
    ? parseCsv(bundle.files[GRAMMAR_CSV_FILES.formation]!, GRAMMAR_CSV_FILES.formation, issues)
    : [];
  const usageRows = bundle.files[GRAMMAR_CSV_FILES.usage]
    ? parseCsv(bundle.files[GRAMMAR_CSV_FILES.usage]!, GRAMMAR_CSV_FILES.usage, issues)
    : [];
  const mistakeRows = bundle.files[GRAMMAR_CSV_FILES.mistakes]
    ? parseCsv(bundle.files[GRAMMAR_CSV_FILES.mistakes]!, GRAMMAR_CSV_FILES.mistakes, issues)
    : [];
  const comparisonRows = bundle.files[GRAMMAR_CSV_FILES.comparisons]
    ? parseCsv(bundle.files[GRAMMAR_CSV_FILES.comparisons]!, GRAMMAR_CSV_FILES.comparisons, issues)
    : [];
  const relationRows = bundle.files[GRAMMAR_CSV_FILES.relations]
    ? parseCsv(bundle.files[GRAMMAR_CSV_FILES.relations]!, GRAMMAR_CSV_FILES.relations, issues)
    : [];

  stats.examples = exampleRows.length;
  stats.formation = formationRows.length;
  stats.usage = usageRows.length;
  stats.mistakes = mistakeRows.length;
  stats.comparisons = comparisonRows.length;
  stats.relations = relationRows.length;

  const examplesByGrammar = new Map<string, GrammarExample[]>();
  for (const [index, row] of exampleRows.entries()) {
    const grammarId = row.grammar_id;
    if (!grammarId) {
      issues.push({ file: GRAMMAR_CSV_FILES.examples, row: index + 2, message: 'Thiếu grammar_id.' });
      continue;
    }
    const example: GrammarExample = {
      id: row.example_id || `ex_${index + 1}`,
      jp: row.jp || '',
      vi: row.vi || '',
      highlight: row.highlight || undefined,
      breakdown: row.breakdown || undefined,
      note: row.note || undefined
    };
    const list = examplesByGrammar.get(grammarId) || [];
    list.push(example);
    examplesByGrammar.set(grammarId, list);
  }
  for (const [grammarId, examples] of examplesByGrammar) {
    examplesByGrammar.set(
      grammarId,
      examples.sort((a, b) => {
        const aOrder = exampleRows.find((row) => row.grammar_id === grammarId && row.example_id === a.id)?.order;
        const bOrder = exampleRows.find((row) => row.grammar_id === grammarId && row.example_id === b.id)?.order;
        return Number(aOrder || 0) - Number(bOrder || 0);
      })
    );
  }

  const formationByGrammar = new Map<string, GrammarFormation[]>();
  for (const [index, row] of formationRows.entries()) {
    if (!row.grammar_id) {
      issues.push({ file: GRAMMAR_CSV_FILES.formation, row: index + 2, message: 'Thiếu grammar_id.' });
      continue;
    }
    const list = formationByGrammar.get(row.grammar_id) || [];
    list.push({ rule: row.rule || '', example: row.example || undefined, note: row.note || undefined });
    formationByGrammar.set(row.grammar_id, list);
  }

  const usageByGrammar = new Map<string, GrammarUsage[]>();
  for (const [index, row] of usageRows.entries()) {
    if (!row.grammar_id) {
      issues.push({ file: GRAMMAR_CSV_FILES.usage, row: index + 2, message: 'Thiếu grammar_id.' });
      continue;
    }
    const list = usageByGrammar.get(row.grammar_id) || [];
    list.push({
      situation: row.situation || '',
      explanationVi: row.explanation_vi || '',
      exampleIds: splitList(row.example_ids)
    });
    usageByGrammar.set(row.grammar_id, list);
  }

  const mistakesByGrammar = new Map<string, GrammarMistake[]>();
  for (const [index, row] of mistakeRows.entries()) {
    if (!row.grammar_id) {
      issues.push({ file: GRAMMAR_CSV_FILES.mistakes, row: index + 2, message: 'Thiếu grammar_id.' });
      continue;
    }
    const list = mistakesByGrammar.get(row.grammar_id) || [];
    list.push({
      mistake: row.mistake || '',
      correction: row.correction || '',
      explanationVi: row.explanation_vi || undefined
    });
    mistakesByGrammar.set(row.grammar_id, list);
  }

  const comparisonsByGrammar = new Map<string, GrammarComparison[]>();
  for (const [index, row] of comparisonRows.entries()) {
    if (!row.grammar_id) {
      issues.push({ file: GRAMMAR_CSV_FILES.comparisons, row: index + 2, message: 'Thiếu grammar_id.' });
      continue;
    }
    if (!row.pattern || !row.difference_vi) {
      issues.push({
        file: GRAMMAR_CSV_FILES.comparisons,
        row: index + 2,
        message: 'Comparison cần pattern và difference_vi.'
      });
      continue;
    }
    const list = comparisonsByGrammar.get(row.grammar_id) || [];
    list.push({
      grammarId: row.compare_grammar_id || undefined,
      pattern: row.pattern,
      differenceVi: row.difference_vi,
      example:
        row.example_jp && row.example_vi
          ? { jp: row.example_jp, vi: row.example_vi }
          : undefined
    });
    comparisonsByGrammar.set(row.grammar_id, list);
  }

  const relationsByGrammar = new Map<string, string[]>();
  for (const [index, row] of relationRows.entries()) {
    if (!row.grammar_id || !row.related_id) {
      issues.push({
        file: GRAMMAR_CSV_FILES.relations,
        row: index + 2,
        message: 'Relations cần grammar_id và related_id.'
      });
      continue;
    }
    const list = relationsByGrammar.get(row.grammar_id) || [];
    list.push(row.related_id);
    relationsByGrammar.set(row.grammar_id, list);
  }

  const points: Grammar[] = [];
  const seenIds = new Set<string>();

  for (const [index, row] of pointRows.entries()) {
    const rowNumber = index + 2;
    if (!row.id) {
      issues.push({ file: pointsFile, row: rowNumber, message: 'Thiếu id.' });
      continue;
    }
    if (seenIds.has(row.id)) {
      issues.push({ file: pointsFile, row: rowNumber, message: `Trùng id "${row.id}".` });
      continue;
    }
    seenIds.add(row.id);

    const jlptCheck = JlptLevelSchema.safeParse(row.jlpt);
    if (!jlptCheck.success) {
      issues.push({
        file: pointsFile,
        row: rowNumber,
        message: `JLPT không hợp lệ: "${row.jlpt}".`
      });
      continue;
    }

    const candidate = {
      id: row.id,
      jlpt: jlptCheck.data as JlptLevel,
      lesson: toNumber(row.lesson),
      order: toNumber(row.order),
      pattern: row.pattern || '',
      title: row.title || '',
      meaningVi: splitList(row.meaning_vi),
      explanationVi: row.explanation_vi || '',
      formation: formationByGrammar.get(row.id) || [],
      usage: usageByGrammar.get(row.id) || [],
      nuanceVi: row.nuance_vi || undefined,
      notes: splitList(row.notes),
      commonMistakes: mistakesByGrammar.get(row.id) || [],
      comparisons: comparisonsByGrammar.get(row.id) || [],
      examples: examplesByGrammar.get(row.id) || [],
      tags: splitList(row.tags),
      relatedIds: relationsByGrammar.get(row.id) || [],
      schemaVersion: 1,
      updatedAt: row.updated_at || undefined
    };

    const parsed = GrammarSchema.safeParse(candidate);
    if (!parsed.success) {
      const messages = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      issues.push({ file: pointsFile, row: rowNumber, message: messages });
      continue;
    }

    const exampleIds = new Set(parsed.data.examples.map((example) => example.id));
    for (const usage of parsed.data.usage) {
      for (const exampleId of usage.exampleIds) {
        if (!exampleIds.has(exampleId)) {
          issues.push({
            file: GRAMMAR_CSV_FILES.usage,
            row: rowNumber,
            message: `usage.example_ids "${exampleId}" không tồn tại trong examples của ${row.id}.`
          });
        }
      }
    }

    if (parsed.data.examples.some((example) => /Ví dụ minh họa/i.test(example.vi))) {
      issues.push({
        file: GRAMMAR_CSV_FILES.examples,
        row: rowNumber,
        message: `Ví dụ của ${row.id} còn bản dịch placeholder.`
      });
    }

    points.push(parsed.data);
  }

  const allIds = new Set(points.map((point) => point.id));
  for (const point of points) {
    for (const relatedId of point.relatedIds) {
      if (!allIds.has(relatedId)) {
        issues.push({
          file: GRAMMAR_CSV_FILES.relations,
          message: `${point.id} liên kết tới related_id không tồn tại: ${relatedId}.`
        });
      }
    }
    for (const comparison of point.comparisons) {
      if (comparison.grammarId && !allIds.has(comparison.grammarId)) {
        issues.push({
          file: GRAMMAR_CSV_FILES.comparisons,
          message: `${point.id} so sánh với grammarId không tồn tại: ${comparison.grammarId}.`
        });
      }
    }
  }

  const orphanChecks: Array<[string, Iterable<string>]> = [
    [GRAMMAR_CSV_FILES.examples, examplesByGrammar.keys()],
    [GRAMMAR_CSV_FILES.formation, formationByGrammar.keys()],
    [GRAMMAR_CSV_FILES.usage, usageByGrammar.keys()],
    [GRAMMAR_CSV_FILES.mistakes, mistakesByGrammar.keys()],
    [GRAMMAR_CSV_FILES.comparisons, comparisonsByGrammar.keys()],
    [GRAMMAR_CSV_FILES.relations, relationsByGrammar.keys()]
  ];
  for (const [file, keys] of orphanChecks) {
    for (const grammarId of keys) {
      if (!allIds.has(grammarId)) {
        issues.push({
          file,
          message: `grammar_id "${grammarId}" không tồn tại trong grammar_points.csv.`
        });
      }
    }
  }

  for (const [grammarId, examples] of examplesByGrammar) {
    const ids = new Set<string>();
    for (const example of examples) {
      if (ids.has(example.id)) {
        issues.push({
          file: GRAMMAR_CSV_FILES.examples,
          message: `${grammarId} có example_id trùng: ${example.id}.`
        });
      }
      ids.add(example.id);
    }
  }

  stats.points = points.length;
  return { points, issues, stats };
}

function csvEscape(value: string | number | undefined): string {
  const text = value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | undefined>>): string {
  return [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\r\n');
}

export function buildCsvBundleFromPoints(points: Grammar[]): GrammarCsvBundle {
  const pointRows = points.map((point) => [
    point.id,
    point.jlpt,
    point.lesson,
    point.order,
    point.pattern,
    point.title,
    point.meaningVi.join('|'),
    point.explanationVi,
    point.nuanceVi,
    point.notes.join('|'),
    point.tags.join('|'),
    point.updatedAt
  ]);

  const exampleRows: Array<Array<string | number | undefined>> = [];
  const formationRows: Array<Array<string | number | undefined>> = [];
  const usageRows: Array<Array<string | number | undefined>> = [];
  const mistakeRows: Array<Array<string | number | undefined>> = [];
  const comparisonRows: Array<Array<string | number | undefined>> = [];
  const relationRows: Array<Array<string | number | undefined>> = [];

  for (const point of points) {
    point.examples.forEach((example, index) => {
      exampleRows.push([
        point.id,
        example.id,
        index + 1,
        example.jp,
        example.vi,
        example.highlight,
        example.breakdown,
        example.note
      ]);
    });
    point.formation.forEach((formation, index) => {
      formationRows.push([point.id, index + 1, formation.rule, formation.example, formation.note]);
    });
    point.usage.forEach((usage, index) => {
      usageRows.push([
        point.id,
        index + 1,
        usage.situation,
        usage.explanationVi,
        usage.exampleIds.join('|')
      ]);
    });
    point.commonMistakes.forEach((mistake, index) => {
      mistakeRows.push([
        point.id,
        index + 1,
        mistake.mistake,
        mistake.correction,
        mistake.explanationVi
      ]);
    });
    point.comparisons.forEach((comparison, index) => {
      comparisonRows.push([
        point.id,
        index + 1,
        comparison.grammarId,
        comparison.pattern,
        comparison.differenceVi,
        comparison.example?.jp,
        comparison.example?.vi
      ]);
    });
    for (const relatedId of point.relatedIds) {
      relationRows.push([point.id, relatedId]);
    }
  }

  return {
    files: {
      [GRAMMAR_CSV_FILES.points]: toCsv(
        [
          'id',
          'jlpt',
          'lesson',
          'order',
          'pattern',
          'title',
          'meaning_vi',
          'explanation_vi',
          'nuance_vi',
          'notes',
          'tags',
          'updated_at'
        ],
        pointRows
      ),
      [GRAMMAR_CSV_FILES.examples]: toCsv(
        ['grammar_id', 'example_id', 'order', 'jp', 'vi', 'highlight', 'breakdown', 'note'],
        exampleRows
      ),
      [GRAMMAR_CSV_FILES.formation]: toCsv(
        ['grammar_id', 'order', 'rule', 'example', 'note'],
        formationRows
      ),
      [GRAMMAR_CSV_FILES.usage]: toCsv(
        ['grammar_id', 'order', 'situation', 'explanation_vi', 'example_ids'],
        usageRows
      ),
      [GRAMMAR_CSV_FILES.mistakes]: toCsv(
        ['grammar_id', 'order', 'mistake', 'correction', 'explanation_vi'],
        mistakeRows
      ),
      [GRAMMAR_CSV_FILES.comparisons]: toCsv(
        [
          'grammar_id',
          'order',
          'compare_grammar_id',
          'pattern',
          'difference_vi',
          'example_jp',
          'example_vi'
        ],
        comparisonRows
      ),
      [GRAMMAR_CSV_FILES.relations]: toCsv(['grammar_id', 'related_id'], relationRows)
    }
  };
}

export async function createGrammarCsvTemplateZip(): Promise<Blob> {
  const sample: Grammar = {
    id: 'g_n3_01_0',
    jlpt: 'N3',
    lesson: 1,
    order: 1,
    pattern: '〜うちに',
    title: '〜うちに (Trong lúc / Trước khi)',
    meaningVi: ['Trong lúc', 'Tranh thủ khi'],
    explanationVi:
      'Dùng để diễn tả một hành động được tranh thủ thực hiện trong khi một trạng thái còn đang tồn tại.',
    formation: [
      { rule: 'V辞書形 + うちに', example: '食べるうちに' },
      { rule: 'Vない形 + うちに', example: '忘れないうちに' }
    ],
    usage: [
      {
        situation: 'Tranh thủ làm gì khi còn điều kiện',
        explanationVi: 'Hành động ở vế sau được thực hiện trước khi trạng thái thay đổi.',
        exampleIds: ['ex_1']
      }
    ],
    nuanceVi: 'Khác 間に ở chỗ nhấn mạnh việc tranh thủ.',
    notes: ['Không dùng với một số động từ chỉ trạng thái kéo dài.'],
    commonMistakes: [
      {
        mistake: 'Dùng うちに với trạng thái kéo dài',
        correction: 'Dùng 間に',
        explanationVi: '間に phù hợp hơn khi chỉ một hành động xảy ra trong khoảng thời gian.'
      }
    ],
    comparisons: [],
    examples: [
      {
        id: 'ex_1',
        jp: '毎日話しているうちに、好きになりました。',
        vi: 'Trong lúc nói chuyện mỗi ngày, tôi đã thích cô ấy.',
        highlight: 'うちに',
        breakdown: 'Vている + うちに',
        note: 'Diễn tả thay đổi tự nhiên.'
      }
    ],
    tags: ['n3', 'thoi-gian', 'bai-01'],
    relatedIds: [],
    schemaVersion: 1
  };

  const bundle = buildCsvBundleFromPoints([sample]);
  const zip = new JSZip();
  for (const [name, content] of Object.entries(bundle.files)) {
    zip.file(name, `\uFEFF${content}`);
  }
  return zip.generateAsync({ type: 'blob' });
}

export async function createCsvBundleZip(points: Grammar[]): Promise<Blob> {
  const bundle = buildCsvBundleFromPoints(points);
  const zip = new JSZip();
  for (const [name, content] of Object.entries(bundle.files)) {
    zip.file(name, `\uFEFF${content}`);
  }
  return zip.generateAsync({ type: 'blob' });
}
