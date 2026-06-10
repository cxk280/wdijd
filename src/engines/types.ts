export type EngineName = 'claude' | 'codex';

export interface EngineRunOpts {
  /** Full task instructions (includes any inline source context). */
  instructions: string;
  /** JSON Schema the final output must match. */
  schema: object;
  /** Working directory for agent exploration. */
  cwd: string;
  /** Grant read-only repo exploration tools. */
  needsRepoTools?: boolean;
  /** Grant read-only git commands. */
  needsGitTools?: boolean;
  /** Image file paths to attach. */
  images?: string[];
  /** PDF file paths to attach (Claude only — gate on engine.supportsPdf). */
  pdfs?: string[];
  /** Cap on agentic turns (Claude only). */
  maxTurns?: number;
  /** Prefer speed over depth (grading): small model / low reasoning effort. */
  fast?: boolean;
  onProgress?: (line: string) => void;
}

export interface EngineResult {
  output: unknown;
  costUsd?: number;
}

export interface Engine {
  name: EngineName;
  supportsPdf: boolean;
  runStructured(opts: EngineRunOpts): Promise<EngineResult>;
}

export class EngineError extends Error {
  constructor(
    message: string,
    /** One-line fix hint shown to the user, e.g. how to log in. */
    public hint?: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}
