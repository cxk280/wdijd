import { Target } from '../cli/target.js';
import { fileSource, imageSource, pdfSource } from './files.js';
import { gitSource } from './git.js';
import { repoSource } from './repo.js';
import { SourceSpec } from './types.js';
import { urlSource } from './url.js';

export async function sourceFromTarget(t: Target): Promise<SourceSpec> {
  switch (t.kind) {
    case 'worktree':
    case 'range':
      return gitSource(t);
    case 'repo':
      return repoSource(t.root);
    case 'file':
      return fileSource(t.path);
    case 'pdf':
      return pdfSource(t.path);
    case 'image':
      return imageSource(t.path);
    case 'url':
      return urlSource(t.url);
  }
}
