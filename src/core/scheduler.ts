import {
  Rating,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card as FsrsCard,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs';
import { RatingName } from './schema.js';

const f = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: true }));

export const RATING: Record<RatingName, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export type { FsrsCard, ReviewLog };

export function newCardState(now: Date = new Date()): FsrsCard {
  return createEmptyCard(now);
}

export function rate(
  card: FsrsCard,
  rating: RatingName,
  now: Date = new Date(),
): { card: FsrsCard; log: ReviewLog } {
  const r = f.next(card, now, RATING[rating]);
  return { card: r.card, log: r.log };
}

export function isDue(card: FsrsCard, now: Date = new Date()): boolean {
  return new Date(card.due) <= now;
}

/** JSON round-trip turns Dates into strings — revive on load. */
export function reviveCard(json: Record<string, unknown>): FsrsCard {
  return {
    ...(json as unknown as FsrsCard),
    due: new Date(json.due as string),
    last_review: json.last_review ? new Date(json.last_review as string) : undefined,
  };
}

/** Terse human description of the next due horizon, e.g. "3 cards in 2d". */
export function nextDueLine(cards: FsrsCard[], now: Date = new Date()): string {
  const due = cards.filter((c) => isDue(c, now)).length;
  if (due > 0) return `${due} due now`;
  if (cards.length === 0) return 'nothing scheduled';
  const soonest = cards.reduce((a, b) => (new Date(a.due) <= new Date(b.due) ? a : b));
  const days = Math.max(1, Math.ceil((new Date(soonest.due).getTime() - now.getTime()) / 86_400_000));
  const count = cards.filter(
    (c) => new Date(c.due).getTime() <= new Date(soonest.due).getTime() + 86_400_000,
  ).length;
  return `${count} cards in ${days}d`;
}
