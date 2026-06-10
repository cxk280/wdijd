import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { gitRoot } from '../ingest/git-cmd.js';
import { Card, Deck, DeckGen, DeckSchema, GradeResult, RatingName } from './schema.js';
import { FsrsCard, ReviewLog, newCardState, reviveCard } from './scheduler.js';

// ── Paths ────────────────────────────────────────────────────────────────────

export function wdijdHome(): string {
  return process.env.WDIJD_HOME ?? join(homedir(), '.wdijd');
}

function atomicWrite(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

// ── Index ────────────────────────────────────────────────────────────────────

export interface IndexEntry {
  deckId: string;
  title: string;
  deckDir: string; // where deck.json lives (in-repo .wdijd/<id>/ or ~/.wdijd/decks/<id>/)
  projectPath: string | null;
  createdAt: string;
  lastStudied: string | null;
}

interface IndexFile {
  version: 1;
  decks: IndexEntry[];
}

export function loadIndex(): IndexEntry[] {
  return readJson<IndexFile>(join(wdijdHome(), 'index.json'))?.decks ?? [];
}

function saveIndex(decks: IndexEntry[]): void {
  atomicWrite(join(wdijdHome(), 'index.json'), JSON.stringify({ version: 1, decks }, null, 2));
}

// ── Decks ────────────────────────────────────────────────────────────────────

function slug(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'deck'
  );
}

export function mintDeck(
  gen: DeckGen,
  source: { kind: string; description: string; projectPath: string | null },
  engine: 'claude' | 'codex',
  now: Date = new Date(),
): Deck {
  const createdAt = now.toISOString();
  const hash = createHash('sha256')
    .update(source.description + createdAt)
    .digest('hex')
    .slice(0, 8);
  return {
    ...gen,
    version: 1,
    id: `${slug(gen.title)}-${hash}`,
    createdAt,
    engine,
    source,
  };
}

export function deckDirFor(deck: Deck): string {
  return deck.source.projectPath
    ? join(deck.source.projectPath, '.wdijd', deck.id)
    : join(wdijdHome(), 'decks', deck.id);
}

export function saveDeck(deck: Deck): string {
  const dir = deckDirFor(deck);
  atomicWrite(join(dir, 'deck.json'), JSON.stringify(deck, null, 2));
  atomicWrite(join(dir, 'deck.md'), renderDeckMd(deck));
  const index = loadIndex().filter((e) => e.deckId !== deck.id);
  index.unshift({
    deckId: deck.id,
    title: deck.title,
    deckDir: dir,
    projectPath: deck.source.projectPath,
    createdAt: deck.createdAt,
    lastStudied: null,
  });
  saveIndex(index);
  return dir;
}

export function loadDeck(deckId: string): Deck | null {
  const entry = loadIndex().find((e) => e.deckId === deckId);
  if (!entry) return null;
  const raw = readJson<unknown>(join(entry.deckDir, 'deck.json'));
  const parsed = DeckSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Most recent deck for the repo containing cwd (or most recent overall). */
export function latestDeck(cwd?: string): IndexEntry | null {
  const index = loadIndex();
  if (cwd) {
    const root = gitRoot(cwd);
    if (root) {
      const match = index.find((e) => e.projectPath === root);
      if (match) return match;
    }
  }
  return index[0] ?? null;
}

export function touchLastStudied(deckId: string, now: Date = new Date()): void {
  const index = loadIndex();
  const e = index.find((x) => x.deckId === deckId);
  if (e) {
    e.lastStudied = now.toISOString();
    saveIndex(index);
  }
}

// ── Review state (always personal, always in ~/.wdijd) ──────────────────────

export interface SessionRecord {
  startedAt: string;
  endedAt: string | null;
  capstone: { answer: string; result: GradeResult } | null;
  ratings: { cardId: string; rating: RatingName }[];
}

export interface DeckState {
  version: 1;
  cards: Record<string, FsrsCard>;
  logs: (ReviewLog & { cardId: string })[];
  sessions: SessionRecord[];
}

function statePath(deckId: string): string {
  return join(wdijdHome(), 'state', `${deckId}.json`);
}

/** Load state, creating FSRS entries for any rateable card that lacks one. */
export function loadState(deck: Deck, now: Date = new Date()): DeckState {
  const raw = readJson<DeckState>(statePath(deck.id));
  const state: DeckState = raw
    ? {
        ...raw,
        cards: Object.fromEntries(
          Object.entries(raw.cards).map(([id, c]) => [
            id,
            reviveCard(c as unknown as Record<string, unknown>),
          ]),
        ),
      }
    : { version: 1, cards: {}, logs: [], sessions: [] };
  for (const card of deck.cards) {
    if (card.type === 'overview') continue;
    if (!state.cards[card.id]) state.cards[card.id] = newCardState(now);
  }
  return state;
}

export function saveState(deckId: string, state: DeckState): void {
  atomicWrite(statePath(deckId), JSON.stringify(state, null, 2));
}

// ── deck.md — generated once, for humans and LLMs; never parsed back ────────

function cardMd(card: Card): string {
  const refs = card.sourceRefs.length ? `\n*refs: ${card.sourceRefs.join(', ')}*` : '';
  switch (card.type) {
    case 'overview':
      return `### overview\n${card.markdown}${card.mermaid ? `\n\`\`\`mermaid\n${card.mermaid}\n\`\`\`` : ''}${refs}`;
    case 'qa':
      return `### q&a\n**Q:** ${card.front}\n\n**A:** ${card.back}${refs}`;
    case 'cloze':
      return `### cloze — ${card.context}\n\`\`\`${card.language}\n${card.code.replace(/\{\{c\d+::(.*?)\}\}/g, '$1')}\n\`\`\`${refs}`;
    case 'explain':
    case 'whatif':
      return `### ${card.type}\n**Prompt:** ${card.prompt}\n\n**Model answer:** ${card.modelAnswer}\n\nRubric:\n${card.rubric.criteria.map((c) => `- (${c.weight}) ${c.text}`).join('\n')}${refs}`;
  }
}

export function renderDeckMd(deck: Deck): string {
  const sections = new Map<string, Card[]>();
  for (const c of deck.cards) {
    if (!sections.has(c.section)) sections.set(c.section, []);
    sections.get(c.section)!.push(c);
  }
  const body = [...sections.entries()]
    .map(([name, cards]) => `## ${name}\n\n${cards.map(cardMd).join('\n\n')}`)
    .join('\n\n');

  return `---
title: ${JSON.stringify(deck.title)}
source: ${JSON.stringify(deck.source.description)}
created: ${deck.createdAt}
cards: ${deck.cards.length}
generator: wdijd v1 (${deck.engine})
---

# ${deck.title}

${deck.summary}

${body}

## capstone

**Prompt:** ${deck.capstone.prompt}

Rubric:
${deck.capstone.rubric.criteria.map((c) => `- (${c.weight}) ${c.text}`).join('\n')}
`;
}
