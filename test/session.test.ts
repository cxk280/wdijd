import { describe, expect, it } from 'vitest';
import { Queue } from '../src/web/session.js';

describe('Queue snapshot / restore (cram resume)', () => {
  it('round-trips position and progress', () => {
    const q = new Queue(['a', 'b', 'c'], 'cram');
    q.advance('good'); // a done, pos=1
    const snap = q.snapshot();
    const restored = Queue.restore(snap, new Set(['a', 'b', 'c']))!;
    expect(restored).not.toBeNull();
    expect(restored.current()).toBe('b');
    expect(restored.position()).toBe(q.position());
    expect(restored.done()).toBe(false);
  });

  it('restores a done queue (refreshed on the capstone)', () => {
    const q = new Queue(['a'], 'cram');
    q.advance('good');
    const restored = Queue.restore(q.snapshot(), new Set(['a']))!;
    expect(restored.done()).toBe(true);
  });

  it('rejects a stale snapshot whose ids no longer exist', () => {
    const q = new Queue(['a', 'b'], 'cram');
    expect(Queue.restore(q.snapshot(), new Set(['x', 'y']))).toBeNull();
  });

  it('never restores a review-mode snapshot (due set is recomputed)', () => {
    const q = new Queue(['a'], 'review');
    expect(Queue.restore(q.snapshot(), new Set(['a']))).toBeNull();
  });

  it('preserves requeued (again) items in the snapshot', () => {
    const q = new Queue(['a', 'b', 'c'], 'cram');
    q.advance('again'); // a reinserted ~5 ahead
    const restored = Queue.restore(q.snapshot(), new Set(['a', 'b', 'c']))!;
    // a still appears later in the queue
    const ids: string[] = [];
    let guard = 0;
    while (!restored.done() && guard++ < 20) {
      ids.push(restored.current()!);
      restored.advance('good');
    }
    expect(ids).toContain('a');
  });
});
