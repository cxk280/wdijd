import { Deck } from '../core/schema.js';
import { Engine } from '../engines/types.js';
import { GenerateOptions, SourceSpec } from '../ingest/types.js';

export interface ServeGenerateArgs {
  spec: SourceSpec;
  opts: GenerateOptions;
  engine: Engine;
  open: boolean;
  port?: number;
}

export interface ServeReviewArgs {
  deck: Deck;
  engine: Engine;
  open: boolean;
  port?: number;
}

/* Implemented in the server stage. */
export async function serveGenerate(_args: ServeGenerateArgs): Promise<void> {
  throw new Error('server not built yet — use --dry-run');
}

export async function serveReview(_args: ServeReviewArgs): Promise<void> {
  throw new Error('server not built yet');
}
