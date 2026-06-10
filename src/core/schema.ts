import { z } from 'zod';

// ── Rubrics ──────────────────────────────────────────────────────────────────

export const RubricSchema = z.object({
  criteria: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        weight: z.number(), // 1-3
      }),
    )
    .min(1),
});
export type Rubric = z.infer<typeof RubricSchema>;

// ── Cards ────────────────────────────────────────────────────────────────────

const cardBase = {
  id: z.string(),
  section: z.string(),
  order: z.number(),
  tags: z.array(z.string()),
  sourceRefs: z.array(z.string()), // "src/auth.ts:42-60", "commit abc123"
};

export const CardSchema = z.discriminatedUnion('type', [
  z.object({
    ...cardBase,
    type: z.literal('overview'),
    markdown: z.string(),
    mermaid: z.string().nullable(),
  }),
  z.object({
    ...cardBase,
    type: z.literal('qa'),
    front: z.string(),
    back: z.string(),
  }),
  z.object({
    ...cardBase,
    type: z.literal('cloze'),
    language: z.string(),
    code: z.string(), // contains {{c1::masked}} markers
    context: z.string(),
  }),
  z.object({
    ...cardBase,
    type: z.literal('explain'),
    prompt: z.string(),
    rubric: RubricSchema,
    modelAnswer: z.string(),
  }),
  z.object({
    ...cardBase,
    type: z.literal('whatif'),
    prompt: z.string(),
    rubric: RubricSchema,
    modelAnswer: z.string(),
  }),
]);
export type Card = z.infer<typeof CardSchema>;
export type CardType = Card['type'];

// ── Decks ────────────────────────────────────────────────────────────────────

/** What the LLM returns (flat, no recursion — structured-output friendly). */
export const DeckGenSchema = z.object({
  title: z.string(),
  summary: z.string(), // advance organizer markdown
  capstone: z.object({ prompt: z.string(), rubric: RubricSchema }),
  cards: z.array(CardSchema).min(1),
});
export type DeckGen = z.infer<typeof DeckGenSchema>;

/** What we persist. Immutable after generation. */
export const DeckSchema = DeckGenSchema.extend({
  version: z.literal(1),
  id: z.string(),
  createdAt: z.string(),
  engine: z.enum(['claude', 'codex']),
  source: z.object({
    kind: z.string(),
    description: z.string(),
    projectPath: z.string().nullable(),
  }),
});
export type Deck = z.infer<typeof DeckSchema>;

// ── Grading ──────────────────────────────────────────────────────────────────

/** What the grading LLM returns. Score/rating are computed server-side. */
export const GradeGenSchema = z.object({
  criteria: z
    .array(z.object({ id: z.string(), met: z.boolean(), note: z.string() }))
    .min(1),
  feedback: z.string(), // ≤2 sentences, terse
});
export type GradeGen = z.infer<typeof GradeGenSchema>;

export const RatingSchema = z.enum(['again', 'hard', 'good', 'easy']);
export type RatingName = z.infer<typeof RatingSchema>;

export interface GradeResult extends GradeGen {
  score: number; // weighted 0..1, recomputed from criteria — never trusted from the model
  suggestedRating: RatingName;
}

// ── JSON Schemas for engine structured output ────────────────────────────────

export const deckGenJsonSchema = z.toJSONSchema(DeckGenSchema);
export const gradeGenJsonSchema = z.toJSONSchema(GradeGenSchema);

// ── Salvage ──────────────────────────────────────────────────────────────────

/**
 * Best-effort recovery of a partially valid generation: keeps every card that
 * validates on its own, drops the rest. Returns null if the non-card shell
 * (title/summary/capstone) is unusable or no cards survive.
 */
export function salvageDeckGen(raw: unknown): { deck: DeckGen; dropped: number } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const shell = DeckGenSchema.omit({ cards: true }).safeParse(o);
  if (!shell.success || !Array.isArray(o.cards)) return null;
  const cards: Card[] = [];
  let dropped = 0;
  for (const c of o.cards) {
    const r = CardSchema.safeParse(c);
    if (r.success) cards.push(r.data);
    else dropped++;
  }
  if (cards.length === 0) return null;
  return { deck: { ...shell.data, cards }, dropped };
}
