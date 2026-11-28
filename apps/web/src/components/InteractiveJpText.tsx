import { KANJI_BY_CHAR } from '@raku/core';

interface InteractiveJpTextProps {
  text: string;
  onSelectKanji?: (char: string) => void;
  className?: string;
}

/**
 * Renders Japanese text where known Kanji characters can be clicked to open KanjiModal.
 */
export function InteractiveJpText({ text, onSelectKanji, className = '' }: InteractiveJpTextProps) {
  if (!onSelectKanji) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {Array.from(text).map((ch, idx) => {
        if (KANJI_BY_CHAR.has(ch)) {
          return (
            <button
              key={`${ch}_${idx}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectKanji(ch);
              }}
              title={`Tra chữ Hán: ${ch}`}
              className="inline rounded px-0.5 transition-colors hover:bg-raku-accent-soft hover:text-raku-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-raku-accent"
            >
              {ch}
            </button>
          );
        }
        return <span key={idx}>{ch}</span>;
      })}
    </span>
  );
}
