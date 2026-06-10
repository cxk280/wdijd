import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { gitRoot } from './git-cmd.js';
import { SourceSpec } from './types.js';

const INLINE_CAP = 50 * 1024;

export function fileSource(path: string): SourceSpec {
  const name = basename(path);
  const dir = dirname(path);
  const root = gitRoot(dir);
  const text = readFileSync(path, 'utf8');
  const big = text.length > INLINE_CAP;

  return {
    kind: 'file',
    title: name,
    description: name,
    promptContext: big
      ? `The material is the file \`${path}\` (${Math.round(text.length / 1024)} KB — too large to inline). Read it with your tools.`
      : `## ${name}\n\`\`\`\n${text}\n\`\`\``,
    needsRepoTools: big,
    needsGitTools: false,
    cwd: dir,
    projectPath: root,
  };
}

export function pdfSource(path: string): SourceSpec {
  return {
    kind: 'pdf',
    title: basename(path),
    description: basename(path),
    promptContext: 'The material is the attached PDF.',
    pdfs: [path],
    needsRepoTools: false,
    needsGitTools: false,
    cwd: dirname(path),
    projectPath: null,
  };
}

export function imageSource(path: string): SourceSpec {
  return {
    kind: 'image',
    title: basename(path),
    description: basename(path),
    promptContext: 'The material is the attached image.',
    images: [path],
    needsRepoTools: false,
    needsGitTools: false,
    cwd: dirname(path),
    projectPath: null,
  };
}
