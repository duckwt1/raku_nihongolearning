import { useEffect, useState } from 'react';
import { MessageCircle, PenLine } from 'lucide-react';
import type { Deck, Grammar, SavedPhraseCandidate, StudyCard } from '@raku/core';
import type { User } from '../services/firebase';
import { ConversationRoleplayView } from './ConversationRoleplayView';
import { SentenceStudioView } from './SentenceStudioView';

export interface OutputPracticeHubProps {
  user: User | null;
  cards: StudyCard[];
  decks: Deck[];
  initialSubTab?: 'sentence' | 'roleplay';
  initialGrammar?: Grammar | null;
  onSelectKanji?: (char: string) => void;
  onSavePhraseToDeck: (phrase: SavedPhraseCandidate, preferredDeckId?: string) => string | null;
  onRecordPracticeTime?: (seconds: number) => void;
  onMarkCardGood?: (cardId: string) => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

export function OutputPracticeHub({
  user,
  cards,
  decks,
  initialSubTab = 'sentence',
  initialGrammar = null,
  onSelectKanji,
  onSavePhraseToDeck,
  onRecordPracticeTime,
  onMarkCardGood,
  onNotify
}: OutputPracticeHubProps) {
  const [subTab, setSubTab] = useState<'sentence' | 'roleplay'>(
    initialGrammar ? 'sentence' : initialSubTab
  );

  useEffect(() => {
    if (initialGrammar) {
      setSubTab('sentence');
    }
  }, [initialGrammar]);

  return (
    <div className="space-y-4">
      {/* Sub-mode switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Chế độ luyện đặt câu và hội thoại"
          className="inline-flex rounded-xl border border-raku-line bg-raku-subtle p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'sentence'}
            onClick={() => setSubTab('sentence')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-bold transition-colors sm:text-sm ${
              subTab === 'sentence'
                ? 'bg-raku-surface text-raku-accent shadow-xs'
                : 'text-raku-muted hover:text-raku-ink'
            }`}
          >
            <PenLine className="h-4 w-4" />
            <span>Đặt câu thông minh</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'roleplay'}
            onClick={() => setSubTab('roleplay')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-bold transition-colors sm:text-sm ${
              subTab === 'roleplay'
                ? 'bg-raku-surface text-raku-accent shadow-xs'
                : 'text-raku-muted hover:text-raku-ink'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            <span>Hội thoại nhập vai AI</span>
          </button>
        </div>
      </div>

      {subTab === 'sentence' ? (
        <SentenceStudioView
          user={user}
          cards={cards}
          decks={decks}
          initialGrammar={initialGrammar}
          onSelectKanji={onSelectKanji}
          onSavePhraseToDeck={onSavePhraseToDeck}
          onRecordPracticeTime={onRecordPracticeTime}
          onMarkCardGood={onMarkCardGood}
          onNotify={onNotify}
        />
      ) : (
        <ConversationRoleplayView
          user={user}
          cards={cards}
          decks={decks}
          onSelectKanji={onSelectKanji}
          onSavePhraseToDeck={onSavePhraseToDeck}
          onRecordPracticeTime={onRecordPracticeTime}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}
