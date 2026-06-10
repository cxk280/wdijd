import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Target } from '../cli/target.js';
import { git } from './git-cmd.js';
import { SourceSpec } from './types.js';

const INLINE_CAP = 50 * 1024;

export function gitSource(target: Target & { kind: 'worktree' | 'range' }): SourceSpec {
  const root = target.root;
  const repoName = basename(root);

  let log: string;
  let diff: string;
  let label: string;

  if (target.kind === 'worktree') {
    const ahead = git(root, 'log', '--oneline', '@{upstream}..HEAD') ?? '';
    log = ahead;
    diff = git(root, 'diff', 'HEAD') ?? '';
    // untracked files are usually the AI's new work — inline their content
    const untracked = (git(root, 'ls-files', '--others', '--exclude-standard') ?? '')
      .split('\n')
      .filter(Boolean);
    for (const f of untracked.slice(0, 20)) {
      let body = '';
      try {
        body = readFileSync(join(root, f), 'utf8').slice(0, 10 * 1024);
      } catch {
        continue; // binary or unreadable
      }
      diff += `\n## new file: ${f}\n${body}`;
    }
    label = `working tree on ${target.branch}`;
  } else {
    log = git(root, 'log', '--oneline', target.range) ?? '';
    diff = git(root, 'diff', target.range) ?? '';
    label = target.label;
  }

  const stat =
    target.kind === 'worktree'
      ? (git(root, 'diff', '--stat', 'HEAD') ?? '')
      : (git(root, 'diff', '--stat', target.range) ?? '');
  const fileCount = (stat.match(/\n/g) ?? []).length; // last line is the summary
  const description = `${label} (${Math.max(fileCount, 0)} files)`;

  const big = diff.length > INLINE_CAP;
  const context = big
    ? `## Commits\n${log}\n\n## Changed files\n${stat}\n\n(The full diff is too large to inline — use the read-only git commands you have been granted, e.g. \`git diff ${target.kind === 'worktree' ? 'HEAD' : target.range}\` on specific paths, to pull the hunks you need.)`
    : `## Commits\n${log}\n\n## Changed files\n${stat}\n\n## Diff\n\`\`\`diff\n${diff}\n\`\`\``;

  return {
    kind: 'git',
    title: `${repoName}: ${label}`,
    description,
    promptContext: context,
    needsRepoTools: true,
    needsGitTools: big,
    cwd: root,
    projectPath: root,
  };
}
