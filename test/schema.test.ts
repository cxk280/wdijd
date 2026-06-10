import { describe, expect, it } from 'vitest';
import {
  CardSchema,
  DeckGenSchema,
  deckGenJsonSchema,
  salvageDeckGen,
} from '../src/core/schema.js';

const rubric = {
  criteria: [
    { id: 'c1', text: 'Mentions token rotation', weight: 3 },
    { id: 'c2', text: 'Names the affected module', weight: 1 },
  ],
};

const validCards = [
  {
    id: 'ov1', type: 'overview', section: 'big picture', order: 0, tags: [], sourceRefs: [],
    markdown: 'The change adds refresh-token rotation.', mermaid: null,
  },
  {
    id: 'q1', type: 'qa', section: 'how', order: 1, tags: ['auth'], sourceRefs: ['src/auth.ts:10'],
    front: 'Why rotate refresh tokens?', back: 'Limits replay window.',
  },
  {
    id: 'cl1', type: 'cloze', section: 'how', order: 2, tags: [], sourceRefs: ['src/auth.ts:42'],
    language: 'ts', code: 'if ({{c1::token.expired}}) rotate()', context: 'rotation guard',
  },
  {
    id: 'ex1', type: 'explain', section: 'why', order: 3, tags: [], sourceRefs: [],
    prompt: 'Explain rotation to a colleague', rubric, modelAnswer: 'Rotation replaces…',
  },
];

const validDeck = {
  title: 'Auth refresh rotation',
  summary: 'Adds rotation…',
  capstone: { prompt: 'Explain the whole change', rubric },
  cards: validCards,
};

describe('DeckGenSchema', () => {
  it('accepts a valid deck', () => {
    expect(DeckGenSchema.safeParse(validDeck).success).toBe(true);
  });

  it('rejects unknown card types', () => {
    const bad = { ...validDeck, cards: [{ ...validCards[1], type: 'matching' }] };
    expect(DeckGenSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects explain cards with an empty rubric', () => {
    const bad = { ...validCards[3], rubric: { criteria: [] } };
    expect(CardSchema.safeParse(bad).success).toBe(false);
  });

  it('exports a JSON schema with the card union', () => {
    expect(JSON.stringify(deckGenJsonSchema)).toContain('overview');
  });
});

describe('salvageDeckGen', () => {
  it('keeps valid cards and counts dropped ones', () => {
    const mixed = {
      ...validDeck,
      cards: [...validCards, { id: 'bad', type: 'qa' }, { nonsense: true }],
    };
    const out = salvageDeckGen(mixed);
    expect(out).not.toBeNull();
    expect(out!.deck.cards).toHaveLength(4);
    expect(out!.dropped).toBe(2);
  });

  it('returns null when the shell is broken', () => {
    expect(salvageDeckGen({ cards: validCards })).toBeNull();
    expect(salvageDeckGen('nope')).toBeNull();
  });

  it('returns null when no cards survive', () => {
    expect(salvageDeckGen({ ...validDeck, cards: [{ junk: 1 }] })).toBeNull();
  });
});
