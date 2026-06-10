import type { QueueSnapshot } from './session';

/**
 * Cram progress is held in-memory in the SPA, so a mid-session refresh would
 * restart from the overview. We snapshot the queue to localStorage (keyed by
 * deckId — which embeds a content hash, so a regenerated deck won't restore
 * stale state) and resume the within-sitting position. FSRS ratings already
 * persist server-side; this only restores where you were.
 */
const KEY = (deckId: string) => `wdijd:cram:${deckId}`;

export function saveCramProgress(deckId: string, snapshot: QueueSnapshot): void {
  try {
    localStorage.setItem(KEY(deckId), JSON.stringify(snapshot));
  } catch {
    /* storage unavailable / full — resume is best-effort */
  }
}

export function loadCramProgress(deckId: string): QueueSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY(deckId));
    if (!raw) return null;
    const s = JSON.parse(raw) as QueueSnapshot;
    if (!Array.isArray(s.items) || typeof s.pos !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}

export function clearCramProgress(deckId: string): void {
  try {
    localStorage.removeItem(KEY(deckId));
  } catch {
    /* ignore */
  }
}
