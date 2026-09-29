import { describe, expect, it } from 'vitest';
import {
  parseAndFilterImport,
  detectDelimiter,
  exportRecordsToDelimited,
  generateDeterministicWordId
} from './parser.js';

describe('Import Parser & Filter (Section 5B)', () => {
  it('detects tab delimiter correctly', () => {
    const text = '預かる\tあずかる\tchăm sóc; nhận giữ\t動詞\n荷物\tにもつ\thành lý\t名詞';
    expect(detectDelimiter(text)).toBe('\t');
  });

  it('detects comma delimiter correctly', () => {
    const text = '預かる,あずかる,chăm sóc,動詞\n荷物,にもつ,hành lý,名詞';
    expect(detectDelimiter(text)).toBe(',');
  });

  it('parses standard Quizlet tab delimited lines', () => {
    const text = '預かる\tあずかる\tchăm sóc; nhận giữ\t動詞\n荷物\tにもつ\thành lý\t名詞';
    const result = parseAndFilterImport(text, { delimiter: '\t' });

    expect(result.totalLines).toBe(2);
    expect(result.validCount).toBe(2);
    expect(result.records[0]?.surface).toBe('預かる');
    expect(result.records[0]?.readings).toContain('あずかる');
    expect(result.records[0]?.meaningVi).toBe('chăm sóc; nhận giữ');
  });

  it('handles CSV with quoted fields containing commas', () => {
    const csv = '目上,めうえ,"bề trên, người trên mình",Danh từ\n先輩,せんぱい,tiền bối,Danh từ';
    const result = parseAndFilterImport(csv, { delimiter: ',' });

    expect(result.totalLines).toBe(2);
    expect(result.records[0]?.meaningVi).toBe('bề trên, người trên mình');
  });

  it('detects duplicates within batch', () => {
    const text = '男性\tだんせい\tđàn ông\n男性\tだんせい\tđàn ông';
    const result = parseAndFilterImport(text, { delimiter: '\t' });

    expect(result.duplicateCount).toBe(1);
    expect(result.records[1]?.issues).toContain('Trùng lặp với dòng trước trong cùng tệp');
  });

  it('cross-references with internal dictionary for missing reading/Han Viet', () => {
    // Leave reading empty for 男性; it should look up internal seed dictionary
    const text = '男性\t\tđàn ông\tDanh từ';
    const result = parseAndFilterImport(text, { delimiter: '\t' });

    expect(result.records[0]?.readings).toContain('だんせい');
    expect(result.records[0]?.provenance.readings).toBe('dictionary');
    expect(result.records[0]?.hanViet).toEqual(['NAM', 'TÍNH']);
  });

  it('strips HTML tags and preserves plain text', () => {
    const text = '<b>預かる</b>\tあずかる\t<span color="red">nhận giữ</span>\t動詞';
    const result = parseAndFilterImport(text, { delimiter: '\t' });

    expect(result.records[0]?.surface).toBe('預かる');
    expect(result.records[0]?.meaningVi).toBe('nhận giữ');
  });

  it('performs roundtrip export to TSV accurately', () => {
    const text = '預かる\tあずかる\tchăm sóc; nhận giữ\t\t動詞\t\t\t';
    const parsed = parseAndFilterImport(text, { delimiter: '\t' });
    const exported = exportRecordsToDelimited(parsed.records, '\t');

    expect(exported).toContain('預かる\tあずかる\tchăm sóc; nhận giữ');
  });

  it('generates deterministic IDs for identical surface and reading', () => {
    const id1 = generateDeterministicWordId('男性', 'だんせい');
    const id2 = generateDeterministicWordId('男性', 'だんせい');
    const id3 = generateDeterministicWordId('女性', 'じょせい');

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
  });
});
