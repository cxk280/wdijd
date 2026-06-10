import type { RatingName } from '../core/schema.js';

export interface QueueSnapshot {
  items: string[];
  pos: number;
  rated: number;
  total: number;
  mode: 'cram' | 'review';
}

/**
 * Cram queue with mastery requeue: `again` reinserts ~5 ahead, `hard` ~10
 * ahead; a card leaves the session once rated good/easy. Review mode requeues
 * `again` only.
 */
export class Queue {
  private items: string[];
  private pos = 0;
  readonly total: number;
  rated = 0;

  constructor(
    cardIds: string[],
    private mode: 'cram' | 'review',
  ) {
    this.items = [...cardIds];
    this.total = cardIds.length;
  }

  snapshot(): QueueSnapshot {
    return { items: [...this.items], pos: this.pos, rated: this.rated, total: this.total, mode: this.mode };
  }

  /**
   * Rebuild from a saved snapshot, but only if every queued id still exists in
   * the current deck (guards against a deck whose cards changed under the id).
   * Returns null if the snapshot is stale/inconsistent.
   */
  static restore(snap: QueueSnapshot, validIds: Set<string>): Queue | null {
    if (snap.mode !== 'cram') return null;
    if (!snap.items.every((id) => validIds.has(id))) return null;
    if (snap.pos < 0 || snap.pos > snap.items.length) return null;
    const q = new Queue([], snap.mode);
    q.items = [...snap.items];
    q.pos = snap.pos;
    q.rated = snap.rated;
    (q as { total: number }).total = snap.total;
    return q;
  }

  current(): string | null {
    return this.items[this.pos] ?? null;
  }

  /** 1-based position among distinct cards for the header. */
  position(): number {
    return Math.min(this.rated + 1, this.total);
  }

  advance(rating: RatingName | null): void {
    const id = this.items[this.pos];
    if (id === undefined) return;
    const requeue =
      rating === 'again' ? 5 : rating === 'hard' && this.mode === 'cram' ? 10 : null;
    if (requeue !== null) {
      const at = Math.min(this.pos + requeue, this.items.length);
      this.items.splice(at, 0, id);
    } else if (rating !== null) {
      this.rated += 1;
    } else if (rating === null) {
      // unrated (overview) — counts as seen
      this.rated += 1;
    }
    this.pos += 1;
  }

  done(): boolean {
    return this.pos >= this.items.length;
  }
}
