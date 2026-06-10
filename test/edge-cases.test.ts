import { mkdtempSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/web/markdown-render.js';
import { readCapped } from '../src/ingest/url.js';
import { imageSource } from '../src/ingest/files.js';
import { isLocalHost } from '../src/server/server.js';
import { DeckGen } from '../src/core/schema.js';
import { mintDeck, saveDeck } from '../src/core/store.js';
import { Engine } from '../src/engines/types.js';
import { createApi, ServerCtx } from '../src/server/routes.js';
import { Bus } from '../src/server/sse.js';

// EC-1 — XSS via LLM/ingested markdown rendered through dangerouslySetInnerHTML
describe('renderMarkdown (XSS)', () => {
  it('neutralizes raw HTML while keeping markdown', () => {
    const out = renderMarkdown('# Title\n\n<img src=x onerror=alert(1)>\n\n**bold**');
    expect(out).not.toContain('<img'); // no live tag — escaped to &lt;img
    expect(out).toContain('&lt;img');
    expect(out).toContain('<h1>');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('neutralizes inline script and event handlers', () => {
    const out = renderMarkdown('hi <script>steal()</script> there <a onclick="x">z</a>');
    expect(out).not.toContain('<script'); // escaped, not a live element
    expect(out).not.toContain('<a onclick');
    expect(out).toContain('&lt;script&gt;');
  });

  it('preserves blockquotes and code (not mistaken for HTML)', () => {
    const out = renderMarkdown('> quoted\n\n`code`');
    expect(out).toContain('<blockquote>');
    expect(out).toContain('<code>code</code>');
  });
});

// EC-2 — unbounded URL body read → OOM
describe('readCapped', () => {
  it('stops at the byte cap', async () => {
    const res = new Response('x'.repeat(10_000));
    expect((await readCapped(res, 100)).length).toBe(100);
  });
  it('returns the whole body when under the cap', async () => {
    const res = new Response('short');
    expect(await readCapped(res, 1000)).toBe('short');
  });
});

// EC-3 — unbounded attachment read → OOM / API reject
describe('attachment size cap', () => {
  it('rejects oversize images', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wdijd-att-'));
    const big = join(dir, 'huge.png');
    writeFileSync(big, '');
    truncateSync(big, 25 * 1024 * 1024); // sparse 25MB
    expect(() => imageSource(big)).toThrowError(/too large/);
  });
  it('accepts normal-size images', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wdijd-att-'));
    const small = join(dir, 'ok.png');
    writeFileSync(small, 'pngdata');
    expect(() => imageSource(small)).not.toThrow();
  });
});

// EC-4 — DNS-rebinding / non-local Host on the localhost server
describe('isLocalHost', () => {
  it('accepts localhost variants', () => {
    expect(isLocalHost('localhost:4577')).toBe(true);
    expect(isLocalHost('127.0.0.1:4577')).toBe(true);
    expect(isLocalHost('[::1]:4577')).toBe(true);
  });
  it('rejects remote hosts and missing header', () => {
    expect(isLocalHost('evil.example.com')).toBe(false);
    expect(isLocalHost('192.168.1.5:4577')).toBe(false);
    expect(isLocalHost(undefined)).toBe(false);
  });
});

// EC-5 — concurrent state writes → lost update
describe('per-deck write serialization', () => {
  const rubric = { criteria: [{ id: 'a', text: 'A', weight: 1 }] };
  const gen: DeckGen = {
    title: 'T',
    summary: 'S',
    capstone: { prompt: 'P', rubric },
    cards: [{ id: 'q1', type: 'qa', section: 's', order: 1, tags: [], sourceRefs: [], front: 'F', back: 'B' }],
  };
  const engine: Engine = { name: 'claude', supportsPdf: true, async runStructured() { return { output: {} }; } };
  let home: string;
  let api: ReturnType<typeof createApi>;
  let deckId: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'wdijd-conc-'));
    process.env.WDIJD_HOME = home;
    const deck = mintDeck(gen, { kind: 'git', description: 'd', projectPath: null }, 'claude');
    saveDeck(deck);
    deckId = deck.id;
    api = createApi({ mode: 'review', deckId, engine, bus: new Bus() });
  });
  afterEach(() => delete process.env.WDIJD_HOME);

  it('records every concurrent rating (no lost update)', async () => {
    const post = () =>
      api.request(`/decks/${deckId}/cards/q1/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating: 'good' }),
        headers: { 'content-type': 'application/json' },
      });
    const results = await Promise.all([post(), post(), post(), post(), post()]);
    expect(results.every((r) => r.status === 200)).toBe(true);

    const stateRaw = (await (await api.request(`/decks/${deckId}/session/end`, { method: 'POST' })).json()) as {
      cardsRated: number;
    };
    expect(stateRaw.cardsRated).toBe(1); // one distinct card
    // 5 ratings all persisted → 5 review logs
    const { loadState, loadDeck } = await import('../src/core/store.js');
    const logs = loadState(loadDeck(deckId)!).logs;
    expect(logs.length).toBe(5);
  });
});
