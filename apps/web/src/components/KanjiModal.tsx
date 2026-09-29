import { X } from 'lucide-react';
import { KANJI_BY_CHAR, getWordsByKanji } from '@raku/core';

interface KanjiModalProps {
  char: string | null;
  onClose: () => void;
  onSelectWord?: (wordId: string) => void;
}

export function KanjiModal({ char, onClose, onSelectWord }: KanjiModalProps) {
  if (!char) return null;

  const kanji = KANJI_BY_CHAR.get(char);
  const words = getWordsByKanji(char);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <span className="text-3xl font-black text-sky-600 dark:text-sky-400 font-sans">
              {char}
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Hán Việt: {kanji?.hanViet.join(', ') || 'Chưa có'}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {kanji?.meaningVi}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs text-slate-600 dark:text-slate-300">
          {/* Kanji metadata grid */}
          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Cấp độ</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {kanji?.jlpt || 'N3'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Số nét</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {kanji?.strokeCount || '-'} nét
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Từ chứa chữ này</div>
              <div className="text-sm font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                {words.length} từ
              </div>
            </div>
          </div>

          {/* Onyomi / Kunyomi */}
          {(kanji?.onyomi?.length || kanji?.kunyomi?.length) ? (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
              {kanji.onyomi.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase mr-2">Onyomi:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium font-sans">
                    {kanji.onyomi.join('、')}
                  </span>
                </div>
              )}
              {kanji.kunyomi.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase mr-2">Kunyomi:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium font-sans">
                    {kanji.kunyomi.join('、')}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {/* Lookalikes (chữ dễ nhầm) */}
          {kanji?.lookalikes && kanji.lookalikes.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Chữ dễ nhầm (Lookalikes):
              </h4>
              <div className="flex items-center space-x-2">
                {kanji.lookalikes.map((lk) => (
                  <span
                    key={lk}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-bold font-sans text-sm"
                  >
                    {lk}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Words containing this kanji */}
          <div>
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Các từ vựng trong kho chứa chữ「{char}」({words.length} từ):
            </h4>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {words.map((w) => (
                <div
                  key={w.id}
                  onClick={() => onSelectWord && onSelectWord(w.id)}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between transition cursor-pointer"
                >
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 font-sans mr-2">
                      {w.surface}
                    </span>
                    <span className="text-sky-600 dark:text-sky-400 font-medium">
                      ({w.readings.join(', ')})
                    </span>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                      {w.meaningVi}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
