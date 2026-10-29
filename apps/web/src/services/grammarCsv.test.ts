import { describe, expect, it } from 'vitest';
import { parseGrammarCsvBundle, GRAMMAR_CSV_FILES } from './grammarCsv';

const pointsCsv = `id,jlpt,lesson,order,pattern,title,meaning_vi,explanation_vi,nuance_vi,notes,tags,updated_at
g_n3_01_0,N3,1,1,〜うちに,〜うちに (Trong lúc),Trong lúc|Tranh thủ,Giải thích chi tiết,Sắc thái,Lưu ý 1|Lưu ý 2,n3|thoi-gian,2026-10-29`;

const examplesCsv = `grammar_id,example_id,order,jp,vi,highlight,breakdown,note
g_n3_01_0,ex_1,1,毎日話しているうちに、好きになりました。,Trong lúc nói chuyện mỗi ngày tôi đã thích cô ấy.,うちに,Vている + うちに,Ghi chú`;

const formationCsv = `grammar_id,order,rule,example,note
g_n3_01_0,1,V辞書形 + うちに,食べるうちに,`;

const usageCsv = `grammar_id,order,situation,explanation_vi,example_ids
g_n3_01_0,1,Tranh thủ làm gì,Giải thích cách dùng,ex_1`;

function validBundle(): { files: Record<string, string> } {
  return {
    files: {
      [GRAMMAR_CSV_FILES.points]: pointsCsv,
      [GRAMMAR_CSV_FILES.examples]: examplesCsv,
      [GRAMMAR_CSV_FILES.formation]: formationCsv,
      [GRAMMAR_CSV_FILES.usage]: usageCsv
    }
  };
}

describe('grammar CSV import', () => {
  it('parses a valid CSV bundle into a detailed grammar point', () => {
    const result = parseGrammarCsvBundle(validBundle());
    expect(result.issues).toHaveLength(0);
    expect(result.points).toHaveLength(1);
    const point = result.points[0]!;
    expect(point.pattern).toBe('〜うちに');
    expect(point.meaningVi).toEqual(['Trong lúc', 'Tranh thủ']);
    expect(point.examples[0]?.id).toBe('ex_1');
    expect(point.formation[0]?.rule).toBe('V辞書形 + うちに');
    expect(point.usage[0]?.exampleIds).toEqual(['ex_1']);
  });

  it('rejects examples with missing Vietnamese translation', () => {
    const bundle = validBundle();
    bundle.files[GRAMMAR_CSV_FILES.examples] = examplesCsv.replace(
      ',Trong lúc nói chuyện mỗi ngày tôi đã thích cô ấy.',
      ','
    );
    const result = parseGrammarCsvBundle(bundle);
    expect(result.issues.some((issue) => issue.message.includes('vi'))).toBe(true);
    expect(result.points).toHaveLength(0);
  });

  it('rejects usage example ids that do not exist', () => {
    const bundle = validBundle();
    bundle.files[GRAMMAR_CSV_FILES.usage] = usageCsv.replace('ex_1', 'missing_example');
    const result = parseGrammarCsvBundle(bundle);
    expect(result.issues.some((issue) => issue.message.includes('missing_example'))).toBe(true);
  });

  it('rejects placeholder translations', () => {
    const bundle = validBundle();
    bundle.files[GRAMMAR_CSV_FILES.examples] = examplesCsv.replace(
      'Trong lúc nói chuyện mỗi ngày tôi đã thích cô ấy.',
      'Ví dụ minh họa cho mẫu câu うちに'
    );
    const result = parseGrammarCsvBundle(bundle);
    expect(result.issues.some((issue) => issue.message.includes('placeholder'))).toBe(true);
  });

  it('rejects related ids that do not exist', () => {
    const bundle = validBundle();
    bundle.files[GRAMMAR_CSV_FILES.relations] = `grammar_id,related_id
g_n3_01_0,g_missing`;
    const result = parseGrammarCsvBundle(bundle);
    expect(result.issues.some((issue) => issue.message.includes('g_missing'))).toBe(true);
  });
});
