import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeckGen } from '../src/core/schema.js';
import {
  deckDirFor,
  latestDeck,
  loadDeck,
  loadIndex,
  loadState,
  mintDeck,
  saveDeck,
  saveState,
} from '../src/core/store.js';
import { rate } from '../src/core/scheduler.js';

const rubric = { criteria: [{ id: 'a', text: 'A', weight: 2 }] };
const gen: DeckGen = {
  title: 'Auth rotation',
  summary: 'Sum.',
  capstone: { prompt: 'Explain it all', rubric },
  cards: [
    { id: 'ov', type: 'overview', section: 'why', order: 0, tags: [], sourceRefs: [], markdown: 'm', mermaid: 'flowchart TD\nA-->B' },
    { id: 'q1', type: 'qa', section: 'how', order: 1, tags: ['auth'], sourceRefs: ['src/a.ts:1'], front: 'F?', back: 'B.' },
    { id: 'cl1', type: 'cloze', section: 'how', order: 2, tags: [], sourceRefs: [], language: 'ts', code: 'if ({{c1::x}}) y()', context: 'guard' },
  ],
};

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'wdijd-home-'));
  process.env.WDIJD_HOME = home;
});
afterEach(() => {
  delete process.env.WDIJD_HOME;
});

describe('store', () => {
  it('saves repo decks in-repo and indexes them', () => {
    const repo = mkdtempSync(join(tmpdir(), 'wdijd-repo-'));
    const deck = mintDeck(gen, { kind: 'git', description: 'd', projectPath: repo }, 'claude');
    const dir = saveDeck(deck);
    expect(dir).toBe(join(repo, '.wdijd', deck.id));
    expect(existsSync(join(dir, 'deck.json'))).toBe(true);
    expect(existsSync(join(dir, 'deck.md'))).toBe(true);
    expect(loadIndex()[0]!.deckId).toBe(deck.id);
    expect(loadDeck(deck.id)!.title).toBe('Auth rotation');
  });

  it('saves non-repo decks under the wdijd home', () => {
    const deck = mintDeck(gen, { kind: 'pdf', description: 'p.pdf', projectPath: null }, 'codex');
    expect(deckDirFor(deck)).toBe(join(home, 'decks', deck.id));
  });

  it('renders deck.md with unmasked cloze code and rubric weights', () => {
    const deck = mintDeck(gen, { kind: 'git', description: 'd', projectPath: null }, 'claude');
    const dir = saveDeck(deck);
    const md = readFileSync(join(dir, 'deck.md'), 'utf8');
    expect(md).toContain('if (x) y()'); // cloze markers stripped
    expect(md).not.toContain('{{c1::');
    expect(md).toContain('- (2) A'); // capstone rubric weight
    expect(md).toContain('```mermaid');
  });

  it('state: creates FSRS entries for rateable cards only, persists ratings', () => {
    const deck = mintDeck(gen, { kind: 'git', description: 'd', projectPath: null }, 'claude');
    saveDeck(deck);
    const now = new Date('2026-06-10T12:00:00Z');
    const state = loadState(deck, now);
    expect(Object.keys(state.cards).sort()).toEqual(['cl1', 'q1']); // no overview
    const r = rate(state.cards.q1!, 'good', now);
    state.cards.q1 = r.card;
    state.logs.push({ ...r.log, cardId: 'q1' });
    saveState(deck.id, state);
    const re = loadState(deck, now);
    expect(re.cards.q1!.due).toBeInstanceOf(Date);
    expect(re.logs).toHaveLength(1);
  });

  it('latestDeck prefers the cwd project', () => {
    const deckA = mintDeck(gen, { kind: 'pdf', description: 'a', projectPath: null }, 'claude');
    saveDeck(deckA);
    expect(latestDeck()!.deckId).toBe(deckA.id);
  });
});
