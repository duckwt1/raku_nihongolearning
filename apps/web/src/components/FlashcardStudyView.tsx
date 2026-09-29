import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  ArrowRight
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
  const [inputReading, setInputReading] = useState('');
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [gradeResult, setGradeResult] = useState<{ isCorrect: boolean } | null>(null);
  const [isComposing, setIsComposing] = useState(false); // IME composition guard

  const inputRef = useRef<HTMLInputElement>(null);

  const currentCard = cards[currentIndex];
  const totalCards = cards.length;

  // Auto focus input when switching to a new card
  useEffect(() => {
    setIsAnswerRevealed(false);
    setGradeResult(null);
    setInputReading('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentIndex]);

  const hasKanji = currentCard
    ? Boolean(currentCard.word.kanji && currentCard.word.kanji.length > 0)
    : false;

  // Check user reading answer (Section 4)
  const handleCheckAnswer = useCallback(() => {
    if (!currentCard || isAnswerRevealed) return;

    if (!hasKanji) {
      // Kana-only card: reveal immediately
      setIsAnswerRevealed(true);
      return;
    }

    const result = gradeReadingAnswer(inputReading, currentCard.word.readings);
    setGradeResult({ isCorrect: result.isCorrect });
    setIsAnswerRevealed(true);
  }, [currentCard, isAnswerRevealed, hasKanji, inputReading]);

  // "Không biết" button handler
  const handleDoNotKnow = useCallback(() => {
    if (!currentCard || isAnswerRevealed) return;
    setGradeResult({ isCorrect: false });
    setIsAnswerRevealed(true);
  }, [currentCard, isAnswerRevealed]);

  // FSRS rating handler (Again, Hard, Good, Easy)
  const handleApplyRating = useCallback(
    (rating: Rating) => {
      if (!currentCard) return;

      // Advance card state via FSRS
      applyGrade(currentCard.fsrsCard, rating as 1 | 2 | 3 | 4);

      if (onRateCard) {
        onRateCard(currentCard, rating);
      }

      if (currentIndex + 1 < totalCards) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        onComplete();
      }
    },
    [currentCard, currentIndex, totalCards, onComplete, onRateCard]
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
      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Tuyệt vời! Bạn đã hoàn thành phiên ôn tập!
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
          Tất cả thẻ đến hạn đã được cập nhật lịch FSRS.
        </p>
        <button
          onClick={onComplete}
          className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm touch-target"
        >
          Trở về kho từ vựng
        </button>
      </div>
    );
  }

  // Calculate FSRS previews for all 4 buttons
  const previews = previewCardGrades(currentCard.fsrsCard);
  const sentence = currentCard.word.exampleIds?.[0]
    ? SENTENCES_BY_ID.get(currentCard.word.exampleIds[0])
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
        className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-sky-600 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
        />
      </div>

      {/* Main Flashcard Container */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 sm:p-8 transition-all min-h-[360px] flex flex-col justify-between">
        {/* FRONT FACE (Mặt trước) */}
        <div>
          <label
            htmlFor="reading-input"
            className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2"
          >
            {hasKanji ? 'Cách đọc từ này là gì?' : 'Nghĩa của từ này là gì?'}
          </label>

          {/* Word in large text */}
          <div className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-50 font-sans tracking-wide text-center my-6">
            {currentCard.word.surface}
          </div>

          {/* Kanji Input / Buttons */}
          {hasKanji && !isAnswerRevealed && (
            <div className="space-y-3 max-w-sm mx-auto">
              <input
                id="reading-input"
                ref={inputRef}
                type="text"
                lang="ja"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder="Gõ hiragana..."
                value={inputReading}
                onChange={(e) => setInputReading(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                className="w-full text-center text-lg font-medium px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 touch-target text-slate-900 dark:text-slate-100"
              />

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCheckAnswer}
                  className="flex-1 py-3 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-semibold text-sm rounded-xl shadow-sm transition touch-target flex items-center justify-center space-x-1"
                >
                  <span>Kiểm tra</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDoNotKnow}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-xl transition touch-target"
                >
                  Không biết
                </button>
              </div>
            </div>
          )}

          {!hasKanji && !isAnswerRevealed && (
            <div className="text-center mt-6">
              <button
                onClick={() => setIsAnswerRevealed(true)}
                className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm rounded-xl shadow-sm touch-target"
              >
                Hiện đáp án
              </button>
            </div>
          )}

          {/* Immediate check feedback */}
          {isAnswerRevealed && gradeResult && (
            <div
              className={`p-2.5 rounded-xl flex items-center justify-center space-x-2 text-sm font-semibold my-2 ${
                gradeResult.isCorrect
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              {gradeResult.isCorrect ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Chính xác!</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  <span>Chưa chính xác (hoặc bỏ qua)</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* BACK FACE (Mặt sau, theo thứ tự mục 4) */}
        {isAnswerRevealed && (
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-300">
            {/* 1. Cách đọc hiragana chữ lớn */}
            <div className="text-2xl font-bold text-sky-600 dark:text-sky-400 font-sans text-center">
              {currentCard.word.readings.join(' / ')}
            </div>

            {/* 2. Nghĩa tiếng Việt kèm Hán Việt từng chữ */}
            <div className="text-center space-y-1">
              <div className="text-base font-semibold text-slate-800 dark:text-slate-100">
                {currentCard.word.meaningVi}
              </div>

              {currentCard.word.kanji && currentCard.word.kanji.length > 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center space-x-1.5 flex-wrap">
                  <span>Hán Việt:</span>
                  {currentCard.word.kanji.map((char, kIdx) => {
                    const hv = currentCard.word.hanVietBreakdown?.[kIdx] || '';
                    return (
                      <button
                        key={`${char}-${kIdx}`}
                        type="button"
                        onClick={() => onSelectKanji && onSelectKanji(char)}
                        className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-sky-900 text-sky-700 dark:text-sky-300 font-medium text-xs transition"
                        title={`Xem chi tiết chữ ${char}`}
                      >
                        {char} ({hv})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Loại từ (pos) */}
            {currentCard.word.pos && (
              <div className="text-center">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {currentCard.word.pos}
                </span>
              </div>
            )}

            {/* 4. Câu ví dụ tiếng Nhật & bản dịch bên dưới */}
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

            {/* 5. Số thứ tự thẻ */}
            <div className="text-[11px] text-slate-400 text-right">
              Mã thẻ: {currentCard.refId}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Answer Bar: 4 buttons (Again / Hard / Good / Easy) */}
      {isAnswerRevealed && (
        <div className="sticky bottom-16 sm:bottom-6 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg grid grid-cols-4 gap-2">
          {/* Again (1) */}
          <button
            onClick={() => handleApplyRating(Rating.Again)}
            aria-label={`Lặp lại (khoảng ôn: ${previews[Rating.Again].intervalLabel})`}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 touch-target focus:outline-none focus:ring-2 focus:ring-rose-500 transition"
          >
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
              {previews[Rating.Again].intervalLabel}
            </span>
            <span className="text-sm font-bold mt-0.5">Again</span>
            <span className="text-[10px] text-rose-400 opacity-75 mt-0.5">Phím 1</span>
          </button>

          {/* Hard (2) */}
          <button
            onClick={() => handleApplyRating(Rating.Hard)}
            aria-label={`Khó (khoảng ôn: ${previews[Rating.Hard].intervalLabel})`}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 touch-target focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
          >
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {previews[Rating.Hard].intervalLabel}
            </span>
            <span className="text-sm font-bold mt-0.5">Hard</span>
            <span className="text-[10px] text-amber-400 opacity-75 mt-0.5">Phím 2</span>
          </button>

          {/* Good (3) */}
          <button
            onClick={() => handleApplyRating(Rating.Good)}
            aria-label={`Tốt (khoảng ôn: ${previews[Rating.Good].intervalLabel})`}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 touch-target focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
          >
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400">
              {previews[Rating.Good].intervalLabel}
            </span>
            <span className="text-sm font-bold mt-0.5">Good</span>
            <span className="text-[10px] text-sky-400 opacity-75 mt-0.5">Phím 3</span>
          </button>

          {/* Easy (4) */}
          <button
            onClick={() => handleApplyRating(Rating.Easy)}
            aria-label={`Dễ (khoảng ôn: ${previews[Rating.Easy].intervalLabel})`}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 touch-target focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
          >
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {previews[Rating.Easy].intervalLabel}
            </span>
            <span className="text-sm font-bold mt-0.5">Easy</span>
            <span className="text-[10px] text-emerald-400 opacity-75 mt-0.5">Phím 4</span>
          </button>
        </div>
      )}
    </div>
  );
}
