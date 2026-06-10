import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { claudeEngine } from './claude.js';
import { codexEngine } from './codex.js';
import { Engine, EngineError, EngineName } from './types.js';

const WIN_EXTS = ['.exe', '.cmd', '.bat'];

export function binaryOnPath(name: string): boolean {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const names =
    process.platform === 'win32' ? [name, ...WIN_EXTS.map((e) => name + e)] : [name];
  return dirs.some((dir) => names.some((n) => existsSync(join(dir, n))));
}

const NO_ENGINE =
  'no supported agent found — wdijd uses your existing subscription via a locally ' +
  'installed agent CLI (no API keys)';
const INSTALL_HINT =
  'install Claude Code (npm i -g @anthropic-ai/claude-code) or Codex (npm i -g @openai/codex) and log in';

/**
 * Pick the engine: Claude Code if installed, else Codex. `prefer` (--engine flag)
 * overrides, but still requires that CLI to be installed.
 */
export function detectEngine(prefer?: EngineName): Engine {
  if (prefer) {
    const have = binaryOnPath(prefer);
    if (!have)
      throw new EngineError(`--engine ${prefer} requested but \`${prefer}\` is not installed`, INSTALL_HINT);
    return prefer === 'claude' ? claudeEngine() : codexEngine();
  }
  if (binaryOnPath('claude')) return claudeEngine();
  if (binaryOnPath('codex')) return codexEngine();
  throw new EngineError(NO_ENGINE, INSTALL_HINT);
}
