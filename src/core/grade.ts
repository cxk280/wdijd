import { Engine } from '../engines/types.js';
import { gradingPrompt } from './prompts.js';
import { GradeGenSchema, GradeResult, RatingName, Rubric, gradeGenJsonSchema } from './schema.js';

export function computeScore(rubric: Rubric, criteria: { id: string; met: boolean }[]): number {
  const met = new Map(criteria.map((c) => [c.id, c.met]));
  let total = 0;
  let earned = 0;
  for (const c of rubric.criteria) {
    total += c.weight;
    if (met.get(c.id)) earned += c.weight;
  }
  return total === 0 ? 0 : earned / total;
}

export function suggestedRating(score: number): RatingName {
  if (score < 0.35) return 'again';
  if (score < 0.65) return 'hard';
  if (score < 0.9) return 'good';
  return 'easy';
}

export async function gradeAnswer(
  engine: Engine,
  args: { cardPrompt: string; rubric: Rubric; modelAnswer: string; answer: string; cwd?: string },
): Promise<GradeResult> {
  const run = await engine.runStructured({
    instructions: gradingPrompt(args),
    schema: gradeGenJsonSchema,
    cwd: args.cwd ?? process.cwd(),
    maxTurns: 1,
    fast: true,
  });
  const parsed = GradeGenSchema.safeParse(run.output);
  if (!parsed.success) throw new Error('grading output did not match schema');
  // never trust model arithmetic — recompute from rubric weights
  const score = computeScore(args.rubric, parsed.data.criteria);
  return { ...parsed.data, score, suggestedRating: suggestedRating(score) };
}
