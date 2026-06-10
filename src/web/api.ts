import type { Deck, GradeResult, RatingName } from '../core/schema';

export interface Boot {
  mode: 'generate' | 'review' | 'browse';
  deckId: string | null;
}

export interface DeckRow {
  deckId: string;
  title: string;
  source: string;
  cards: number;
  due: number;
  lastStudied: string | null;
}

export interface SessionInfo {
  mode: 'cram' | 'review';
  cardIds: string[];
}

export interface Summary {
  cardsRated: number;
  minutes: number;
  capstone: GradeResult | null;
  weak: { cardId: string; agains: number; label: string; section: string }[];
  nextDue: string;
  deckDir: string;
}

export type BusEvent =
  | { type: 'progress'; line: string }
  | { type: 'deck'; deckId: string; warnings: string[]; costUsd?: number }
  | { type: 'error'; message: string; hint?: string };

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `http ${res.status}`);
  return body;
}

export const api = {
  boot: () => fetch('/api/boot').then((r) => json<Boot>(r)),
  decks: () => fetch('/api/decks').then((r) => json<DeckRow[]>(r)),
  deck: (id: string) => fetch(`/api/decks/${id}`).then((r) => json<Deck>(r)),
  session: (id: string, mode: 'cram' | 'review') =>
    fetch(`/api/decks/${id}/session?mode=${mode}`).then((r) => json<SessionInfo>(r)),
  grade: (id: string, cardId: string, answer: string) =>
    fetch(`/api/decks/${id}/cards/${cardId}/grade`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
      headers: { 'content-type': 'application/json' },
    }).then((r) => json<GradeResult>(r)),
  rate: (id: string, cardId: string, rating: RatingName) =>
    fetch(`/api/decks/${id}/cards/${cardId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
      headers: { 'content-type': 'application/json' },
    }).then((r) => json<{ due: string }>(r)),
  capstone: (id: string, answer: string) =>
    fetch(`/api/decks/${id}/capstone`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
      headers: { 'content-type': 'application/json' },
    }).then((r) => json<GradeResult>(r)),
  endSession: (id: string) =>
    fetch(`/api/decks/${id}/session/end`, { method: 'POST' }).then((r) => json<Summary>(r)),
  events: (onEvent: (e: BusEvent) => void): (() => void) => {
    const es = new EventSource('/api/events');
    es.onmessage = (m) => onEvent(JSON.parse(m.data as string) as BusEvent);
    return () => es.close();
  },
};
