export type BusEvent =
  | { type: 'progress'; line: string }
  | { type: 'deck'; deckId: string; warnings: string[]; costUsd?: number }
  | { type: 'error'; message: string; hint?: string };

/** In-memory event bus with replay, so a late-connecting browser misses nothing. */
export class Bus {
  private listeners = new Set<(e: BusEvent) => void>();
  readonly history: BusEvent[] = [];

  emit(e: BusEvent): void {
    this.history.push(e);
    for (const fn of this.listeners) fn(e);
  }

  subscribe(fn: (e: BusEvent) => void): () => void {
    for (const e of this.history) fn(e);
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
