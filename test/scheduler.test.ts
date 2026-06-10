import { describe, expect, it } from 'vitest';
import { isDue, newCardState, nextDueLine, rate, reviveCard } from '../src/core/scheduler.js';

describe('scheduler', () => {
  it('new cards are due immediately', () => {
    const now = new Date('2026-06-10T12:00:00Z');
    expect(isDue(newCardState(now), now)).toBe(true);
  });

  it('good rating pushes due date forward; again keeps it close', () => {
    const now = new Date('2026-06-10T12:00:00Z');
    const base = newCardState(now);
    const good = rate(base, 'good', now);
    const again = rate(base, 'again', now);
    expect(new Date(good.card.due).getTime()).toBeGreaterThan(now.getTime());
    expect(new Date(again.card.due).getTime()).toBeLessThan(new Date(good.card.due).getTime());
    expect(good.log.rating).toBe(3);
  });

  it('repeated good ratings grow the interval', () => {
    const t0 = new Date('2026-06-10T12:00:00Z');
    let c = newCardState(t0);
    c = rate(c, 'good', t0).card;
    const firstDue = new Date(c.due);
    const t1 = new Date(firstDue.getTime() + 1000);
    c = rate(c, 'good', t1).card;
    expect(new Date(c.due).getTime() - t1.getTime()).toBeGreaterThan(
      firstDue.getTime() - t0.getTime(),
    );
  });

  it('survives a JSON round-trip via reviveCard', () => {
    const now = new Date('2026-06-10T12:00:00Z');
    const c = rate(newCardState(now), 'good', now).card;
    const revived = reviveCard(JSON.parse(JSON.stringify(c)));
    expect(revived.due).toBeInstanceOf(Date);
    expect(revived.due.getTime()).toBe(new Date(c.due).getTime());
    expect(isDue(revived, new Date(revived.due.getTime() + 1))).toBe(true);
  });

  it('nextDueLine summarizes the horizon tersely', () => {
    const now = new Date('2026-06-10T12:00:00Z');
    const due = newCardState(now);
    expect(nextDueLine([due], now)).toBe('1 due now');
    const later = rate(due, 'easy', now).card;
    expect(nextDueLine([later], now)).toMatch(/^\d+ cards? in \d+d$/);
    expect(nextDueLine([], now)).toBe('nothing scheduled');
  });
});
