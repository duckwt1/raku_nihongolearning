import {
  WORDS_BY_ID,
  createNewCard,
  type Deck,
  type StudyCard,
  type Word
} from '@raku/core';

/**
 * Safe chunk size well below Firestore's 1 MiB document limit (~200-250 KB per 600 cards).
 */
export const DECK_BUNDLE_CHUNK_SIZE = 600;

export interface PackedDeckWord {
  id: string;
  surface: string;
  readings: string[];
  meaningVi: string;
  pos?: string;
  hanVietBreakdown?: string[];
  kanji?: string[];
  exampleJp?: string;
  exampleVi?: string;
  tags?: string[];
}

export interface PackedDeckCard {
  id: string;
  refId: string;
  type: 'word' | 'custom';
  word: PackedDeckWord;
}

export interface DeckBundleChunkDoc {
  deckId: string;
  chunkIndex: number;
  chunkCount: number;
  cardsHash: string;
  cards: PackedDeckCard[];
  updatedAt: string;
}

export function getDeckBundleDocId(deckId: string, chunkIndex = 0): string {
  return chunkIndex === 0 ? deckId : `${deckId}__p${chunkIndex}`;
}

export function isOwnedCustomDeck(deck: Deck): boolean {
  return deck.origin === 'owned' && !deck.isDefault && deck.id !== 'deck_n3_words';
}

export function isCustomBundleCard(card: StudyCard): boolean {
  if (!card.word) return false;
  if (card.type === 'kanji' || card.type === 'grammar') return false;
  if (card.deckId === 'deck_n3_kanji' || card.deckId === 'deck_n3_grammar') return false;
  if (WORDS_BY_ID.has(card.refId)) return false;
  return Boolean(card.word.surface?.trim() && card.word.meaningVi?.trim());
}

export function normalizePackedWord(raw: unknown, fallbackId: string): Word | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  const surface = typeof w.surface === 'string' ? w.surface.trim() : '';
  const meaningVi = typeof w.meaningVi === 'string' ? w.meaningVi.trim() : '';
  if (!surface || !meaningVi) return null;

  const rawReadings = Array.isArray(w.readings)
    ? w.readings.map((r) => (typeof r === 'string' ? r.trim() : '')).filter(Boolean)
    : [];
  const readings = rawReadings.length > 0 ? rawReadings : [surface];

  const id = typeof w.id === 'string' && w.id.trim() ? w.id.trim() : fallbackId;
  const pos = typeof w.pos === 'string' && w.pos.trim() ? w.pos.trim() : undefined;
  const hanVietBreakdown = Array.isArray(w.hanVietBreakdown)
    ? w.hanVietBreakdown.map((h) => (typeof h === 'string' ? h.trim() : '')).filter(Boolean)
    : [];
  const kanji = Array.isArray(w.kanji)
    ? w.kanji.map((k) => (typeof k === 'string' ? k.trim() : '')).filter(Boolean)
    : [];
  const exampleJp =
    typeof w.exampleJp === 'string' && w.exampleJp.trim() ? w.exampleJp.trim() : undefined;
  const exampleVi =
    typeof w.exampleVi === 'string' && w.exampleVi.trim() ? w.exampleVi.trim() : undefined;
  const tags = Array.isArray(w.tags)
    ? w.tags.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)
    : [];

  return {
    id,
    surface,
    readings,
    meaningVi,
    ...(pos ? { pos } : {}),
    kanji,
    hanVietBreakdown,
    exampleIds: [],
    ...(exampleJp ? { exampleJp } : {}),
    ...(exampleVi ? { exampleVi } : {}),
    tags
  };
}

/**
 * Strips FSRS scheduling data and normalizes custom cards in a deck into a compact,
 * deterministically ordered payload ready for hashing and single-doc Firestore storage.
 */
export function packDeckCards(cardsInDeck: StudyCard[]): PackedDeckCard[] {
  const packed: PackedDeckCard[] = [];
  const seenIds = new Set<string>();

  for (const card of cardsInDeck) {
    if (!isCustomBundleCard(card) || seenIds.has(card.id)) continue;
    const normalizedWord = normalizePackedWord(card.word, card.refId || card.id);
    if (!normalizedWord) continue;
    seenIds.add(card.id);

    const packedWord: PackedDeckWord = {
      id: normalizedWord.id,
      surface: normalizedWord.surface,
      readings: normalizedWord.readings,
      meaningVi: normalizedWord.meaningVi,
      ...(normalizedWord.pos ? { pos: normalizedWord.pos } : {}),
      ...(normalizedWord.hanVietBreakdown.length > 0
        ? { hanVietBreakdown: normalizedWord.hanVietBreakdown }
        : {}),
      ...(normalizedWord.kanji.length > 0 ? { kanji: normalizedWord.kanji } : {}),
      ...(normalizedWord.exampleJp ? { exampleJp: normalizedWord.exampleJp } : {}),
      ...(normalizedWord.exampleVi ? { exampleVi: normalizedWord.exampleVi } : {}),
      ...(normalizedWord.tags.length > 0 ? { tags: normalizedWord.tags } : {})
    };

    packed.push({
      id: card.id,
      refId: card.refId || normalizedWord.id,
      type: card.type === 'custom' ? 'custom' : 'word',
      word: packedWord
    });
  }

  packed.sort((a, b) => a.id.localeCompare(b.id));
  return packed;
}

/**
 * Deterministic 64-bit FNV-1a + DJB2 hash over packed cards so unchanged decks incur
 * zero Firestore reads and zero Firestore writes across syncs.
 */
export function computeDeckCardsHash(packedCards: PackedDeckCard[]): string {
  if (packedCards.length === 0) return '';
  const value = JSON.stringify(packedCards);
  let hashA = 2166136261;
  let hashB = 5381;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    hashA = Math.imul(hashA ^ code, 16777619);
    hashB = Math.imul(hashB, 33) ^ code;
  }
  return `${(hashA >>> 0).toString(36)}-${(hashB >>> 0).toString(36)}`;
}

export function splitIntoBundleChunks(
  deckId: string,
  packedCards: PackedDeckCard[],
  cardsHash: string,
  nowIso = new Date().toISOString()
): Array<{ bundleId: string; data: DeckBundleChunkDoc }> {
  if (packedCards.length === 0) return [];
  const chunkCount = Math.ceil(packedCards.length / DECK_BUNDLE_CHUNK_SIZE);
  const chunks: Array<{ bundleId: string; data: DeckBundleChunkDoc }> = [];

  for (let idx = 0; idx < chunkCount; idx++) {
    const slice = packedCards.slice(
      idx * DECK_BUNDLE_CHUNK_SIZE,
      (idx + 1) * DECK_BUNDLE_CHUNK_SIZE
    );
    chunks.push({
      bundleId: getDeckBundleDocId(deckId, idx),
      data: {
        deckId,
        chunkIndex: idx,
        chunkCount,
        cardsHash,
        cards: slice,
        updatedAt: nowIso
      }
    });
  }

  return chunks;
}

export interface MergeDeckBundleOptions {
  /**
   * When true, custom cards currently in `deckId` locally that are absent from the
   * cloud bundle are removed (reflecting deletions made on another device).
   */
  authoritative?: boolean;
}

/**
 * Merges packed vocabulary cards for a single deck into the local StudyCard array
 * without ever clobbering local FSRS progress or cards belonging to other decks.
 */
export function mergeDeckBundleCardsIntoLocal(
  localCards: StudyCard[],
  deckId: string,
  packedCards: PackedDeckCard[],
  options: MergeDeckBundleOptions = {}
): {
  cards: StudyCard[];
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  hasChanges: boolean;
} {
  const authoritative = Boolean(options.authoritative);
  const packedById = new Map<string, PackedDeckCard>();
  for (const item of packedCards) {
    if (item?.id) packedById.set(item.id, item);
  }

  let addedCount = 0;
  let updatedCount = 0;
  let removedCount = 0;
  const seenIds = new Set<string>();
  const nextCards: StudyCard[] = [];

  for (const existing of localCards) {
    seenIds.add(existing.id);

    if (existing.deckId !== deckId) {
      nextCards.push(existing);
      continue;
    }

    const remote = packedById.get(existing.id);
    if (!remote) {
      if (authoritative && isCustomBundleCard(existing)) {
        removedCount++;
        continue;
      }
      nextCards.push(existing);
      continue;
    }

    const normalizedWord = normalizePackedWord(remote.word, remote.refId || remote.id);
    if (!normalizedWord) {
      nextCards.push(existing);
      continue;
    }

    const prevWord = existing.word;
    const mergedWord: Word = {
      ...normalizedWord,
      id: prevWord?.id || normalizedWord.id,
      exampleIds: prevWord?.exampleIds || []
    };

    const wordChanged =
      !prevWord ||
      prevWord.surface !== mergedWord.surface ||
      prevWord.meaningVi !== mergedWord.meaningVi ||
      prevWord.pos !== mergedWord.pos ||
      prevWord.exampleJp !== mergedWord.exampleJp ||
      prevWord.exampleVi !== mergedWord.exampleVi ||
      JSON.stringify(prevWord.readings) !== JSON.stringify(mergedWord.readings) ||
      JSON.stringify(prevWord.hanVietBreakdown) !== JSON.stringify(mergedWord.hanVietBreakdown);

    if (wordChanged) {
      updatedCount++;
      nextCards.push({
        ...existing,
        word: mergedWord
      });
    } else {
      nextCards.push(existing);
    }
  }

  for (const remote of packedCards) {
    if (!remote?.id || seenIds.has(remote.id)) continue;
    const normalizedWord = normalizePackedWord(remote.word, remote.refId || remote.id);
    if (!normalizedWord) continue;

    nextCards.push({
      id: remote.id,
      type: remote.type === 'custom' ? 'custom' : 'word',
      refId: remote.refId || normalizedWord.id,
      deckId,
      word: normalizedWord,
      fsrsCard: createNewCard(),
      isNew: true,
      isDue: false
    });
    addedCount++;
  }

  return {
    cards: nextCards,
    addedCount,
    updatedCount,
    removedCount,
    hasChanges: addedCount > 0 || updatedCount > 0 || removedCount > 0
  };
}
