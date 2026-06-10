import { afterEach, describe, expect, it } from 'vitest';
import { binaryOnPath, detectEngine } from '../src/engines/detect.js';
import { EngineError } from '../src/engines/types.js';

const realPath = process.env.PATH;
afterEach(() => {
  process.env.PATH = realPath;
});

describe('detectEngine', () => {
  it('finds well-known binaries on PATH', () => {
    expect(binaryOnPath('node')).toBe(true);
    expect(binaryOnPath('definitely-not-a-binary-xyz')).toBe(false);
  });

  it('throws a terse EngineError when nothing is installed', () => {
    process.env.PATH = '/nonexistent';
    expect(() => detectEngine()).toThrowError(EngineError);
    try {
      detectEngine();
    } catch (e) {
      expect((e as EngineError).hint).toMatch(/install Claude Code/);
    }
  });

  it('rejects a preferred engine that is not installed', () => {
    process.env.PATH = '/nonexistent';
    expect(() => detectEngine('codex')).toThrowError(/not installed/);
  });
});
