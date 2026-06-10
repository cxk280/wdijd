import { describe, expect, it } from 'vitest';
import { toStrictOpenAiSchema } from '../src/engines/codex.js';
import { deckGenJsonSchema } from '../src/core/schema.js';

describe('toStrictOpenAiSchema (codex / OpenAI strict mode)', () => {
  it('rewrites oneOf → anyOf (OpenAI rejects oneOf)', () => {
    const s = JSON.stringify(toStrictOpenAiSchema(deckGenJsonSchema));
    expect(s).not.toContain('"oneOf"');
    expect(s).toContain('"anyOf"'); // the card discriminated union
  });

  it('forces additionalProperties:false and required=all-keys on every object', () => {
    const out = toStrictOpenAiSchema({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' } },
      required: ['a'],
    }) as Record<string, unknown>;
    expect(out.additionalProperties).toBe(false);
    expect(out.required).toEqual(['a', 'b']);
  });

  it('recurses into nested objects and arrays', () => {
    const out = toStrictOpenAiSchema({
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object', properties: { x: { type: 'string' } } } },
      },
    }) as { properties: { items: { items: { additionalProperties: boolean; required: string[] } } } };
    const inner = out.properties.items.items;
    expect(inner.additionalProperties).toBe(false);
    expect(inner.required).toEqual(['x']);
  });

  it('leaves primitives untouched', () => {
    expect(toStrictOpenAiSchema('x')).toBe('x');
    expect(toStrictOpenAiSchema(5)).toBe(5);
    expect(toStrictOpenAiSchema(null)).toBe(null);
  });
});
