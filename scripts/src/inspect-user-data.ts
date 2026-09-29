import fs from 'node:fs';
import path from 'node:path';
import { normalizeKana, normalizeNfc } from '@raku/core';

interface ParsedRow {
  surface: string;
  reading: string;
  meaningVi: string;
  pos?: string;
  exampleJp?: string;
  exampleVi?: string;
  tag?: string;
  file: string;
  line: number;
}

export function inspectUserData(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    console.error(`Directory not found: ${dirPath}`);
    return;
  }

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.csv') && f.startsWith('N3_Day_'));
  console.log(`Found ${files.length} day CSV files in ${dirPath}`);

  const rows: ParsedRow[] = [];
  let totalEntries = 0;

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    lines.forEach((line, idx) => {
      totalEntries++;
      // Simple split for standard CSV
      const cols = line.split(',');
      const surface = (cols[0] || '').trim();
      const reading = (cols[1] || '').trim();
      const meaningVi = (cols[2] || '').trim();

      rows.push({
        surface: normalizeNfc(surface),
        reading: normalizeKana(reading),
        meaningVi: normalizeNfc(meaningVi),
        pos: cols[3]?.trim(),
        exampleJp: cols[4]?.trim(),
        exampleVi: cols[5]?.trim(),
        tag: cols[6]?.trim(),
        file,
        line: idx + 1
      });
    });
  }

  console.log(`Parsed total of ${totalEntries} vocabulary entries.`);
  console.log(`Sample first entry:`, rows[0]);
}

const targetDir = process.argv[2] || 'D:\\Downloads\\anki\\N3_Mimikara_880_Daily_20_30words';
inspectUserData(targetDir);
