import { describe, expect, it } from 'vitest';
import { gradeAnswer } from '../src/core/grade.js';
import { Engine, EngineRunOpts } from '../src/engines/types.js';

const rubric = {
  criteria: [
    { id: 'a', text: 'A', weight: 3 },
    { id: 'b', text: 'B', weight: 1 },
  ],
};

function fakeEngine(): Engine & { calls: EngineRunOpts[] } {
  const calls: EngineRunOpts[] = [];
  return {
    name: 'claude',
    supportsPdf: true,
    calls,
    async runStructured(opts) {
      calls.push(opts);
      return {
        output: {
          criteria: [
            { id: 'a', met: true, note: 'got it' },
            { id: 'b', met: false, note: 'missed' },
          ],
          feedback: 'ok',
        },
      };
    },
  };
}

describe('gradeAnswer', () => {
  it('uses >1 turn so StructuredOutput can finalize (regression: maxTurns:1 → error_max_turns)', async () => {
    const e = fakeEngine();
    await gradeAnswer(e, { cardPrompt: 'p', rubric, modelAnswer: 'm', answer: 'a' });
    expect(e.calls[0]!.maxTurns ?? 0).toBeGreaterThan(1);
    expect(e.calls[0]!.fast).toBe(true);
  });

  it('recomputes the score server-side from rubric weights', async () => {
    const e = fakeEngine();
    const r = await gradeAnswer(e, { cardPrompt: 'p', rubric, modelAnswer: 'm', answer: 'a' });
    expect(r.score).toBe(0.75);
    expect(r.suggestedRating).toBe('good');
  });
});
