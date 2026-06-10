import { GenerateOptions, SourceSpec } from '../ingest/types.js';
import { Engine } from '../engines/types.js';
import { generationPrompt } from './prompts.js';
import { DeckGen, DeckGenSchema, deckGenJsonSchema, salvageDeckGen } from './schema.js';

export interface GenerateOutcome {
  deck: DeckGen;
  dropped: number;
  costUsd?: number;
  warnings: string[];
}

function sortDeck(deck: DeckGen): DeckGen {
  const cards = [...deck.cards].sort((a, b) => {
    if (a.type === 'overview' && b.type !== 'overview') return -1;
    if (b.type === 'overview' && a.type !== 'overview') return 1;
    return a.order - b.order;
  });
  return { ...deck, cards };
}

function repairPrompt(raw: unknown, errors: string): string {
  return `Your previous flashcard-deck JSON failed validation. Fix ONLY the validation problems and return the full corrected deck as JSON matching the schema. Do not add or remove valid cards.

# Validation errors
${errors.slice(0, 4000)}

# Your previous output
${JSON.stringify(raw).slice(0, 60_000)}`;
}

export async function generateDeck(
  engine: Engine,
  spec: SourceSpec,
  opts: GenerateOptions,
  onProgress?: (line: string) => void,
): Promise<GenerateOutcome> {
  const run = await engine.runStructured({
    instructions: generationPrompt(spec, opts),
    schema: deckGenJsonSchema,
    cwd: spec.cwd,
    needsRepoTools: spec.needsRepoTools,
    needsGitTools: spec.needsGitTools,
    images: spec.images,
    pdfs: spec.pdfs,
    maxTurns: 25,
    onProgress,
  });

  let parsed = DeckGenSchema.safeParse(run.output);
  if (parsed.success)
    return { deck: sortDeck(parsed.data), dropped: 0, costUsd: run.costUsd, warnings: [] };

  onProgress?.('output failed validation — repairing');
  let repairOutput: unknown;
  try {
    const repair = await engine.runStructured({
      instructions: repairPrompt(run.output, parsed.error.message),
      schema: deckGenJsonSchema,
      cwd: spec.cwd,
      // ≥2 turns needed to emit StructuredOutput + finalize (maxTurns:1 errors out)
      maxTurns: 4,
      fast: true,
    });
    repairOutput = repair.output;
    parsed = DeckGenSchema.safeParse(repairOutput);
    if (parsed.success)
      return {
        deck: sortDeck(parsed.data),
        dropped: 0,
        costUsd: run.costUsd,
        warnings: ['needed one repair pass'],
      };
  } catch {
    /* fall through to salvage */
  }

  const salvaged = salvageDeckGen(run.output) ?? salvageDeckGen(repairOutput);
  if (salvaged)
    return {
      deck: sortDeck(salvaged.deck),
      dropped: salvaged.dropped,
      costUsd: run.costUsd,
      warnings: [`dropped ${salvaged.dropped} invalid cards`],
    };

  throw new Error('generation failed: output did not match the deck schema after repair');
}
