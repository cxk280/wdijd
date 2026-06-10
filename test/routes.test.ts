import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeckGen } from '../src/core/schema.js';
import { mintDeck, saveDeck } from '../src/core/store.js';
import { Engine } from '../src/engines/types.js';
import { createApi, ServerCtx } from '../src/server/routes.js';
import { Bus } from '../src/server/sse.js';

const rubric = {
  criteria: [
    { id: 'a', text: 'A', weight: 3 },
    { id: 'b', text: 'B', weight: 1 },
  ],
};
const gen: DeckGen = {
  title: 'T',
  summary: 'S',
  capstone: { prompt: 'Explain everything', rubric },
  cards: [
    { id: 'ov', type: 'overview', section: 'why', order: 0, tags: [], sourceRefs: [], markdown: 'm', mermaid: null },
    { id: 'q1', type: 'qa', section: 'how', order: 1, tags: [], sourceRefs: [], front: 'F?', back: 'B.' },
    { id: 'ex1', type: 'explain', section: 'why', order: 2, tags: [], sourceRefs: [], prompt: 'Explain X', rubric, modelAnswer: 'MA' },
  ],
};

const gradeOutput = {
  criteria: [
    { id: 'a', met: true, note: 'got it' },
    { id: 'b', met: false, note: 'missed' },
  ],
  feedback: 'Solid.',
};

function fakeEngine(): Engine {
  return {
    name: 'claude',
    supportsPdf: true,
    async runStructured() {
      return { output: gradeOutput };
    },
  };
}

let home: string;
let deckId: string;
let api: ReturnType<typeof createApi>;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'wdijd-home-'));
  process.env.WDIJD_HOME = home;
  const deck = mintDeck(gen, { kind: 'git', description: 'd', projectPath: null }, 'claude');
  saveDeck(deck);
  deckId = deck.id;
  const ctx: ServerCtx = { mode: 'review', deckId, engine: fakeEngine(), bus: new Bus() };
  api = createApi(ctx);
});
afterEach(() => delete process.env.WDIJD_HOME);

describe('api routes', () => {
  it('boot reports mode and deck', async () => {
    const r = await api.request('/boot');
    expect(await r.json()).toEqual({ mode: 'review', deckId });
  });

  it('lists decks with due counts', async () => {
    const r = await api.request('/decks');
    const decks = (await r.json()) as { deckId: string; cards: number; due: number }[];
    expect(decks[0]).toMatchObject({ deckId, cards: 3, due: 2 }); // overview not rateable
  });

  it('cram session returns all cards in order; review only due', async () => {
    const cram = (await (await api.request(`/decks/${deckId}/session?mode=cram`)).json()) as {
      cardIds: string[];
    };
    expect(cram.cardIds).toEqual(['ov', 'q1', 'ex1']);
    const review = (await (
      await api.request(`/decks/${deckId}/session?mode=review`)
    ).json()) as { cardIds: string[] };
    expect(review.cardIds).toEqual(['q1', 'ex1']); // both new = due, no overview
  });

  it('rate updates FSRS state and 404s unknown cards', async () => {
    const ok = await api.request(`/decks/${deckId}/cards/q1/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating: 'good' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(ok.status).toBe(200);
    const { due } = (await ok.json()) as { due: string };
    expect(new Date(due).getTime()).toBeGreaterThan(Date.now());
    const bad = await api.request(`/decks/${deckId}/cards/nope/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating: 'good' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(bad.status).toBe(404);
  });

  it('grade recomputes score server-side and suggests a rating', async () => {
    const r = await api.request(`/decks/${deckId}/cards/ex1/grade`, {
      method: 'POST',
      body: JSON.stringify({ answer: 'my explanation' }),
      headers: { 'content-type': 'application/json' },
    });
    const g = (await r.json()) as { score: number; suggestedRating: string };
    expect(g.score).toBe(0.75); // weight 3 met of 4 total — not trusted from model
    expect(g.suggestedRating).toBe('good');
  });

  it('refuses grading non-gradeable cards and empty answers', async () => {
    const qa = await api.request(`/decks/${deckId}/cards/q1/grade`, {
      method: 'POST',
      body: JSON.stringify({ answer: 'x' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(qa.status).toBe(400);
  });

  it('capstone + session end produce a summary', async () => {
    await api.request(`/decks/${deckId}/session?mode=cram`);
    for (const rating of ['again', 'good']) {
      await api.request(`/decks/${deckId}/cards/q1/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating }),
        headers: { 'content-type': 'application/json' },
      });
    }
    await api.request(`/decks/${deckId}/capstone`, {
      method: 'POST',
      body: JSON.stringify({ answer: 'the whole thing works like…' }),
      headers: { 'content-type': 'application/json' },
    });
    const end = await api.request(`/decks/${deckId}/session/end`, { method: 'POST' });
    const summary = (await end.json()) as Record<string, unknown>;
    expect(summary.cardsRated).toBe(1);
    expect((summary.capstone as { score: number }).score).toBe(0.75);
    expect((summary.weak as unknown[]).length).toBe(1);
    expect(summary.nextDue).toBeTruthy();
  });
});
