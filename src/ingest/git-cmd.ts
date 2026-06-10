import { execFileSync } from 'node:child_process';

/** Run a git command, returning stdout or null on failure. Never throws. */
export function git(cwd: string, ...args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    }).trimEnd();
  } catch {
    return null;
  }
}

export function gitRoot(cwd: string): string | null {
  return git(cwd, 'rev-parse', '--show-toplevel');
}

/** origin/HEAD if set, else main/master if they exist, else the current branch. */
export function defaultBranch(root: string): string {
  const remote = git(root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD');
  if (remote) return remote.replace(/^origin\//, '');
  for (const b of ['main', 'master']) {
    if (git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`) !== null) return b;
  }
  return git(root, 'branch', '--show-current') ?? 'HEAD';
}
