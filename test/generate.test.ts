import { describe, expect, it } from 'vitest';
import { generateDeck } from '../src/core/generate.js';
import { computeScore, suggestedRating } from '../src/core/grade.js';
import { Engine, EngineResult, EngineRunOpts } from '../src/engines/types.js';

const rubric = {
  criteria: [
    { id: 'a', text: 'A', weight: 3 },
    { id: 'b', text: 'B', weight: 1 },
  ],
};

const goodDeck = {
  title: 'T',
  summary: 'S',
  capstone: { prompt: 'P', rubric },
  cards: [
    { id: 'q2', type: 'qa', section: 's', order: 2, tags: [], sourceRefs: [], front: 'f', back: 'b' },
    { id: 'ov', type: 'overview', section: 's', order: 9, tags: [], sourceRefs: [], markdown: 'm', mermaid: null },
  ],
};

function fakeEngine(outputs: unknown[]): Engine & { calls: EngineRunOpts[] } {
  const calls: EngineRunOpts[] = [];
  return {
    name: 'claude',
    supportsPdf: true,
    calls,
    async runStructured(opts: EngineRunOpts): Promise<EngineResult> {
      calls.push(opts);
      return { output: outputs[Math.min(calls.length - 1, outputs.length - 1)], costUsd: 0.1 };
    },
  };
}

const spec = {
  kind: 'git' as const,
  title: 't',
  description: 'd',
  promptContext: 'ctx',
  needsRepoTools: true,
  needsGitTools: false,
  cwd: '/tmp',
  projectPath: null,
};
const opts = { depth: 'standard' as const, level: 5 };

describe('generateDeck', () => {
  it('returns a sorted valid deck first try', async () => {
    const e = fakeEngine([goodDeck]);
    const out = await generateDeck(e, spec, opts);
    expect(out.deck.cards[0]!.type).toBe('overview'); // overview forced first
    expect(out.warnings).toEqual([]);
    expect(e.calls).toHaveLength(1);
  });

  it('repairs invalid output on the second call', async () => {
    const e = fakeEngine([{ junk: true }, goodDeck]);
    const out = await generateDeck(e, spec, opts);
    expect(out.warnings).toEqual(['needed one repair pass']);
    expect(e.calls).toHaveLength(2);
    expect(e.calls[1]!.fast).toBe(true);
    expect(e.calls[1]!.maxTurns).toBeGreaterThan(1);
  });

  it('salvages valid cards when repair also fails', async () => {
    const broken = { ...goodDeck, cards: [...goodDeck.cards, { id: 'bad' }] };
    const e = fakeEngine([broken, { junk: true }]);
    const out = await generateDeck(e, spec, opts);
    expect(out.dropped).toBe(1);
    expect(out.deck.cards).toHaveLength(2);
  });

  it('throws when nothing is salvageable', async () => {
    const e = fakeEngine([{ junk: true }]);
    await expect(generateDeck(e, spec, opts)).rejects.toThrow(/did not match/);
  });

  it('repair pass uses >1 turn (StructuredOutput needs ≥2)', async () => {
    const e = fakeEngine([{ junk: true }, goodDeck]);
    await generateDeck(e, spec, opts);
    expect(e.calls[1]!.maxTurns ?? 0).toBeGreaterThan(1);
  });

  it('passes altitude level into the prompt', async () => {
    const e = fakeEngine([goodDeck]);
    await generateDeck(e, spec, { depth: 'quick', level: 1 });
    expect(e.calls[0]!.instructions).toContain('ALTITUDE 1/10 — ecosystem level');
    const e2 = fakeEngine([goodDeck]);
    await generateDeck(e2, spec, { depth: 'deep', level: 10 });
    expect(e2.calls[0]!.instructions).toContain('ALTITUDE 10/10 — line level');
  });
});

describe('grading math', () => {
  it('computes weighted score, ignoring unknown criterion ids', () => {
    const s = computeScore(rubric, [
      { id: 'a', met: true },
      { id: 'b', met: false },
      { id: 'zzz', met: true },
    ]);
    expect(s).toBe(0.75);
  });

  it('maps score thresholds to ratings', () => {
    expect(suggestedRating(0.2)).toBe('again');
    expect(suggestedRating(0.5)).toBe('hard');
    expect(suggestedRating(0.75)).toBe('good');
    expect(suggestedRating(0.95)).toBe('easy');
  });
});
