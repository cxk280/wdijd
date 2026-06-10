import * as p from '@clack/prompts';
import { Depth } from '../ingest/types.js';
import { Target, TargetError, flagTarget, smartDetect, sniffTarget } from './target.js';
import { defaultBranch, git, gitRoot } from '../ingest/git-cmd.js';

export interface WizardResult {
  target: Target;
  focus?: string;
  depth: Depth;
  level: number;
}

function bail(): never {
  p.cancel('cancelled');
  process.exit(1);
}

function val<T>(v: T | symbol): T {
  if (p.isCancel(v)) bail();
  return v as T;
}

const LEVELS: { value: number; label: string }[] = [
  { value: 1, label: '1  ecosystem — what this is for, how it fits the larger system' },
  { value: 2, label: '2  purpose — consumers, tradeoffs vs alternatives' },
  { value: 3, label: '3  architecture — modules and data flow' },
  { value: 4, label: '4  design — key decisions and contracts' },
  { value: 5, label: '5  balanced — why, what, and how (default)' },
  { value: 6, label: '6  working knowledge — plus edge cases and failure modes' },
  { value: 7, label: '7  implementation — functions and control flow' },
  { value: 8, label: '8  internals — invariants, error paths, concurrency' },
  { value: 9, label: '9  line level — exact conditions and constants' },
  { value: 10, label: '10 every line — operator-by-operator granularity' },
];

/** The 4-question wizard. Flags that were already passed skip their question. */
export async function runWizard(
  cwd: string,
  pre: { focus?: string; depth?: Depth; level?: number },
): Promise<WizardResult> {
  p.intro('wdijd — what did I just do?');

  // ── Q1: source ──
  const root = gitRoot(cwd);
  const options: { value: string; label: string }[] = [];
  let initial = 'other';
  if (root) {
    const dirtyFiles = (git(root, 'status', '--porcelain') ?? '')
      .split('\n')
      .filter(Boolean).length;
    const branch = git(root, 'branch', '--show-current') ?? 'HEAD';
    const def = defaultBranch(root);
    if (dirtyFiles > 0) {
      options.push({ value: 'worktree', label: `working tree changes (${dirtyFiles} files)` });
      initial = 'worktree';
    }
    options.push({ value: 'lastn', label: 'last N commits' });
    if (branch !== def) {
      const ahead = Number(git(root, 'rev-list', '--count', `${def}..HEAD`) ?? '0');
      if (ahead > 0) {
        options.push({ value: 'vsdef', label: `diff vs ${def} (${ahead} commits on ${branch})` });
        if (initial === 'other') initial = 'vsdef';
      }
    }
    if (initial === 'other') initial = 'lastn';
    options.push({ value: 'repo', label: 'whole repo' });
  }
  options.push({ value: 'other', label: 'a file, folder, or URL…' });

  const choice = val(
    await p.select({ message: 'digest what?', options, initialValue: initial }),
  );

  let target: Target;
  try {
    if (choice === 'worktree' || choice === 'vsdef') {
      target =
        choice === 'worktree'
          ? smartDetect(cwd)
          : flagTarget(cwd, { vs: defaultBranch(root!) });
    } else if (choice === 'lastn') {
      const n = val(
        await p.text({
          message: 'how many commits?',
          defaultValue: '5',
          placeholder: '5',
          validate: (s) => (s && !/^\d+$/.test(s) ? 'a number' : undefined),
        }),
      );
      target = flagTarget(cwd, { n: Number(n || '5') });
    } else if (choice === 'repo') {
      target = { kind: 'repo', root: root! };
    } else {
      const what = val(
        await p.text({ message: 'path or URL', validate: (s) => (s ? undefined : 'required') }),
      );
      target = sniffTarget(what, cwd);
    }
  } catch (e) {
    if (e instanceof TargetError) {
      p.cancel(e.message);
      process.exit(1);
    }
    throw e;
  }

  // ── Q2: focus ──
  let focus = pre.focus;
  if (focus === undefined) {
    const f = val(
      await p.text({ message: 'anything to focus on?', placeholder: 'enter to skip' }),
    );
    focus = f?.trim() || undefined;
  }

  // ── Q3: depth ──
  const depth =
    pre.depth ??
    val(
      await p.select<Depth>({
        message: 'deck size?',
        options: [
          { value: 'quick', label: 'quick — ~12 cards' },
          { value: 'standard', label: 'standard — ~25 cards' },
          { value: 'deep', label: 'deep — ~40 cards' },
        ],
        initialValue: 'standard',
      }),
    );

  // ── Q4: altitude ──
  const level =
    pre.level ??
    val(
      await p.select({
        message: 'altitude? 1 = big picture, 10 = individual lines',
        options: LEVELS,
        initialValue: 5,
      }),
    );

  p.outro('generating…');
  return { target, focus, depth, level };
}
