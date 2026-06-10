import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { gradeAnswer } from '../core/grade.js';
import { Deck, RatingSchema } from '../core/schema.js';
import { isDue, nextDueLine, rate } from '../core/scheduler.js';
import {
  DeckState,
  loadDeck,
  loadIndex,
  loadState,
  saveState,
  touchLastStudied,
} from '../core/store.js';
import { Engine } from '../engines/types.js';
import { Bus } from './sse.js';

export interface ServerCtx {
  mode: 'generate' | 'review' | 'browse';
  deckId?: string;
  engine: Engine;
  bus: Bus;
}

function openSession(state: DeckState): DeckState['sessions'][number] {
  let s = state.sessions.at(-1);
  if (!s || s.endedAt) {
    s = { startedAt: new Date().toISOString(), endedAt: null, capstone: null, ratings: [] };
    state.sessions.push(s);
  }
  return s;
}

function withDeck(deckId: string): { deck: Deck; state: DeckState } | null {
  const deck = loadDeck(deckId);
  if (!deck) return null;
  return { deck, state: loadState(deck) };
}

export function createApi(ctx: ServerCtx): Hono {
  const api = new Hono();

  api.get('/boot', (c) => c.json({ mode: ctx.mode, deckId: ctx.deckId ?? null }));

  api.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      let open = true;
      const unsub = ctx.bus.subscribe((e) => {
        if (open) void stream.writeSSE({ data: JSON.stringify(e) });
      });
      stream.onAbort(() => {
        open = false;
        unsub();
      });
      // keep the connection alive until the client goes away
      while (open) await new Promise((r) => setTimeout(r, 15_000));
    }),
  );

  api.get('/decks', (c) =>
    c.json(
      loadIndex().map((e) => {
        const d = loadDeck(e.deckId);
        const st = d ? loadState(d) : null;
        const cards = st ? Object.values(st.cards) : [];
        return {
          deckId: e.deckId,
          title: e.title,
          source: d?.source.description ?? '',
          cards: d?.cards.length ?? 0,
          due: cards.filter((x) => isDue(x)).length,
          lastStudied: e.lastStudied,
        };
      }),
    ),
  );

  api.get('/decks/:id', (c) => {
    const found = withDeck(c.req.param('id'));
    return found ? c.json(found.deck) : c.json({ error: 'not found' }, 404);
  });

  api.get('/decks/:id/session', (c) => {
    const found = withDeck(c.req.param('id'));
    if (!found) return c.json({ error: 'not found' }, 404);
    const { deck, state } = found;
    const mode = c.req.query('mode') === 'review' ? 'review' : 'cram';
    const ids =
      mode === 'cram'
        ? deck.cards.map((card) => card.id)
        : deck.cards
            .filter((card) => {
              const st = state.cards[card.id];
              return st && isDue(st);
            })
            .sort(
              (a, b) =>
                new Date(state.cards[a.id]!.due).getTime() -
                new Date(state.cards[b.id]!.due).getTime(),
            )
            .map((card) => card.id);
    openSession(state);
    saveState(deck.id, state);
    return c.json({ mode, cardIds: ids });
  });

  api.post('/decks/:id/cards/:cardId/grade', async (c) => {
    const found = withDeck(c.req.param('id'));
    if (!found) return c.json({ error: 'not found' }, 404);
    const card = found.deck.cards.find((x) => x.id === c.req.param('cardId'));
    if (!card || (card.type !== 'explain' && card.type !== 'whatif'))
      return c.json({ error: 'not a gradeable card' }, 400);
    const { answer } = await c.req.json<{ answer: string }>();
    if (!answer?.trim()) return c.json({ error: 'empty answer' }, 400);
    try {
      const result = await gradeAnswer(ctx.engine, {
        cardPrompt: card.prompt,
        rubric: card.rubric,
        modelAnswer: card.modelAnswer,
        answer,
      });
      return c.json(result);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'grading failed' }, 502);
    }
  });

  api.post('/decks/:id/cards/:cardId/rate', async (c) => {
    const found = withDeck(c.req.param('id'));
    if (!found) return c.json({ error: 'not found' }, 404);
    const { deck, state } = found;
    const cardId = c.req.param('cardId');
    const st = state.cards[cardId];
    if (!st) return c.json({ error: 'unknown card' }, 404);
    const body = await c.req.json<{ rating: string }>();
    const rating = RatingSchema.safeParse(body.rating);
    if (!rating.success) return c.json({ error: 'bad rating' }, 400);
    const r = rate(st, rating.data);
    state.cards[cardId] = r.card;
    state.logs.push({ ...r.log, cardId });
    openSession(state).ratings.push({ cardId, rating: rating.data });
    saveState(deck.id, state);
    touchLastStudied(deck.id);
    return c.json({ due: r.card.due });
  });

  api.post('/decks/:id/capstone', async (c) => {
    const found = withDeck(c.req.param('id'));
    if (!found) return c.json({ error: 'not found' }, 404);
    const { deck, state } = found;
    const { answer } = await c.req.json<{ answer: string }>();
    if (!answer?.trim()) return c.json({ error: 'empty answer' }, 400);
    try {
      const result = await gradeAnswer(ctx.engine, {
        cardPrompt: deck.capstone.prompt,
        rubric: deck.capstone.rubric,
        modelAnswer: 'n/a — judge purely against the rubric criteria.',
        answer,
      });
      openSession(state).capstone = { answer, result };
      saveState(deck.id, state);
      return c.json(result);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'grading failed' }, 502);
    }
  });

  api.post('/decks/:id/session/end', (c) => {
    const found = withDeck(c.req.param('id'));
    if (!found) return c.json({ error: 'not found' }, 404);
    const { deck, state } = found;
    const session = openSession(state);
    session.endedAt = new Date().toISOString();
    saveState(deck.id, state);
    touchLastStudied(deck.id);

    const againCounts = new Map<string, number>();
    for (const r of session.ratings)
      if (r.rating === 'again') againCounts.set(r.cardId, (againCounts.get(r.cardId) ?? 0) + 1);
    const weak = [...againCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cardId, agains]) => {
        const card = deck.cards.find((x) => x.id === cardId);
        let label = cardId;
        if (card)
          label =
            card.type === 'qa'
              ? card.front
              : card.type === 'cloze'
                ? `cloze: ${card.context}`
                : card.type !== 'overview'
                  ? card.prompt
                  : cardId;
        return { cardId, agains, label, section: card?.section ?? '' };
      });

    const minutes = Math.max(
      1,
      Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60_000),
    );
    return c.json({
      cardsRated: new Set(session.ratings.map((r) => r.cardId)).size,
      minutes,
      capstone: session.capstone?.result ?? null,
      weak,
      nextDue: nextDueLine(Object.values(state.cards)),
      deckDir: deck.source.projectPath ? `.wdijd/${deck.id}/` : `~/.wdijd/decks/${deck.id}/`,
    });
  });

  return api;
}
