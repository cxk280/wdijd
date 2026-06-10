import { DEPTH_CARDS, GenerateOptions, SourceSpec } from '../ingest/types.js';
import { Rubric } from './schema.js';

/** Altitude bands: what the cards should be *about* at each level. */
function altitude(level: number): string {
  if (level <= 2)
    return `ALTITUDE ${level}/10 — ecosystem level. Cards cover: what this exists for, who consumes it, how it fits the larger system/ecosystem, the one-paragraph mental model, key tradeoffs vs alternatives. NO function names, NO code snippets, NO cloze cards. A non-engineer stakeholder should be able to master this deck.`;
  if (level <= 4)
    return `ALTITUDE ${level}/10 — architecture level. Cards cover: modules and their responsibilities, data flow between them, the key design decisions and why, interfaces and contracts. Name files and modules, but no line-level detail; at most 1-2 cloze cards on signatures.`;
  if (level <= 6)
    return `ALTITUDE ${level}/10 — working-knowledge level (balanced). Cards mix why → what → how: the purpose, the moving parts, and the important implementation choices, edge cases, and failure modes. Cloze on meaningful identifiers and conditions is welcome.`;
  if (level <= 8)
    return `ALTITUDE ${level}/10 — implementation level. Cards drill into functions: control flow, invariants, error paths, concurrency, the exact behavior of the important routines. Heavier on cloze and what-if; still one overview card for orientation.`;
  return `ALTITUDE ${level}/10 — line level. Cards interrogate individual lines and expressions: exact conditions, operator choices, off-by-one boundaries, specific constants and why those values. Mostly cloze and what-if cards quoting real code verbatim; assume the studier already has the big picture.`;
}

function quotas(level: number, total: number): string {
  // low altitude → explanatory card types; high altitude → code-anchored types
  const cloze = level <= 2 ? 0 : level <= 4 ? 0.1 : level <= 6 ? 0.2 : level <= 8 ? 0.3 : 0.45;
  const explain = level <= 4 ? 0.3 : 0.2;
  const whatif = level <= 2 ? 0.1 : 0.15;
  const qa = Math.max(0.15, 1 - cloze - explain - whatif - 0.05);
  const f = (x: number) => Math.max(level <= 2 && x === cloze ? 0 : 0, Math.round(total * x));
  return `Target ${total} cards (±20%): 1 overview card first, ~${f(qa)} qa, ~${f(cloze)} cloze, ~${f(explain)} explain, ~${f(whatif)} whatif.`;
}

export function generationPrompt(spec: SourceSpec, opts: GenerateOptions): string {
  const total = DEPTH_CARDS[opts.depth];
  return `You are generating a flashcard deck for "What Did I Just Do?" — a tool that helps a human deeply understand work (usually AI-written code) well enough to explain it to other humans. Your output must follow the JSON schema you have been given.

# Material
${spec.promptContext}

${spec.needsRepoTools ? 'Explore with your read-only tools BEFORE writing any cards. Understand first; never write a card about code you have not read.\n' : ''}${opts.focus ? `# Focus\nThe user specifically wants to focus on: ${opts.focus}\n` : ''}
# Altitude
${altitude(opts.level)}

# Deck requirements
- ${quotas(opts.level, total)}
- "summary": an advance organizer — 3-6 plain sentences a colleague could read cold. It frames everything that follows.
- The overview card may include a SIMPLE mermaid diagram (flowchart or sequenceDiagram only, <15 nodes, no styling directives); set "mermaid" to null if a diagram adds nothing.
- Group cards into 3-5 "section" values ordered big-picture → details (e.g. why → what → how → edge cases). "order" is the global study order: overview first, then sections coarse to fine.
- qa cards: use elaborative interrogation — "Why does X use Y instead of Z?", "What problem does X solve?" — not bare definitions.
- cloze cards: quote REAL code from the material in "code", masking only meaningful tokens (function names, conditions, constants) with {{c1::token}}, {{c2::token}} markers, max 3 blanks. "context" is one line saying what the code does. Never mask syntax or trivia.
- explain cards: "prompt" asks the studier to explain something to a colleague; "rubric" lists 2-4 weighted criteria a good explanation must hit (weight 1-3); "modelAnswer" is the answer you would give.
- whatif cards: transfer questions — "What breaks if …?", "What would happen when …?" — with rubric + modelAnswer like explain cards.
- EVERY card cites "sourceRefs": file paths with line ranges ("src/auth.ts:42-60"), commit hashes, page numbers, or section names from the material. Empty only when truly nothing to cite.
- "capstone": a prompt asking the studier to explain the WHOLE change/material to a colleague, with a 3-6 criterion weighted rubric covering what changed, why, and what to watch out for.
- Write tersely. Fronts/prompts are one sentence where possible. Backs/answers ≤3 sentences. No filler, no "great question" energy.
- Card "id" values: short unique slugs like "q-rotation-why". Tags: 1-3 lowercase topical tags.`;
}

export function gradingPrompt(args: {
  cardPrompt: string;
  rubric: Rubric;
  modelAnswer: string;
  answer: string;
}): string {
  return `Grade a flashcard answer against a rubric. Output must follow the JSON schema you have been given.

# Question
${args.cardPrompt}

# Rubric criteria
${args.rubric.criteria.map((c) => `- id "${c.id}" (weight ${c.weight}): ${c.text}`).join('\n')}

# Reference answer (for your calibration only — the studier never saw it)
${args.modelAnswer}

# Studier's answer
${args.answer}

For each criterion, decide met=true/false based on whether the studier's answer demonstrates that understanding in their own words (generous on phrasing, strict on substance). "note" is one short clause of evidence ("got the reuse signal", "never mentions revocation"). "feedback" is ≤2 terse sentences: what was strongest, what to fix first. Do not grade grammar or style.`;
}
