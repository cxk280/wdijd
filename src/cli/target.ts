import { existsSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { defaultBranch, git, gitRoot } from '../ingest/git-cmd.js';

/** What to digest, decided before any adapter runs. */
export type Target =
  | { kind: 'worktree'; root: string; branch: string }
  | { kind: 'range'; root: string; range: string; label: string }
  | { kind: 'repo'; root: string }
  | { kind: 'file'; path: string }
  | { kind: 'pdf'; path: string }
  | { kind: 'image'; path: string }
  | { kind: 'url'; url: string };

export class TargetError extends Error {}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** Smart default per git state. Throws TargetError outside a repo. */
export function smartDetect(cwd: string): Target {
  const root = gitRoot(cwd);
  if (!root) throw new TargetError('not a git repo — pass a path, URL, or commit range');
  const branch = git(root, 'branch', '--show-current') ?? 'HEAD';

  const dirty = (git(root, 'status', '--porcelain') ?? '') !== '';
  if (dirty) return { kind: 'worktree', root, branch };

  const def = defaultBranch(root);
  if (branch !== def) {
    const ahead = git(root, 'rev-list', '--count', `${def}..HEAD`);
    if (ahead && Number(ahead) > 0)
      return { kind: 'range', root, range: `${def}...HEAD`, label: `${branch} vs ${def}` };
  }

  const total = Number(git(root, 'rev-list', '--count', 'HEAD') ?? '0');
  if (total === 0) throw new TargetError('repo has no commits and no changes — nothing to digest');
  const n = Math.min(5, total);
  return { kind: 'range', root, range: n === total ? 'HEAD' : `HEAD~${n}..HEAD`, label: `last ${n} commits` };
}

/** Resolve `wdijd -n 3` / `wdijd --vs main` / `wdijd --repo`. */
export function flagTarget(cwd: string, flags: { n?: number; vs?: string; repo?: boolean }): Target {
  if (flags.repo) {
    const root = gitRoot(cwd) ?? cwd;
    return { kind: 'repo', root };
  }
  const root = gitRoot(cwd);
  if (!root) throw new TargetError('not a git repo');
  if (flags.vs !== undefined) {
    if (git(root, 'rev-parse', '--verify', '--quiet', flags.vs) === null)
      throw new TargetError(`unknown ref: ${flags.vs}`);
    return { kind: 'range', root, range: `${flags.vs}...HEAD`, label: `HEAD vs ${flags.vs}` };
  }
  if (flags.n !== undefined) {
    const total = Number(git(root, 'rev-list', '--count', 'HEAD') ?? '0');
    if (total === 0) throw new TargetError('repo has no commits');
    const n = Math.min(flags.n, total);
    return { kind: 'range', root, range: n === total ? 'HEAD' : `HEAD~${n}..HEAD`, label: `last ${n} commits` };
  }
  return smartDetect(cwd);
}

/** Classify a positional argument: URL, git range/ref, file, or directory. */
export function sniffTarget(arg: string, cwd: string): Target {
  if (/^https?:\/\//.test(arg)) return { kind: 'url', url: arg };

  const path = resolve(cwd, arg);
  if (existsSync(path)) {
    if (statSync(path).isDirectory()) return { kind: 'repo', root: path };
    const ext = extname(path).toLowerCase();
    if (ext === '.pdf') return { kind: 'pdf', path };
    if (IMAGE_EXTS.has(ext)) return { kind: 'image', path };
    return { kind: 'file', path };
  }

  const root = gitRoot(cwd);
  if (root) {
    if (arg.includes('..')) {
      // validate both endpoints of the range
      if (git(root, 'rev-list', '--max-count=1', arg) !== null)
        return { kind: 'range', root, range: arg, label: arg };
    } else if (git(root, 'rev-parse', '--verify', '--quiet', `${arg}^{commit}`) !== null) {
      // single ref/commit → that one commit
      return { kind: 'range', root, range: `${arg}~1..${arg}`, label: `commit ${arg}` };
    }
  }
  throw new TargetError(`can't make sense of "${arg}" — not a path, URL, or git ref`);
}
