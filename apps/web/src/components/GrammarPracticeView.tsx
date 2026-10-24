import { useState, useMemo } from 'react';
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Search
} from 'lucide-react';
import { SEED_GRAMMAR, type Grammar } from '@raku/core';

export function GrammarPracticeView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrammar, setSelectedGrammar] = useState<Grammar | null>(() => SEED_GRAMMAR[0] || null);
  const [activeExerciseType, setActiveExerciseType] = useState<'fill_blank' | 'order' | 'translate'>('fill_blank');

  // Exercise states
  // 1. Fill blank:
  const [fillAnswer, setFillAnswer] = useState<string | null>(null);
  const [fillSubmitted, setFillSubmitted] = useState<boolean>(false);

  // 2. Sentence scramble / order:
  const sampleTokens = useMemo(() => {
    if (!selectedGrammar || !selectedGrammar.examples[0]) {
      return ['毎日話している', 'うちに、', '好きに', 'なりました。'];
    }
    const jp = selectedGrammar.examples[0].jp;
    return jp.replace(/([。、？！])/g, ' $1 ').split(/\s+/).filter(Boolean);
  }, [selectedGrammar]);

  const [shuffledTokens, setShuffledTokens] = useState<string[]>(() => {
    return [...sampleTokens].sort(() => Math.random() - 0.5);
  });
  const [assembledTokens, setAssembledTokens] = useState<string[]>([]);
  const [orderSubmitted, setOrderSubmitted] = useState<boolean>(false);

  // Filter grammar points by search query
  const filteredGrammar = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SEED_GRAMMAR;
    return SEED_GRAMMAR.filter((g) => {
      return (
        g.title.toLowerCase().includes(q) ||
        g.explanationVi.toLowerCase().includes(q) ||
        g.examples.some((ex) => ex.jp.includes(q) || ex.vi.toLowerCase().includes(q))
      );
    });
  }, [searchQuery]);

  // Reset exercise state when choosing a grammar point
  const handleSelectGrammar = (g: Grammar) => {
    setSelectedGrammar(g);
    setFillAnswer(null);
    setFillSubmitted(false);
    setAssembledTokens([]);
    setOrderSubmitted(false);

    // Reshuffle tokens for order exercise
    const tokens = g.examples[0]?.jp
      ? g.examples[0].jp.replace(/([。、？！])/g, ' $1 ').split(/\s+/).filter(Boolean)
      : ['毎日話している', 'うちに、', '好きに', 'なりました。'];
    setShuffledTokens([...tokens].sort(() => Math.random() - 0.5));
  };

  const isOrderCorrect = assembledTokens.join('') === sampleTokens.join('');

  return (
    <div className="space-y-6">
      {/* Grammar list header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <span>Tổng Hợp Ngữ Pháp N3 ({SEED_GRAMMAR.length} điểm)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Toàn bộ các cấu trúc ngữ pháp N3 hay xuất hiện trong các đề thi JLPT
            </p>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm ngữ pháp (ví dụ: うちに, わけ, ため...)"
              className="pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100 w-full sm:w-64"
            />
          </div>
        </div>

        {/* Grammar Points Selection Cards (Scrollable) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
          {filteredGrammar.map((g) => {
            const isSelected = selectedGrammar?.id === g.id;
            return (
              <button
                key={g.id}
                onClick={() => handleSelectGrammar(g)}
                className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between touch-target ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 ring-2 ring-sky-400'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
                      {g.title}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 shrink-0 ml-1">
                      {g.jlpt}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {g.explanationVi}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Grammar Details & Exercises */}
      {selectedGrammar && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6 animate-in fade-in duration-200">
          <div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-50 font-sans">
              {selectedGrammar.title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              {selectedGrammar.explanationVi}
            </p>
          </div>

          {/* Example Sentences */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Ví dụ trong đề thi:
            </h4>
            <div className="space-y-2">
              {selectedGrammar.examples.map((ex, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1"
                >
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100 font-sans leading-relaxed">
                    {ex.jp}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {ex.vi}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Exercises Tabs */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Luyện tập với cấu trúc này</span>
              </h4>

              <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium">
                <button
                  onClick={() => setActiveExerciseType('fill_blank')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeExerciseType === 'fill_blank'
                      ? 'bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-300 font-bold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Điền chỗ trống
                </button>
                <button
                  onClick={() => setActiveExerciseType('order')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeExerciseType === 'order'
                      ? 'bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-300 font-bold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Sắp xếp câu
                </button>
              </div>
            </div>

            {/* Exercise 1: Fill blank */}
            {activeExerciseType === 'fill_blank' && (
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
                <div className="text-base font-medium text-slate-800 dark:text-slate-100 leading-relaxed font-sans text-center">
                  {selectedGrammar.examples[0]?.jp
                    ? selectedGrammar.examples[0].jp.replace(
                        selectedGrammar.title.split(' ')[0] || '',
                        '（　　　）'
                      )
                    : 'ご飯を（　　　）、薬を飲みます。'}
                </div>
                <p className="text-xs text-slate-400 text-center">
                  Chọn mẫu ngữ pháp phù hợp để hoàn thành câu trên:
                </p>

                {/* Choices */}
                <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto">
                  {[
                    selectedGrammar.title.split(' ')[0] || 'うちに',
                    'かわりに',
                    'ついでに',
                    'たびに'
                  ].map((choice) => {
                    const isSelected = fillAnswer === choice;
                    return (
                      <button
                        key={choice}
                        disabled={fillSubmitted}
                        onClick={() => setFillAnswer(choice)}
                        className={`p-3.5 duo-chip text-sm transition touch-target ${
                          isSelected ? 'duo-chip-selected' : ''
                        }`}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>

                {!fillSubmitted ? (
                  <div className="text-center pt-2">
                    <button
                      disabled={!fillAnswer}
                      onClick={() => setFillSubmitted(true)}
                      className="px-8 py-3 duo-btn-3d duo-btn-sky text-xs rounded-xl shadow-sm touch-target"
                    >
                      Kiểm tra đáp án
                    </button>
                  </div>
                ) : (
                  <div
                    className={`p-4 rounded-2xl border-2 space-y-2 shadow-sm ${
                      fillAnswer === (selectedGrammar.title.split(' ')[0] || 'うちに')
                        ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-400 dark:border-emerald-700 animate-duo-pop'
                        : 'bg-rose-50 dark:bg-rose-950/70 border-rose-300 dark:border-rose-700 animate-duo-shake'
                    }`}
                  >
                    <div className="flex items-center space-x-2 text-sm font-bold">
                      {fillAnswer === (selectedGrammar.title.split(' ')[0] || 'うちに') ? (
                        <div className="text-emerald-700 dark:text-emerald-300 flex items-center space-x-1.5">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          <span>Chính xác! Đáp án đúng là: {selectedGrammar.title.split(' ')[0]} 🎉</span>
                        </div>
                      ) : (
                        <div className="text-rose-700 dark:text-rose-300 flex items-center space-x-1.5">
                          <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                          <span>Chưa chính xác! Đáp án đúng là: {selectedGrammar.title.split(' ')[0]}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Giải thích: {selectedGrammar.explanationVi}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Exercise 2: Sentence Scramble / Order (Section 9.2) */}
            {activeExerciseType === 'order' && (
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
                <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  Chạm vào các mảnh ghép bên dưới để ghép thành câu đúng:
                </div>

                {/* Assembled tokens slot */}
                <div className="min-h-[58px] p-3 rounded-2xl bg-white dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-wrap gap-2 items-center justify-center transition-all">
                  {assembledTokens.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">Câu ghép sẽ xuất hiện ở đây...</span>
                  ) : (
                    assembledTokens.map((token, idx) => (
                      <button
                        key={`${token}-${idx}`}
                        disabled={orderSubmitted}
                        onClick={() => {
                          setAssembledTokens((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        className="px-3.5 py-2 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-200 text-xs font-bold shadow-sm hover:bg-rose-100 dark:hover:bg-rose-950 hover:text-rose-700 transition animate-duo-pop border border-sky-300 dark:border-sky-800"
                        title="Bấm để gỡ mảnh ghép này"
                      >
                        {token} ✕
                      </button>
                    ))
                  )}
                </div>

                {/* Available tokens pool */}
                <div className="flex flex-wrap gap-2.5 justify-center pt-2">
                  {shuffledTokens.map((token, idx) => {
                    const isUsed = assembledTokens.includes(token);
                    return (
                      <button
                        key={idx}
                        disabled={isUsed || orderSubmitted}
                        onClick={() => setAssembledTokens((prev) => [...prev, token])}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition touch-target ${
                          isUsed
                            ? 'opacity-25 border-2 border-dashed border-slate-300 dark:border-slate-700 bg-transparent shadow-none cursor-default'
                            : 'duo-chip'
                        }`}
                      >
                        {token}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-center space-x-3 pt-2">
                  <button
                    disabled={orderSubmitted || assembledTokens.length === 0}
                    onClick={() => setAssembledTokens([])}
                    className="px-4 py-2.5 duo-btn-3d duo-btn-neutral text-xs rounded-xl flex items-center space-x-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Làm lại</span>
                  </button>
                  <button
                    disabled={orderSubmitted || assembledTokens.length < sampleTokens.length}
                    onClick={() => setOrderSubmitted(true)}
                    className="px-6 py-2.5 duo-btn-3d duo-btn-sky text-xs rounded-xl flex items-center space-x-1.5"
                  >
                    <span>Kiểm tra câu ghép</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {orderSubmitted && (
                  <div
                    className={`p-4 rounded-2xl border-2 space-y-1 shadow-sm ${
                      isOrderCorrect
                        ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-400 dark:border-emerald-700 animate-duo-pop'
                        : 'bg-rose-50 dark:bg-rose-950/70 border-rose-300 dark:border-rose-700 animate-duo-shake'
                    }`}
                  >
                    <div className="flex items-center space-x-2 text-sm font-bold">
                      {isOrderCorrect ? (
                        <div className="text-emerald-700 dark:text-emerald-300 flex items-center space-x-1.5">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          <span>Xuất sắc! Bạn đã sắp xếp đúng câu hoàn chỉnh. 🎉</span>
                        </div>
                      ) : (
                        <div className="text-rose-700 dark:text-rose-300 flex items-center space-x-1.5">
                          <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                          <span>Chưa chính xác! Câu đúng là: {sampleTokens.join('')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
