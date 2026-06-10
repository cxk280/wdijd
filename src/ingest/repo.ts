import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SourceSpec } from './types.js';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'target', '__pycache__', '.venv']);

/** Two-level tree summary — enough for the agent to orient, then explore. */
function tree(root: string): string {
  const lines: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(root).filter((e) => !SKIP.has(e) && !e.startsWith('.'));
  } catch {
    return '(unreadable)';
  }
  for (const e of entries.sort().slice(0, 40)) {
    const p = join(root, e);
    let isDir = false;
    try {
      isDir = readdirSync(p).length >= 0;
    } catch {
      isDir = false;
    }
    if (isDir) {
      lines.push(`${e}/`);
      try {
        for (const c of readdirSync(p).filter((x) => !SKIP.has(x) && !x.startsWith('.')).sort().slice(0, 15))
          lines.push(`  ${c}`);
      } catch {
        /* ignore */
      }
    } else {
      lines.push(e);
    }
  }
  return lines.join('\n');
}

export function repoSource(root: string): SourceSpec {
  const name = basename(root);
  let readme = '';
  for (const f of ['README.md', 'readme.md', 'README']) {
    const p = join(root, f);
    if (existsSync(p)) {
      readme = readFileSync(p, 'utf8').slice(0, 4000);
      break;
    }
  }
  return {
    kind: 'repo',
    title: name,
    description: `whole repo: ${name}`,
    promptContext: `## File tree (partial)\n${tree(root)}\n${readme ? `\n## README (head)\n${readme}` : ''}\n\nExplore the repo with your tools to understand what matters before writing cards.`,
    needsRepoTools: true,
    needsGitTools: true,
    cwd: root,
    projectPath: root,
  };
}
