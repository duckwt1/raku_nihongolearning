import { describe, expect, it } from 'vitest';
import type { Grammar } from '@raku/core';
import { parseExerciseCsv } from './grammarExerciseCsv';

const grammar: Grammar = {
  id: 'g_n3_01_0',
  jlpt: 'N3',
  lesson: 1,
  pattern: '〜うちに',
  title: '〜うちに (Trong lúc)',
  meaningVi: ['Trong lúc'],
  explanationVi: 'Giải thích',
  formation: [{ rule: 'V辞書形 + うちに' }],
  usage: [],
  notes: [],
  commonMistakes: [],
  comparisons: [],
  examples: [
    {
      id: 'ex_1',
      jp: '毎日話しているうちに、好きになりました。',
      vi: 'Trong lúc nói chuyện mỗi ngày, tôi đã thích cô ấy.'
    }
  ],
  tags: [],
  relatedIds: [],
  schemaVersion: 1
};

const csv = `grammar_id,type,prompt,answer,choices,tokens,explanation_vi,difficulty,tags
g_n3_01_0,fill_blank,毎日話している{{blank}}、好きになりました。,うちに,うちに|ために|ながら|たびに,,Giải thích,2,bai-01|thoi-gian
g_n3_01_0,order,Sắp xếp câu.,毎日話しているうちに、好きになりました。,,毎日|話している|うちに、|好きに|なりました。,Giải thích,2,bai-01`;

describe('parseExerciseCsv', () => {
  it('parses valid exercise rows', () => {
    const result = parseExerciseCsv(csv, [grammar], 'admin', 'Admin');
    expect(result.issues).toHaveLength(0);
    expect(result.exercises).toHaveLength(2);
    expect(result.exercises[0]?.grammarId).toBe('g_n3_01_0');
    expect(result.exercises[0]?.jlpt).toBe('N3');
    expect(result.exercises[0]?.tags).toEqual(['bai-01', 'thoi-gian']);
    expect(result.exercises[1]?.tokens).toHaveLength(5);
  });

  it('rejects unknown grammar ids', () => {
    const result = parseExerciseCsv(
      csv.replaceAll('g_n3_01_0', 'g_missing'),
      [grammar],
      'admin'
    );
    expect(result.exercises).toHaveLength(0);
    expect(result.issues.some((issue) => issue.message.includes('g_missing'))).toBe(true);
  });
});
