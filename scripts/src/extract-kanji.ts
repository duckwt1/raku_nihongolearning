import fs from 'node:fs';
import path from 'node:path';

const dir = 'D:\\Downloads\\anki\\N3_Mimikara_880_Daily_20_30words';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv') && f.startsWith('N3_Day_'));
const kanjiSet = new Set<string>();
const kanjiRegex = /[\u4E00-\u9FAF\u3400-\u4DBF]/g;

for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const surface = line.split(',')[0] || '';
    const matches = surface.match(kanjiRegex) || [];
    for (const k of matches) {
      kanjiSet.add(k);
    }
  }
}

console.log('Total unique kanji in N3 dataset:', kanjiSet.size);
const sorted = Array.from(kanjiSet).sort();
console.log('Sample 30 kanji:', sorted.slice(0, 30).join(' '));
