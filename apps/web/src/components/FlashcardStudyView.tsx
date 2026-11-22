import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowRight,
  Check,
  Volume2,
  X
} from 'lucide-react';
import {
  type StudyCard,
  gradeReadingAnswer,
  previewCardGrades,
  applyGrade,
  Rating,
  SENTENCES_BY_ID
} from '@raku/core';

interface FlashcardStudyViewProps {
  cards: StudyCard[];
  onComplete: () => void;
  onSelectKanji?: (char: string) => void;
  onRateCard?: (card: StudyCard, rating: number) => void;
}

function speakJapanese(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore unsupported TTS environments
  }
}

export function FlashcardStudyView({
  cards,
  onComplete,
  onSelectKanji,
  onRateCard
}: FlashcardStudyViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionCards, setSessionCards] = useState<StudyCard[]>(() => cards);
  const [inputReading, setInputReading] = useState('');
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [gradeResult, setGradeResult] = useState<{ isCorrect: boolean } | null>(null);
  const [isComposing, setIsComposing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    setSessionCards(cards);
    setCurrentIndex(0);
    setIsAnswerRevealed(false);
    setGradeResult(null);
    setInputReading('');
    inputRef.current?.focus();
  }, [cards]);

  const currentCard = sessionCards[currentIndex];
  const totalCards = sessionCards.length;

  useEffect(() => {
    setIsAnswerRevealed(false);
    setGradeResult(null);
    setInputReading('');
    inputRef.current?.focus();
  }, [currentIndex]);

  const isWord = Boolean(currentCard?.word);
  const isKanji = Boolean(currentCard?.kanji);
  const isGrammar = Boolean(currentCard?.grammar);

  const hasKanji = currentCard
    ? Boolean(currentCard.word?.kanji && currentCard.word.kanji.length > 0)
    : false;

  const requiresInput = isWord ? hasKanji : isKanji;

  const handleCheckAnswer = useCallback(() => {
    if (!currentCard || isAnswerRevealed) return;

    if (!requiresInput) {
      setIsAnswerRevealed(true);
      return;
    }

    if (currentCard.word) {
      const result = gradeReadingAnswer(inputReading, currentCard.word.readings);
      setGradeResult({ isCorrect: result.isCorrect });
    } else if (currentCard.kanji) {
      const normalizedInput = inputReading.trim().toLowerCase();
      const validAnswers = [
        ...(currentCard.kanji.hanViet || []).map((hv) => hv.toLowerCase()),
        ...(currentCard.kanji.onyomi || []),
        ...(currentCard.kanji.kunyomi || []).flatMap((k) => {
          const stripped = k.replace(/[.\-]/g, '');
          return stripped !== k ? [k, stripped] : [k];
        })
      ];
      const result = gradeReadingAnswer(normalizedInput, validAnswers);
      setGradeResult({ isCorrect: result.isCorrect });
    }

    setIsAnswerRevealed(true);
  }, [currentCard, isAnswerRevealed, requiresInput, inputReading]);

  const handleDoNotKnow = useCallback(() => {
    if (!currentCard || isAnswerRevealed) return;
    setGradeResult({ isCorrect: false });
    setIsAnswerRevealed(true);
  }, [currentCard, isAnswerRevealed]);

  const handleApplyRating = useCallback(
    (rating: Rating) => {
      if (!isAnswerRevealed) return;
      const cardToRate = sessionCards[currentIndex];
      if (!cardToRate) return;

      setIsAnswerRevealed(false);
      setGradeResult(null);
      setInputReading('');

      const recordLog = applyGrade(cardToRate.fsrsCard, rating as 1 | 2 | 3 | 4);
      const reviewedAt = new Date().toISOString();
      const updatedCard: StudyCard = {
        ...cardToRate,
        fsrsCard: recordLog.card,
        isNew: false,
        isDue: recordLog.card.due.getTime() <= Date.now(),
        firstLearnedAt: cardToRate.firstLearnedAt || reviewedAt,
        learnedAt: cardToRate.learnedAt || (rating > Rating.Again ? reviewedAt : undefined)
      };

      onRateCard?.(updatedCard, rating);

      const isAgain = rating === Rating.Again;
      if (isAgain) {
        setSessionCards((prev) => [...prev, updatedCard]);
      }

      const nextTotal = isAgain ? sessionCards.length + 1 : sessionCards.length;
      if (currentIndex + 1 < nextTotal) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        onComplete();
      }
    },
    [isAnswerRevealed, sessionCards, currentIndex, onComplete, onRateCard]
  );

  // Keyboard shortcuts: Enter to check/reveal, 1-4 to rate FSRS
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (isEditable) {
        if (
          target instanceof HTMLInputElement &&
          !isAnswerRevealed &&
          e.key === 'Enter' &&
          !isComposing &&
          !e.isComposing &&
          e.keyCode !== 229
        ) {
          e.preventDefault();
          handleCheckAnswer();
        }
        return;
      }

      if (!isAnswerRevealed && !requiresInput && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setIsAnswerRevealed(true);
        return;
      }

      if (isAnswerRevealed) {
        if (e.key === '1') {
          e.preventDefault();
          handleApplyRating(Rating.Again);
        } else if (e.key === '2') {
          e.preventDefault();
          handleApplyRating(Rating.Hard);
        } else if (e.key === '3') {
          e.preventDefault();
          handleApplyRating(Rating.Good);
        } else if (e.key === '4') {
          e.preventDefault();
          handleApplyRating(Rating.Easy);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnswerRevealed, isComposing, requiresInput, handleCheckAnswer, handleApplyRating]);

  if (!currentCard) {
    return (
      <div className="raku-card mx-auto max-w-md p-8 text-center animate-raku-enter">
        <div className="raku-hanko-seal mx-auto mb-5 h-14 w-14 text-2xl" aria-hidden="true">
          済
        </div>

        <h3 className="text-xl font-bold tracking-tight text-raku-ink tabular-nums">
          Xong phiên ôn · {totalCards} thẻ
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-raku-muted">
          Lịch ôn tập tiếp theo đã được cập nhật.
        </p>

        <button
          type="button"
          onClick={onComplete}
          className="raku-btn-primary mt-6 w-full"
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const previews = previewCardGrades(currentCard.fsrsCard);
  const sentence = currentCard.word?.exampleIds?.[0]
    ? SENTENCES_BY_ID.get(currentCard.word.exampleIds[0])
    : currentCard.word?.exampleJp
      ? { jp: currentCard.word.exampleJp, vi: currentCard.word.exampleVi || '' }
      : undefined;

  const frontText =
    currentCard.word?.surface ||
    currentCard.kanji?.char ||
    currentCard.grammar?.title ||
    currentCard.customPrompt ||
    '';

  const promptHint = isWord
    ? hasKanji
      ? 'Cách đọc (Hiragana)'
      : 'Nhớ nghĩa từ này'
    : isKanji
      ? 'Hán Việt hoặc cách đọc'
      : isGrammar
        ? 'Ý nghĩa và cách dùng'
        : 'Mặt trước';

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Slim progress row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-raku-muted tabular-nums">
          <span className="font-medium">
            {currentIndex + 1} / {totalCards}
          </span>
          <div className="flex items-center gap-2">
            {currentCard.isNew && (
              <span className="rounded-md bg-raku-easy-soft px-2 py-0.5 text-[11px] font-semibold text-raku-easy">
                Mới
              </span>
            )}
            {currentCard.isDue && !currentCard.isNew && (
              <span className="rounded-md bg-raku-hard-soft px-2 py-0.5 text-[11px] font-semibold text-raku-hard">
                Đến hạn
              </span>
            )}
          </div>
        </div>

        <div
          role="progressbar"
          aria-valuenow={currentIndex + 1}
          aria-valuemin={1}
          aria-valuemax={totalCards}
          className="raku-progress-track"
        >
          <div
            className="raku-progress-fill"
            style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Washi Flashcard */}
      <article
        key={currentCard.refId || currentIndex}
        className={`raku-card flex min-h-[360px] flex-col justify-between p-6 sm:p-8 animate-raku-enter ${
          gradeResult && !gradeResult.isCorrect ? 'animate-raku-shake' : ''
        }`}
      >
        {/* FRONT FACE */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="reading-input"
              className="text-xs font-medium text-raku-muted"
            >
              {promptHint}
            </label>
            {canSpeak && (isWord || isKanji) && (
              <button
                type="button"
                onClick={() => speakJapanese(currentCard.word?.readings[0] || frontText)}
                aria-label="Nghe phát âm tiếng Nhật"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-raku-muted transition-colors hover:bg-raku-subtle hover:text-raku-ink"
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="my-8 text-center font-jp text-4xl font-bold tracking-wide text-raku-ink sm:text-5xl">
            {frontText}
          </div>

          {requiresInput && !isAnswerRevealed && (
            <div className="mx-auto max-w-sm space-y-3">
              <input
                id="reading-input"
                ref={inputRef}
                type="text"
                lang="ja"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder={isWord ? 'Nhập hiragana...' : 'Nhập Hán Việt hoặc cách đọc...'}
                value={inputReading}
                onChange={(e) => setInputReading(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                className="w-full rounded-xl border border-raku-line-strong bg-raku-canvas px-4 py-3 text-center font-jp text-lg font-medium text-raku-ink placeholder:font-sans placeholder:text-sm placeholder:text-raku-muted focus:border-raku-accent focus:outline-none touch-target"
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCheckAnswer}
                  className="raku-btn-primary flex-1"
                >
                  <span>Kiểm tra</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleDoNotKnow}
                  className="raku-btn-secondary"
                >
                  Chưa nhớ
                </button>
              </div>
            </div>
          )}

          {!requiresInput && !isAnswerRevealed && (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => setIsAnswerRevealed(true)}
                className="raku-btn-primary px-8"
              >
                Hiện đáp án
              </button>
              <p className="mt-2 hidden text-xs text-raku-muted sm:block">
                Nhấn Space hoặc Enter
              </p>
            </div>
          )}

          {isAnswerRevealed && gradeResult && (
            <div
              role="status"
              className={`mt-2 flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${
                gradeResult.isCorrect
                  ? 'border-raku-good/25 bg-raku-good-soft text-raku-good'
                  : 'border-raku-again/25 bg-raku-again-soft text-raku-again'
              }`}
            >
              {gradeResult.isCorrect ? (
                <>
                  <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Chính xác</span>
                </>
              ) : (
                <>
                  <X className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Chưa khớp — xem cách đọc bên dưới</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* BACK FACE */}
        {isAnswerRevealed && (
          <div className="mt-6 space-y-4 border-t border-raku-line pt-5 animate-raku-enter">
            {currentCard.word && (
              <>
                <div className="text-center font-jp text-2xl font-bold text-raku-accent">
                  {currentCard.word.readings.join(' ・ ')}
                </div>

                <div className="space-y-2 text-center">
                  <div className="text-base font-semibold text-raku-ink">
                    {currentCard.word.meaningVi}
                  </div>

                  {((currentCard.word.kanji && currentCard.word.kanji.length > 0) ||
                    (currentCard.word.hanVietBreakdown &&
                      currentCard.word.hanVietBreakdown.length > 0)) && (
                    <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-raku-muted">
                      <span>Hán Việt:</span>
                      {currentCard.word.kanji && currentCard.word.kanji.length > 0 ? (
                        currentCard.word.kanji.map((char, kIdx) => {
                          const hv = currentCard.word?.hanVietBreakdown?.[kIdx] || '';
                          return (
                            <button
                              key={`${char}-${kIdx}`}
                              type="button"
                              onClick={() => onSelectKanji?.(char)}
                              className="inline-flex items-center gap-1 rounded-lg border border-raku-line bg-raku-canvas px-2 py-1 font-medium text-raku-ink transition-colors hover:border-raku-accent hover:text-raku-accent"
                              title={`Tra chữ ${char}`}
                            >
                              <span className="font-jp font-bold">{char}</span>
                              {hv && <span className="text-raku-muted">{hv}</span>}
                            </button>
                          );
                        })
                      ) : (
                        <span className="font-semibold text-raku-ink">
                          {currentCard.word.hanVietBreakdown?.join(' ')}
                        </span>
                      )}
                    </div>
                  )}

                  {currentCard.word.pos && (
                    <div>
                      <span className="inline-block rounded-md bg-raku-subtle px-2 py-0.5 text-xs text-raku-muted">
                        {currentCard.word.pos}
                      </span>
                    </div>
                  )}
                </div>

                {sentence && (
                  <div className="space-y-1 rounded-xl border border-raku-line bg-raku-canvas p-3.5 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-jp text-sm font-medium leading-relaxed text-raku-ink">
                        {sentence.jp}
                      </p>
                      {canSpeak && (
                        <button
                          type="button"
                          onClick={() => speakJapanese(sentence.jp)}
                          aria-label="Nghe câu ví dụ"
                          className="shrink-0 rounded-md p-1 text-raku-muted hover:bg-raku-subtle hover:text-raku-ink"
                        >
                          <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-raku-muted">{sentence.vi}</p>
                  </div>
                )}
              </>
            )}

            {currentCard.kanji && (
              <div className="space-y-2 text-center">
                <div className="text-xl font-bold text-raku-accent">
                  {currentCard.kanji.hanViet.join(' · ')}
                </div>
                <div className="text-base font-semibold text-raku-ink">
                  {currentCard.kanji.meaningVi}
                </div>
                <div className="space-y-0.5 text-xs text-raku-muted">
                  <div>
                    <span className="font-semibold text-raku-ink">Onyomi:</span>{' '}
                    <span className="font-jp">{currentCard.kanji.onyomi.join('、') || '—'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-raku-ink">Kunyomi:</span>{' '}
                    <span className="font-jp">{currentCard.kanji.kunyomi.join('、') || '—'}</span>
                  </div>
                  {currentCard.kanji.strokeCount && (
                    <div>Số nét: {currentCard.kanji.strokeCount}</div>
                  )}
                </div>
              </div>
            )}

            {currentCard.grammar && (
              <div className="space-y-3 text-left">
                <div className="rounded-xl border border-raku-line bg-raku-canvas p-3.5">
                  <div className="mb-1 text-xs font-semibold text-raku-muted">Giải thích</div>
                  <p className="text-sm leading-relaxed text-raku-body">
                    {currentCard.grammar.explanationVi}
                  </p>
                </div>

                {currentCard.grammar.examples && currentCard.grammar.examples.length > 0 && (
                  <div className="space-y-1.5">
                    {currentCard.grammar.examples.slice(0, 2).map((ex, exIdx) => (
                      <div
                        key={exIdx}
                        className="rounded-xl border border-raku-line bg-raku-canvas p-3 space-y-0.5"
                      >
                        <div className="font-jp text-sm font-medium text-raku-ink">{ex.jp}</div>
                        <div className="text-xs text-raku-muted">{ex.vi}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!currentCard.word &&
              !currentCard.kanji &&
              !currentCard.grammar &&
              currentCard.customAnswer && (
                <div className="space-y-1.5 text-center">
                  <div className="text-xs font-medium text-raku-muted">Đáp án</div>
                  <div className="whitespace-pre-wrap text-base font-semibold text-raku-ink">
                    {currentCard.customAnswer}
                  </div>
                </div>
              )}
          </div>
        )}
      </article>

      {/* Calm, grounded FSRS 4-rating bar */}
      {isAnswerRevealed && (
        <div className="sticky bottom-4 z-20 rounded-2xl border border-raku-line bg-raku-surface/95 p-2.5 backdrop-blur-sm grid grid-cols-4 gap-2 animate-raku-enter">
          <button
            type="button"
            onClick={() => handleApplyRating(Rating.Again)}
            aria-label={`Quên (khoảng ôn: ${previews[Rating.Again].intervalLabel})`}
            className="flex flex-col items-center justify-center rounded-xl border border-raku-again/30 bg-raku-again-soft px-2 py-2.5 text-raku-again transition-transform hover:border-raku-again active:scale-[0.98] touch-target"
          >
            <span className="text-[11px] font-medium opacity-80 tabular-nums">
              {previews[Rating.Again].intervalLabel}
            </span>
            <span className="mt-0.5 text-sm font-bold">Quên</span>
            <span className="mt-0.5 hidden text-[10px] opacity-70 sm:inline">1</span>
          </button>

          <button
            type="button"
            onClick={() => handleApplyRating(Rating.Hard)}
            aria-label={`Khó (khoảng ôn: ${previews[Rating.Hard].intervalLabel})`}
            className="flex flex-col items-center justify-center rounded-xl border border-raku-hard/30 bg-raku-hard-soft px-2 py-2.5 text-raku-hard transition-transform hover:border-raku-hard active:scale-[0.98] touch-target"
          >
            <span className="text-[11px] font-medium opacity-80 tabular-nums">
              {previews[Rating.Hard].intervalLabel}
            </span>
            <span className="mt-0.5 text-sm font-bold">Khó</span>
            <span className="mt-0.5 hidden text-[10px] opacity-70 sm:inline">2</span>
          </button>

          <button
            type="button"
            onClick={() => handleApplyRating(Rating.Good)}
            aria-label={`Tốt (khoảng ôn: ${previews[Rating.Good].intervalLabel})`}
            className="flex flex-col items-center justify-center rounded-xl border border-raku-good/35 bg-raku-good-soft px-2 py-2.5 text-raku-good transition-transform hover:border-raku-good active:scale-[0.98] touch-target"
          >
            <span className="text-[11px] font-medium opacity-80 tabular-nums">
              {previews[Rating.Good].intervalLabel}
            </span>
            <span className="mt-0.5 text-sm font-bold">Tốt</span>
            <span className="mt-0.5 hidden text-[10px] opacity-70 sm:inline">3</span>
          </button>

          <button
            type="button"
            onClick={() => handleApplyRating(Rating.Easy)}
            aria-label={`Dễ (khoảng ôn: ${previews[Rating.Easy].intervalLabel})`}
            className="flex flex-col items-center justify-center rounded-xl border border-raku-easy/30 bg-raku-easy-soft px-2 py-2.5 text-raku-easy transition-transform hover:border-raku-easy active:scale-[0.98] touch-target"
          >
            <span className="text-[11px] font-medium opacity-80 tabular-nums">
              {previews[Rating.Easy].intervalLabel}
            </span>
            <span className="mt-0.5 text-sm font-bold">Dễ</span>
            <span className="mt-0.5 hidden text-[10px] opacity-70 sm:inline">4</span>
          </button>
        </div>
      )}
    </div>
  );
}
