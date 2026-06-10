import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TargetError, flagTarget, smartDetect, sniffTarget } from '../src/cli/target.js';
import { gitSource } from '../src/ingest/git.js';

function sh(cwd: string, ...args: string[]) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeRepo(commits = 2): string {
  const dir = mkdtempSync(join(tmpdir(), 'wdijd-test-'));
  sh(dir, 'init', '-b', 'main');
  sh(dir, 'config', 'user.email', 't@t.t');
  sh(dir, 'config', 'user.name', 't');
  for (let i = 0; i < commits; i++) {
    writeFileSync(join(dir, `f${i}.txt`), `content ${i}\n`);
    sh(dir, 'add', '-A');
    sh(dir, 'commit', '-m', `commit ${i}`);
  }
  return dir;
}

describe('smartDetect', () => {
  it('throws outside a repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wdijd-norepo-'));
    expect(() => smartDetect(dir)).toThrowError(TargetError);
  });

  it('clean on default branch → last N commits', () => {
    const dir = makeRepo(2);
    const t = smartDetect(dir);
    expect(t.kind).toBe('range');
    if (t.kind === 'range') expect(t.label).toBe('last 2 commits');
  });

  it('dirty working tree → worktree target', () => {
    const dir = makeRepo(1);
    writeFileSync(join(dir, 'f0.txt'), 'changed\n');
    const t = smartDetect(dir);
    expect(t.kind).toBe('worktree');
  });

  it('feature branch ahead of main → range vs default', () => {
    const dir = makeRepo(1);
    sh(dir, 'checkout', '-b', 'feat/x');
    writeFileSync(join(dir, 'new.txt'), 'x\n');
    sh(dir, 'add', '-A');
    sh(dir, 'commit', '-m', 'feature work');
    const t = smartDetect(dir);
    expect(t.kind).toBe('range');
    if (t.kind === 'range') {
      expect(t.range).toBe('main...HEAD');
      expect(t.label).toContain('feat/x');
    }
  });
});

describe('flagTarget', () => {
  it('-n clamps to history length', () => {
    const dir = makeRepo(2);
    const t = flagTarget(dir, { n: 10 });
    if (t.kind === 'range') expect(t.label).toBe('last 2 commits');
  });

  it('--vs validates the ref', () => {
    const dir = makeRepo(1);
    expect(() => flagTarget(dir, { vs: 'nope' })).toThrowError(/unknown ref/);
    const t = flagTarget(dir, { vs: 'main' });
    if (t.kind === 'range') expect(t.range).toBe('main...HEAD');
  });
});

describe('sniffTarget', () => {
  it('classifies URLs, dirs, files, ranges', () => {
    const dir = makeRepo(2);
    writeFileSync(join(dir, 'doc.md'), '# hi\n');
    writeFileSync(join(dir, 'paper.pdf'), '%PDF-fake');
    expect(sniffTarget('https://example.com/x', dir).kind).toBe('url');
    expect(sniffTarget('.', dir).kind).toBe('repo');
    expect(sniffTarget('doc.md', dir).kind).toBe('file');
    expect(sniffTarget('paper.pdf', dir).kind).toBe('pdf');
    expect(sniffTarget('HEAD~1..HEAD', dir).kind).toBe('range');
    expect(() => sniffTarget('garbage-zzz', dir)).toThrowError(TargetError);
  });
});

describe('gitSource', () => {
  it('inlines small diffs with stat and log', () => {
    const dir = makeRepo(2);
    const spec = gitSource({ kind: 'range', root: dir, range: 'HEAD~1..HEAD', label: 'last 1 commits' });
    expect(spec.promptContext).toContain('## Diff');
    expect(spec.promptContext).toContain('commit 1');
    expect(spec.needsGitTools).toBe(false);
    expect(spec.projectPath).toBe(dir);
  });

  it('falls back to stat-only + git tools for huge diffs', () => {
    const dir = makeRepo(1);
    writeFileSync(join(dir, 'f0.txt'), 'y\n'.repeat(40 * 1024)); // tracked file, huge change
    const t = smartDetect(dir);
    const spec = gitSource(t as Parameters<typeof gitSource>[0]);
    expect(spec.needsGitTools).toBe(true);
    expect(spec.promptContext).not.toContain('## Diff');
  });

  it('inlines untracked file content in worktree mode', () => {
    const dir = makeRepo(1);
    writeFileSync(join(dir, 'brand-new.ts'), 'export const x = 1;\n');
    const spec = gitSource({ kind: 'worktree', root: dir, branch: 'main' });
    expect(spec.promptContext).toContain('new file: brand-new.ts');
    expect(spec.promptContext).toContain('export const x = 1;');
  });
});
