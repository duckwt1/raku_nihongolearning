import fs from 'node:fs';
import path from 'node:path';

// Load all kanji in N3 dataset
const dir = 'D:\\Downloads\\anki\\N3_Mimikara_880_Daily_20_30words';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv') && f.startsWith('N3_Day_'));
const kanjiFreq = new Map<string, number>();
const kanjiRegex = /[\u4E00-\u9FAF\u3400-\u4DBF]/g;

for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const surface = line.split(',')[0] || '';
    const matches = surface.match(kanjiRegex) || [];
    for (const k of matches) {
      kanjiFreq.set(k, (kanjiFreq.get(k) || 0) + 1);
    }
  }
}

console.log(`Unique kanji: ${kanjiFreq.size}`);
const sortedKanji = Array.from(kanjiFreq.entries()).sort((a, b) => b[1] - a[1]);
console.log('Top 20 most frequent kanji:');
console.log(sortedKanji.slice(0, 20).map(([k, c]) => `${k}:${c}`).join(', '));
