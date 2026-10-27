import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
  Trophy
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
  const [isComposing, setIsComposing] = useState(false); // IME composition guard

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSessionCards(cards);
    setCurrentIndex(0);
  }, [cards]);

  const currentCard = sessionCards[currentIndex];
  const totalCards = sessionCards.length;

  // Auto focus input when switching to a new card
  useEffect(() => {
    setIsAnswerRevealed(false);
    setGradeResult(null);
    setInputReading('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentIndex]);

  const isWord = Boolean(currentCard?.word);
  const isKanji = Boolean(currentCard?.kanji);
  const isGrammar = Boolean(currentCard?.grammar);

  const hasKanji = currentCard
    ? Boolean(currentCard.word?.kanji && currentCard.word.kanji.length > 0)
    : false;

  const requiresInput = isWord ? hasKanji : isKanji;

  // Check user reading answer (Section 4)
  const handleCheckAnswer = useCallback(() => {
    if (!currentCard || isAnswerRevealed) return;

    if (!requiresInput) {
      // Kana-only or Grammar card: reveal immediately
      setIsAnswerRevealed(true);
      return;
    }

    if (currentCard.word) {
      const result = gradeReadingAnswer(inputReading, currentCard.word.readings);
      setGradeResult({ isCorrect: result.isCorrect });
    } else if (currentCard.kanji) {
      const validAnswers = [
        ...(currentCard.kanji.hanViet || []),
        ...(currentCard.kanji.onyomi || []),
        ...(currentCard.kanji.kunyomi || [])
      ];
      const result = gradeReadingAnswer(inputReading, validAnswers);
      setGradeResult({ isCorrect: result.isCorrect });
    }

    setIsAnswerRevealed(true);
  }, [currentCard, isAnswerRevealed, requiresInput, inputReading]);

  // "Không biết" button handler
  const handleDoNotKnow = useCallback(() => {
    if (!currentCard || isAnswerRevealed) return;
    setGradeResult({ isCorrect: false });
    setIsAnswerRevealed(true);
  }, [currentCard, isAnswerRevealed]);

  // FSRS rating handler (Again, Hard, Good, Easy)
  const handleApplyRating = useCallback(
    (rating: Rating) => {
      const cardToRate = sessionCards[currentIndex];
      if (!cardToRate) return;

      // 1. Advance card state via FSRS algorithm
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

      // 2. Notify parent to persist in allCards, LocalStorage, and Firestore
      if (onRateCard) {
        onRateCard(updatedCard, rating);
      }

      // 3. Relearn if Again (Rating 1) like Anki: re-append card to end of session
      const isAgain = rating === Rating.Again;
      if (isAgain) {
        setSessionCards((prev) => [...prev, updatedCard]);
      }

      // 4. Advance to next card or complete
      const nextTotal = isAgain ? sessionCards.length + 1 : sessionCards.length;
      if (currentIndex + 1 < nextTotal) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        onComplete();
      }
    },
    [sessionCards, currentIndex, onComplete, onRateCard]
  );

  // Keyboard navigation & shortcuts (1-4 for ratings, Enter for submit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input
      if (e.target instanceof HTMLInputElement && !isAnswerRevealed) {
        if (e.key === 'Enter' && !isComposing) {
          e.preventDefault();
          handleCheckAnswer();
        }
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
  }, [isAnswerRevealed, isComposing, handleCheckAnswer, handleApplyRating]);

  if (!currentCard) {
    return (
      <div className="p-8 sm:p-10 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-emerald-500/30 dark:border-emerald-500/20 shadow-xl max-w-md mx-auto animate-duo-pop relative overflow-hidden">
        {/* Subtle decorative celebration sparkles */}
        <div className="absolute top-4 left-6 text-amber-400 animate-duo-sparkle">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="absolute top-6 right-8 text-sky-400 animate-duo-sparkle" style={{ animationDelay: '400ms' }}>
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="absolute bottom-6 left-8 text-emerald-400 animate-duo-sparkle" style={{ animationDelay: '800ms' }}>
          <Sparkles className="w-4 h-4" />
        </div>

        {/* Animated Trophy Centerpiece */}
        <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 mx-auto mb-4 border-4 border-emerald-400/40 shadow-inner">
          <Trophy className="w-12 h-12 animate-duo-pop" />
        </div>

        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
          Hoàn thành xuất sắc! 🎉
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 font-medium leading-relaxed">
          Bạn đã hoàn thành toàn bộ {totalCards} thẻ trong phiên học này. Trí nhớ dài hạn đã được củng cố theo thuật toán FSRS!
        </p>

        {/* Review summary stats pill */}
        <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200 dark:border-slate-700/80 mb-6 grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Đã ôn luyện</div>
            <div className="text-xl font-black text-slate-800 dark:text-slate-100 mt-0.5">{totalCards} Thẻ</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Trạng thái</div>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">100% Sẵn sàng</div>
          </div>
        </div>

        <button
          onClick={onComplete}
          className="w-full py-3.5 duo-btn-3d duo-btn-emerald text-base rounded-2xl shadow-lg touch-target"
        >
          Tiếp tục học tập
        </button>
      </div>
    );
  }

  // Calculate FSRS previews for all 4 buttons
  const previews = previewCardGrades(currentCard.fsrsCard);
  const sentence = currentCard.word?.exampleIds?.[0]
    ? SENTENCES_BY_ID.get(currentCard.word.exampleIds[0])
    : currentCard.word?.exampleJp
      ? { jp: currentCard.word.exampleJp, vi: currentCard.word.exampleVi || '' }
      : undefined;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {/* Progress Bar (Section 4) */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium px-1">
        <span>
          Thẻ {currentIndex + 1} / {totalCards}
        </span>
        <span className="flex items-center space-x-2">
          {currentCard.isNew && (
            <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-semibold">
              Mới
            </span>
          )}
          {currentCard.isDue && !currentCard.isNew && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold">
              Đến hạn
            </span>
          )}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={currentIndex + 1}
        aria-valuemin={1}
        aria-valuemax={totalCards}
        className="w-full duo-progress-track"
      >
        <div
          className="duo-progress-fill"
          style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
        />
      </div>

      {/* Main Flashcard Container with enter animation */}
      <div
        key={currentCard.refId || currentIndex}
        className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 sm:p-8 min-h-[360px] flex flex-col justify-between animate-duo-enter ${
          gradeResult && !gradeResult.isCorrect ? 'animate-duo-shake' : ''
        }`}
      >
        {/* FRONT FACE (Mặt trước) */}
        <div>
          <label
            htmlFor="reading-input"
            className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 text-center"
          >
            {isWord
              ? hasKanji
                ? 'Cách đọc từ này là gì?'
                : 'Nghĩa của từ này là gì?'
              : isKanji
              ? 'Âm Hán Việt & Cách đọc của chữ này là gì?'
              : isGrammar
              ? 'Ý nghĩa và cách dùng của mẫu câu này là gì?'
              : 'Nội dung thẻ'}
          </label>

          {/* Large Card Text */}
          <div className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-50 font-sans tracking-wide text-center my-6">
            {currentCard.word?.surface ||
              currentCard.kanji?.char ||
              currentCard.grammar?.title ||
              currentCard.customPrompt}
          </div>

          {/* Input / Buttons for cards requiring input */}
          {requiresInput && !isAnswerRevealed && (
            <div className="space-y-3 max-w-sm mx-auto">
              <input
                id="reading-input"
                ref={inputRef}
                type="text"
                lang="ja"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder={
                  isWord
                    ? 'Gõ hiragana...'
                    : isKanji
                    ? 'Gõ Hán Việt hoặc cách đọc...'
                    : 'Nhập câu trả lời...'
                }
                value={inputReading}
                onChange={(e) => setInputReading(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                className="w-full text-center text-lg font-medium px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 touch-target text-slate-900 dark:text-slate-100"
              />

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCheckAnswer}
                  className="flex-1 py-3 duo-btn-3d duo-btn-sky text-sm rounded-xl touch-target flex items-center justify-center space-x-1.5"
                >
                  <span>Kiểm tra</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDoNotKnow}
                  className="px-4 py-3 duo-btn-3d duo-btn-neutral text-sm rounded-xl touch-target"
                >
                  Không biết
                </button>
              </div>
            </div>
          )}

          {!requiresInput && !isAnswerRevealed && (
            <div className="text-center mt-6">
              <button
                onClick={() => setIsAnswerRevealed(true)}
                className="px-8 py-3.5 duo-btn-3d duo-btn-sky text-sm rounded-xl touch-target"
              >
                Hiện đáp án
              </button>
            </div>
          )}

          {/* Immediate check feedback */}
          {isAnswerRevealed && gradeResult && (
            <div
              className={`p-3 rounded-2xl flex items-center justify-center space-x-2 text-sm font-bold my-2 shadow-sm ${
                gradeResult.isCorrect
                  ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-400 dark:border-emerald-700 animate-duo-pop'
                  : 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-2 border-rose-300 dark:border-rose-700 animate-duo-shake'
              }`}
            >
              {gradeResult.isCorrect ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Chính xác! Làm tốt lắm! 🎉</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  <span>Chưa chính xác — Hãy xem lại đáp án bên dưới nhé!</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* BACK FACE (Mặt sau) */}
        {isAnswerRevealed && (
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-300">
            {/* Word Card Back */}
            {currentCard.word && (
              <>
                <div className="text-2xl font-bold text-sky-600 dark:text-sky-400 font-sans text-center">
                  {currentCard.word.readings.join(' / ')}
                </div>

                <div className="text-center space-y-1">
                  <div className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {currentCard.word.meaningVi}
                  </div>

                  {((currentCard.word.kanji && currentCard.word.kanji.length > 0) ||
                    (currentCard.word.hanVietBreakdown && currentCard.word.hanVietBreakdown.length > 0)) && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center space-x-1.5 flex-wrap">
                      <span>Hán Việt:</span>
                      {currentCard.word.kanji && currentCard.word.kanji.length > 0 ? (
                        currentCard.word.kanji.map((char, kIdx) => {
                          const hv = currentCard.word?.hanVietBreakdown?.[kIdx] || '';
                          return (
                            <button
                              key={`${char}-${kIdx}`}
                              type="button"
                              onClick={() => onSelectKanji && onSelectKanji(char)}
                              className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-sky-900 text-sky-700 dark:text-sky-300 font-medium text-xs transition"
                              title={`Xem chi tiết chữ ${char}`}
                            >
                              {char} {hv ? `(${hv})` : ''}
                            </button>
                          );
                        })
                      ) : (
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {currentCard.word.hanVietBreakdown?.join(' ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {currentCard.word.pos && (
                  <div className="text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {currentCard.word.pos}
                    </span>
                  </div>
                )}

                {sentence && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1 text-left">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-relaxed font-sans">
                      {sentence.jp}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {sentence.vi}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Kanji Card Back */}
            {currentCard.kanji && (
              <div className="text-center space-y-2">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {currentCard.kanji.hanViet.join(' - ')}
                </div>
                <div className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  {currentCard.kanji.meaningVi}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                  <div>
                    <span className="font-semibold">Onyomi:</span>{' '}
                    {currentCard.kanji.onyomi.join(', ') || '—'}
                  </div>
                  <div>
                    <span className="font-semibold">Kunyomi:</span>{' '}
                    {currentCard.kanji.kunyomi.join(', ') || '—'}
                  </div>
                  {currentCard.kanji.strokeCount && (
                    <div>Số nét: {currentCard.kanji.strokeCount} nét</div>
                  )}
                </div>
              </div>
            )}

            {/* Grammar Card Back */}
            {currentCard.grammar && (
              <div className="space-y-3 text-left">
                <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/60">
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-1">
                    Giải thích ngữ pháp:
                  </div>
                  <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    {currentCard.grammar.explanationVi}
                  </div>
                </div>

                {currentCard.grammar.examples && currentCard.grammar.examples.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Ví dụ minh họa:
                    </div>
                    {currentCard.grammar.examples.slice(0, 2).map((ex, exIdx) => (
                      <div
                        key={exIdx}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-0.5"
                      >
                        <div className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 font-sans">
                          {ex.jp}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {ex.vi}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Card ID */}
            <div className="text-[11px] text-slate-400 text-right">
              Mã thẻ: {currentCard.refId}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Answer Bar: 4 buttons (Again / Hard / Good / Easy) */}
      {isAnswerRevealed && (
        <div className="sticky bottom-16 sm:bottom-6 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl grid grid-cols-4 gap-2.5 animate-duo-slide-up">
          {/* Again (1) */}
          <button
            onClick={() => handleApplyRating(Rating.Again)}
            aria-label={`Lặp lại (khoảng ôn: ${previews[Rating.Again].intervalLabel})`}
            className="duo-btn-3d duo-btn-rose flex flex-col items-center justify-center p-2.5 rounded-xl touch-target focus:outline-none"
          >
            <span className="text-xs font-bold text-white/90">
              {previews[Rating.Again].intervalLabel}
            </span>
            <span className="text-sm font-extrabold mt-0.5">Again</span>
            <span className="text-[10px] text-white/80 opacity-80 mt-0.5">Phím 1</span>
          </button>

          {/* Hard (2) */}
          <button
            onClick={() => handleApplyRating(Rating.Hard)}
            aria-label={`Khó (khoảng ôn: ${previews[Rating.Hard].intervalLabel})`}
            className="duo-btn-3d duo-btn-amber flex flex-col items-center justify-center p-2.5 rounded-xl touch-target focus:outline-none"
          >
            <span className="text-xs font-bold text-white/90">
              {previews[Rating.Hard].intervalLabel}
            </span>
            <span className="text-sm font-extrabold mt-0.5">Hard</span>
            <span className="text-[10px] text-white/80 opacity-80 mt-0.5">Phím 2</span>
          </button>

          {/* Good (3) */}
          <button
            onClick={() => handleApplyRating(Rating.Good)}
            aria-label={`Tốt (khoảng ôn: ${previews[Rating.Good].intervalLabel})`}
            className="duo-btn-3d duo-btn-sky flex flex-col items-center justify-center p-2.5 rounded-xl touch-target focus:outline-none"
          >
            <span className="text-xs font-bold text-white/90">
              {previews[Rating.Good].intervalLabel}
            </span>
            <span className="text-sm font-extrabold mt-0.5">Good</span>
            <span className="text-[10px] text-white/80 opacity-80 mt-0.5">Phím 3</span>
          </button>

          {/* Easy (4) */}
          <button
            onClick={() => handleApplyRating(Rating.Easy)}
            aria-label={`Dễ (khoảng ôn: ${previews[Rating.Easy].intervalLabel})`}
            className="duo-btn-3d duo-btn-emerald flex flex-col items-center justify-center p-2.5 rounded-xl touch-target focus:outline-none"
          >
            <span className="text-xs font-bold text-white/90">
              {previews[Rating.Easy].intervalLabel}
            </span>
            <span className="text-sm font-extrabold mt-0.5">Easy</span>
            <span className="text-[10px] text-white/80 opacity-80 mt-0.5">Phím 4</span>
          </button>
        </div>
      )}
    </div>
  );
}
