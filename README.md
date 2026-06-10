# wdijd — What Did I Just Do?

AI writes code faster than you can absorb it. `wdijd` turns whatever an AI just did — a
diff, a branch, a whole repo, a PDF, an image, a URL — into an interactive flashcard deck
built on evidence-based learning science, so you can understand the work deeply enough to
**explain it to another human**.

```
npx wdijd
```

That's it. A four-question wizard (what to digest · what to focus on · deck size ·
altitude), then your browser opens with the deck.

## How it works

- **Your existing subscription, no API keys.** wdijd drives a locally installed agent CLI:
  [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code) if present,
  otherwise [Codex](https://www.npmjs.com/package/@openai/codex). The agent explores your
  repo read-only and writes the deck; a fast model grades your free-form answers.
- **Learning science, not trivia.** Sessions open with an advance organizer, run
  big-picture → details, and use active recall throughout: think-then-flip Q&A, cloze
  deletions over real code, "explain this to a colleague" prompts graded by LLM against a
  weighted rubric, transfer ("what breaks if…") questions, and a graded capstone
  explanation of the whole change.
- **Spaced repetition that persists.** Every rating feeds an FSRS scheduler. Come back
  tomorrow with `npx wdijd review` and study only what's due.
- **Altitude control.** Level 1 asks what the repo is *for* and how it fits its ecosystem;
  level 10 interrogates individual lines. Pick where understanding matters for you.

## Usage

```
npx wdijd                  # wizard (smart git default preselected)
npx wdijd -n 3             # last 3 commits
npx wdijd --vs main        # your branch vs main
npx wdijd --repo           # the whole repo
npx wdijd ./paper.pdf      # a PDF (Claude engine)
npx wdijd ./diagram.png    # an image
npx wdijd https://…        # a URL
npx wdijd review           # due cards for this repo's latest deck
npx wdijd ls               # all decks

  -m, --focus <text>       steer the deck ("focus on the auth changes")
  --depth quick|standard|deep      ~12 / ~25 / ~40 cards
  --level <1-10>           altitude: 1 = big picture, 10 = individual lines
  --engine claude|codex    override auto-detection
  --no-open, --port <p>, --dry-run
```

## Where things live

| What | Where | Why |
|---|---|---|
| Deck (immutable) | `<repo>/.wdijd/<deck-id>/deck.json` + `deck.md` | Commit it — teammates can study the same deck, and the markdown is readable by humans and future LLM sessions |
| Non-repo decks | `~/.wdijd/decks/<deck-id>/` | PDFs/URLs have no repo |
| Your review state | `~/.wdijd/state/<deck-id>.json` | FSRS schedule and answers are personal — never in the repo |

## Requirements

Node ≥ 20, and one of Claude Code or Codex installed and logged in. Everything runs
locally; the only network traffic is your agent CLI talking to its own backend.

## Development

```
npm install
npm test                   # vitest: target matrix, schema, scheduler, routes
npm run build              # vite (SPA → dist/web) + tsup (CLI → dist/cli.js)
node dist/cli.js --dry-run # resolve a target without generating
npm run dev:web            # SPA dev server proxying /api → :4577
```
