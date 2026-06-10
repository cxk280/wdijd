import { Command } from 'commander';
import { GenerateOptions, Depth } from '../ingest/types.js';
import { sourceFromTarget } from '../ingest/index.js';
import { detectEngine } from '../engines/detect.js';
import { EngineError, EngineName } from '../engines/types.js';
import { latestDeck, loadDeck, loadIndex, loadState } from '../core/store.js';
import { isDue, nextDueLine } from '../core/scheduler.js';
import { Target, TargetError, flagTarget, sniffTarget, smartDetect } from './target.js';
import { runWizard } from './wizard.js';

const program = new Command();

function die(msg: string, hint?: string): never {
  console.error(`wdijd: ${msg}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function parsePort(p: string | undefined): number | undefined {
  if (p === undefined) return undefined;
  if (!/^\d+$/.test(p) || Number(p) < 1 || Number(p) > 65535) die('--port must be 1-65535');
  return Number(p);
}

interface CliFlags {
  n?: string;
  vs?: string;
  repo?: boolean;
  focus?: string;
  depth?: Depth;
  level?: string;
  engine?: EngineName;
  open: boolean;
  port?: string;
  dryRun?: boolean;
}

async function generate(targetArg: string | undefined, flags: CliFlags): Promise<void> {
  const cwd = process.cwd();
  let target: Target;
  let opts: GenerateOptions;

  try {
    const hasTargetFlags =
      targetArg !== undefined || flags.n !== undefined || flags.vs !== undefined || !!flags.repo;
    const pre = {
      focus: flags.focus,
      depth: flags.depth,
      level: flags.level !== undefined ? Number(flags.level) : undefined,
    };
    if (pre.level !== undefined && (!Number.isInteger(pre.level) || pre.level < 1 || pre.level > 10))
      die('--level must be an integer from 1 to 10');
    if (flags.n !== undefined && !/^\d+$/.test(flags.n)) die('-n must be a positive integer');
    if (flags.n !== undefined && Number(flags.n) < 1) die('-n must be at least 1');

    if (hasTargetFlags) {
      target = targetArg
        ? sniffTarget(targetArg, cwd)
        : flagTarget(cwd, { n: flags.n ? Number(flags.n) : undefined, vs: flags.vs, repo: flags.repo });
      opts = { depth: pre.depth ?? 'standard', level: pre.level ?? 5, focus: pre.focus };
    } else if (process.stdin.isTTY && !flags.dryRun) {
      const w = await runWizard(cwd, pre);
      target = w.target;
      opts = { depth: w.depth, level: w.level, focus: w.focus };
    } else {
      target = smartDetect(cwd);
      opts = { depth: pre.depth ?? 'standard', level: pre.level ?? 5, focus: pre.focus };
    }
  } catch (e) {
    if (e instanceof TargetError) die(e.message);
    throw e;
  }

  const spec = await sourceFromTarget(target);
  let engine;
  try {
    engine = detectEngine(flags.engine);
  } catch (e) {
    if (e instanceof EngineError) die(e.message, e.hint);
    throw e;
  }

  console.log(`digesting: ${spec.description} — ${engine.name}`);

  if (flags.dryRun) {
    console.log(`  depth ${opts.depth} · level ${opts.level}${opts.focus ? ` · focus: ${opts.focus}` : ''}`);
    console.log(`  context: ${spec.promptContext.length} chars · tools repo=${spec.needsRepoTools} git=${spec.needsGitTools}`);
    return;
  }

  const { serveGenerate } = await import('../server/server.js');
  await serveGenerate({
    spec,
    opts,
    engine,
    open: flags.open,
    port: parsePort(flags.port),
  });
}

program
  .name('wdijd')
  .description('What Did I Just Do? — flashcards for understanding AI-written work')
  .version('0.1.0');

program
  .command('gen', { isDefault: true, hidden: true })
  .argument('[target]', 'path, URL, commit, or range (omit for the wizard)')
  .option('-n <count>', 'digest the last N commits')
  .option('--vs <ref>', 'digest the diff vs a ref')
  .option('--repo', 'digest the whole repo')
  .option('-m, --focus <text>', 'what to focus on')
  .option('--depth <depth>', 'quick | standard | deep')
  .option('--level <1-10>', 'altitude: 1 = big picture, 10 = individual lines')
  .option('--engine <name>', 'claude | codex (default: auto-detect)')
  .option('--no-open', "don't open the browser")
  .option('--port <port>', 'server port (default: first free from 4577)')
  .option('--dry-run', 'resolve the target and print what would be digested')
  .action(generate);

program
  .command('review')
  .argument('[deckId]', 'deck to review (default: latest for this repo)')
  .option('--engine <name>', 'claude | codex (default: auto-detect)')
  .option('--no-open', "don't open the browser")
  .option('--port <port>', 'server port')
  .action(async (deckId: string | undefined, flags: CliFlags) => {
    const entry = deckId ? loadIndex().find((e) => e.deckId === deckId) : latestDeck(process.cwd());
    if (!entry) die(deckId ? `no deck "${deckId}"` : 'no decks yet — run `npx wdijd` first');
    const deck = loadDeck(entry.deckId);
    if (!deck) die(`deck "${entry.deckId}" is missing or corrupt (looked in ${entry.deckDir})`);

    const state = loadState(deck);
    const fsrsCards = Object.values(state.cards);
    const due = fsrsCards.filter((c) => isDue(c)).length;
    if (due === 0) {
      console.log(`0 due · next: ${nextDueLine(fsrsCards)}`);
      return;
    }

    let engine;
    try {
      engine = detectEngine(flags.engine);
    } catch (e) {
      if (e instanceof EngineError) die(e.message, e.hint);
      throw e;
    }
    const { serveReview } = await import('../server/server.js');
    await serveReview({
      deck,
      engine,
      open: flags.open,
      port: parsePort(flags.port),
    });
  });

program
  .command('ls')
  .description('list decks')
  .action(() => {
    const index = loadIndex();
    if (index.length === 0) {
      console.log('no decks yet — run `npx wdijd` in a repo');
      return;
    }
    for (const e of index) {
      const deck = loadDeck(e.deckId);
      const cards = deck ? deck.cards.length : 0;
      const state = deck ? loadState(deck) : null;
      const due = state ? Object.values(state.cards).filter((c) => isDue(c)).length : 0;
      const studied = e.lastStudied ? e.lastStudied.slice(0, 10) : 'never';
      console.log(
        `${e.deckId.padEnd(44)} ${String(cards).padStart(3)} cards ${String(due).padStart(3)} due  ${studied}  ${e.title}`,
      );
    }
  });

program.parseAsync().catch((e: unknown) => {
  if (e instanceof EngineError) die(e.message, e.hint);
  die(e instanceof Error ? e.message : String(e));
});
