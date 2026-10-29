import Papa from 'papaparse';
import {
  validateGrammarExercise,
  type Grammar,
  type GrammarExercise,
  type GrammarExerciseType
} from '@raku/core';
import { createGrammarExerciseId } from './grammarExerciseStore';

export const EXERCISE_CSV_HEADERS = [
  'grammar_id',
  'type',
  'prompt',
  'answer',
  'choices',
  'tokens',
  'explanation_vi',
  'difficulty',
  'tags'
] as const;

export const EXERCISE_CSV_TEMPLATE = `grammar_id,type,prompt,answer,choices,tokens,explanation_vi,difficulty,tags
g_n3_01_0,fill_blank,毎日話している{{blank}}、好きになりました。,うちに,うちに|ために|ながら|たびに,,Điền mẫu ngữ pháp đúng.,2,bai-01|thoi-gian
g_n3_01_0,order,Sắp xếp câu đúng.,毎日話しているうちに、好きになりました。,,毎日|話している|うちに、|好きに|なりました。,Sắp xếp theo đúng thứ tự.,2,bai-01`;

export interface ExerciseCsvIssue {
  row?: number;
  message: string;
}

export interface ExerciseCsvParseResult {
  exercises: GrammarExercise[];
  issues: ExerciseCsvIssue[];
}

function splitList(value?: string): string[] {
  if (!value) return [];
  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

const ALLOWED_TYPES: GrammarExerciseType[] = [
  'fill_blank',
  'order',
  'translate_jp_vi',
  'translate_vi_jp',
  'K7'
];

export function parseExerciseCsv(
  text: string,
  grammarPoints: Grammar[],
  createdByUid: string,
  createdByName?: string
): ExerciseCsvParseResult {
  const issues: ExerciseCsvIssue[] = [];
  const exercises: GrammarExercise[] = [];
  const grammarMap = new Map(grammarPoints.map((grammar) => [grammar.id, grammar]));

  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim()
  });

  for (const error of parsed.errors) {
    issues.push({
      row: error.row !== undefined ? error.row + 2 : undefined,
      message: error.message
    });
  }

  parsed.data.forEach((raw, index) => {
    const row = index + 2;
    const grammarId = (raw.grammar_id || '').trim();
    if (!grammarId) {
      issues.push({ row, message: 'Thiếu grammar_id.' });
      return;
    }
    const grammar = grammarMap.get(grammarId);
    if (!grammar) {
      issues.push({ row, message: `grammar_id "${grammarId}" không thuộc level đang chọn.` });
      return;
    }

    const type = (raw.type || '').trim() as GrammarExerciseType;
    if (!ALLOWED_TYPES.includes(type)) {
      issues.push({ row, message: `Loại bài "${raw.type}" không hợp lệ.` });
      return;
    }

    const prompt = (raw.prompt || '').trim();
    const rawAnswer = (raw.answer || '').trim();
    const choices = splitList(raw.choices);
    const tokens = splitList(raw.tokens);
    const answer =
      type === 'translate_jp_vi' || type === 'translate_vi_jp'
        ? splitList(rawAnswer).length > 1
          ? splitList(rawAnswer)
          : rawAnswer
        : rawAnswer;

    const check = validateGrammarExercise({ type, prompt, answer, choices, tokens });
    if (!check.valid) {
      issues.push({ row, message: check.errors.join('; ') });
      return;
    }

    const now = new Date().toISOString();
    exercises.push({
      id: createGrammarExerciseId(),
      grammarId: grammar.id,
      grammarPattern: grammar.pattern,
      grammarTitle: grammar.title,
      jlpt: grammar.jlpt,
      type,
      prompt,
      answer,
      choices: choices.length > 0 ? choices : undefined,
      tokens: tokens.length > 0 ? tokens : undefined,
      explanationVi: (raw.explanation_vi || '').trim(),
      difficulty: Math.min(
        5,
        Math.max(1, Number(raw.difficulty || 2) || 2)
      ),
      tags: splitList(raw.tags),
      createdByUid,
      createdByName,
      origin: 'admin',
      visibility: 'public',
      createdAt: now,
      updatedAt: now
    });
  });

  return { exercises, issues };
}

export function downloadExerciseCsvTemplate(): void {
  const blob = new Blob([`\uFEFF${EXERCISE_CSV_TEMPLATE}`], {
    type: 'text/csv;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'raku-grammar-exercises-template.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
