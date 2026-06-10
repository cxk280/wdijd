export type SourceKind = 'git' | 'repo' | 'file' | 'pdf' | 'image' | 'url';

export type Depth = 'quick' | 'standard' | 'deep';
export const DEPTH_CARDS: Record<Depth, number> = { quick: 12, standard: 25, deep: 40 };

/** Engine-agnostic description of what to digest. Adapters produce this. */
export interface SourceSpec {
  kind: SourceKind;
  /** Seed for the deck title. */
  title: string;
  /** One terse human-readable line, e.g. "3 commits + working tree on feat/auth (12 files)". */
  description: string;
  /** Inline text context (capped — large sources rely on engine exploration). */
  promptContext: string;
  /** Image file paths to attach (engine converts to its own format). */
  images?: string[];
  /** PDF file paths to attach (Claude engine only). */
  pdfs?: string[];
  /** Grant read-only repo exploration (Read/Grep/Glob or sandboxed shell). */
  needsRepoTools: boolean;
  /** Grant read-only git commands (diff/log/show). */
  needsGitTools: boolean;
  /** Working directory for engine exploration. */
  cwd: string;
  /** Git root when the source lives in a repo — decides deck storage location. */
  projectPath: string | null;
}

export interface GenerateOptions {
  depth: Depth;
  /**
   * Altitude, 1-10. 1 = highest level (what the repo is for, how it fits its
   * ecosystem); 10 = most granular (meanings of individual lines). Default 5.
   */
  level: number;
  /** Optional user steer: "focus on the auth changes". */
  focus?: string;
}
