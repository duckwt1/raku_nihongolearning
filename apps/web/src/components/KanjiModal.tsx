import { useEffect } from 'react';
import { Volume2, X } from 'lucide-react';
import { KANJI_BY_CHAR, getWordsByKanji } from '@raku/core';

interface KanjiModalProps {
  char: string | null;
  onClose: () => void;
  onSelectWord?: (wordId: string) => void;
}

function speakWord(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  } catch {
    // Ignore unsupported TTS
  }
}

export function KanjiModal({ char, onClose, onSelectWord }: KanjiModalProps) {
  useEffect(() => {
    if (!char) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [char, onClose]);

  if (!char) return null;

  const kanji = KANJI_BY_CHAR.get(char);
  const words = getWordsByKanji(char);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết chữ Hán ${char}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-raku-ink/45 backdrop-blur-[2px] sm:items-stretch sm:justify-end"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-raku-line bg-raku-surface sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0 animate-raku-enter"
      >
        {/* Mobile grab handle */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-raku-line-strong" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-raku-line px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-raku-line bg-raku-canvas font-jp text-4xl font-bold text-raku-ink">
              {char}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-raku-muted">Hán Việt</div>
              <h2 className="text-lg font-bold text-raku-accent">
                {kanji?.hanViet.join(' · ') || 'Chưa có'}
              </h2>
              <p className="mt-0.5 text-sm text-raku-body">{kanji?.meaningVi || '—'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết Kanji"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm text-raku-body">
          {/* Compact metadata row */}
          <dl className="grid grid-cols-3 divide-x divide-raku-line rounded-xl border border-raku-line bg-raku-canvas text-center">
            <div className="py-2.5">
              <dt className="text-[11px] text-raku-muted">Cấp độ</dt>
              <dd className="mt-0.5 font-semibold text-raku-ink tabular-nums">
                {kanji?.jlpt || '—'}
              </dd>
            </div>
            <div className="py-2.5">
              <dt className="text-[11px] text-raku-muted">Số nét</dt>
              <dd className="mt-0.5 font-semibold text-raku-ink tabular-nums">
                {kanji?.strokeCount || '—'}
              </dd>
            </div>
            <div className="py-2.5">
              <dt className="text-[11px] text-raku-muted">Từ ghép</dt>
              <dd className="mt-0.5 font-semibold text-raku-accent tabular-nums">
                {words.length}
              </dd>
            </div>
          </dl>

          {/* Readings */}
          {(kanji?.onyomi?.length || kanji?.kunyomi?.length) ? (
            <div className="space-y-2 rounded-xl border border-raku-line bg-raku-canvas px-4 py-3 text-xs">
              {kanji.onyomi.length > 0 && (
                <div className="flex items-baseline gap-2">
                  <span className="w-16 shrink-0 font-semibold text-raku-muted">Onyomi</span>
                  <span className="font-jp text-sm font-medium text-raku-ink">
                    {kanji.onyomi.join('、')}
                  </span>
                </div>
              )}
              {kanji.kunyomi.length > 0 && (
                <div className="flex items-baseline gap-2">
                  <span className="w-16 shrink-0 font-semibold text-raku-muted">Kunyomi</span>
                  <span className="font-jp text-sm font-medium text-raku-ink">
                    {kanji.kunyomi.join('、')}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {/* Lookalikes */}
          {kanji?.lookalikes && kanji.lookalikes.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-raku-muted">Chữ dễ nhầm</h3>
              <div className="flex flex-wrap gap-2">
                {kanji.lookalikes.map((lk) => (
                  <span
                    key={lk}
                    className="rounded-lg border border-raku-hard/30 bg-raku-hard-soft px-2.5 py-1 font-jp text-base font-bold text-raku-hard"
                  >
                    {lk}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Related words */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-raku-muted">
              Từ vựng chứa「{char}」({words.length})
            </h3>
            {words.length === 0 ? (
              <p className="text-xs text-raku-muted">Chưa có từ vựng nào trong kho chứa chữ này.</p>
            ) : (
              <div className="divide-y divide-raku-line overflow-hidden rounded-xl border border-raku-line bg-raku-canvas">
                {words.map((w) => (
                  <div
                    key={w.id}
                    onClick={() => onSelectWord?.(w.id)}
                    className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${
                      onSelectWord ? 'cursor-pointer hover:bg-raku-subtle' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-jp text-sm font-bold text-raku-ink">{w.surface}</span>
                        <span className="font-jp text-xs text-raku-accent">
                          {w.readings.join(' ・ ')}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-raku-muted">{w.meaningVi}</p>
                    </div>
                    {canSpeak && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          speakWord(w.readings[0] || w.surface);
                        }}
                        aria-label={`Nghe ${w.surface}`}
                        className="shrink-0 rounded-lg p-1.5 text-raku-muted hover:bg-raku-subtle hover:text-raku-ink"
                      >
                        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
