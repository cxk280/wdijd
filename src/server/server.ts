import { serve, type ServerType } from '@hono/node-server';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import open from 'open';
import { generateDeck } from '../core/generate.js';
import { Deck } from '../core/schema.js';
import { mintDeck, saveDeck } from '../core/store.js';
import { Engine, EngineError } from '../engines/types.js';
import { GenerateOptions, SourceSpec } from '../ingest/types.js';
import { createApi, ServerCtx } from './routes.js';
import { Bus } from './sse.js';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** dist/web, resolved relative to the built dist/cli.js — works installed via npx. */
function webDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'web');
}

function buildApp(ctx: ServerCtx): Hono {
  const app = new Hono();
  app.route('/api', createApi(ctx));
  app.get('*', async (c) => {
    const root = webDir();
    let path = normalize(c.req.path).replace(/^\/+/, '');
    if (!path || path === '.') path = 'index.html';
    let file = join(root, path);
    if (!file.startsWith(root)) return c.text('nope', 403);
    let body: Buffer;
    try {
      body = await readFile(file);
    } catch {
      file = join(root, 'index.html'); // SPA fallback
      body = await readFile(file);
    }
    return c.body(new Uint8Array(body), 200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
  });
  return app;
}

function listen(app: Hono, preferred?: number): Promise<{ server: ServerType; port: number }> {
  const candidates = preferred ? [preferred] : Array.from({ length: 24 }, (_, i) => 4577 + i);
  return new Promise((resolve, reject) => {
    const tryNext = (i: number) => {
      if (i >= candidates.length) return reject(new Error('no free port'));
      const port = candidates[i]!;
      const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () =>
        resolve({ server, port }),
      );
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') tryNext(i + 1);
        else reject(err);
      });
    };
    tryNext(0);
  });
}

async function launch(ctx: ServerCtx, openBrowser: boolean, port?: number): Promise<void> {
  const { port: boundPort } = await listen(buildApp(ctx), port);
  const url = `http://127.0.0.1:${boundPort}`;
  console.log(url);
  if (openBrowser) await open(url);
  // the server owns the process from here; ctrl-c ends the session
}

export interface ServeGenerateArgs {
  spec: SourceSpec;
  opts: GenerateOptions;
  engine: Engine;
  open: boolean;
  port?: number;
}

export async function serveGenerate(args: ServeGenerateArgs): Promise<void> {
  const bus = new Bus();
  const ctx: ServerCtx = { mode: 'generate', engine: args.engine, bus };
  await launch(ctx, args.open, args.port);

  try {
    const out = await generateDeck(args.engine, args.spec, args.opts, (line) =>
      bus.emit({ type: 'progress', line }),
    );
    const deck = mintDeck(
      out.deck,
      {
        kind: args.spec.kind,
        description: args.spec.description,
        projectPath: args.spec.projectPath,
      },
      args.engine.name,
    );
    const dir = saveDeck(deck);
    ctx.deckId = deck.id;
    ctx.mode = 'review';
    const cost = out.costUsd !== undefined ? ` · $${out.costUsd.toFixed(2)}` : '';
    console.log(`✓ ${deck.cards.length} cards${cost} → ${dir}`);
    for (const w of out.warnings) console.log(`  ⚠ ${w}`);
    bus.emit({ type: 'deck', deckId: deck.id, warnings: out.warnings, costUsd: out.costUsd });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const hint = e instanceof EngineError ? e.hint : undefined;
    console.error(`wdijd: ${message}`);
    if (hint) console.error(`  ${hint}`);
    bus.emit({ type: 'error', message, hint });
  }
}

export interface ServeReviewArgs {
  deck: Deck;
  engine: Engine;
  open: boolean;
  port?: number;
}

export async function serveReview(args: ServeReviewArgs): Promise<void> {
  const bus = new Bus();
  const ctx: ServerCtx = {
    mode: 'review',
    deckId: args.deck.id,
    engine: args.engine,
    bus,
  };
  await launch(ctx, args.open, args.port);
}
