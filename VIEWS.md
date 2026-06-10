# wdijd — Views

Every view in the browser app. Design language: dark, dense, keyboard-first, monospace
accents. One primary element per screen; chrome stays out of the way. The terminal does the
launching and the wizard; the browser does generation progress and review.

Persistent chrome (all views except Progress): a slim top bar with the deck title (left)
and session position `12 / 25 · how it works` (right); a slim bottom bar with the active
keyboard hints, e.g. `space flip · 1-4 rate · enter next`.

## 1. Generation Progress

Shown immediately after the wizard hands off. A single centered column: the source line
(`digesting: 3 commits + working tree on feat/auth — claude`), then a terse scrolling log,
one line per engine event (`read src/auth/session.ts`, `grep "refreshToken"`), dimmed as
they age. No spinners, no percent bars — the log itself is the progress. When generation
completes: total card count and cost on one line (`25 cards · $0.43`), then auto-advance
to Overview. On failure: the one-line error + fix hint, nothing else.

## 2. Overview (advance organizer)

The deck's framing screen, shown once before the first card. Deck title as the headline;
the 3–6 sentence summary as readable prose (the one place line-length is generous); an
optional architecture diagram (mermaid) below it; then a section map — one line per
section with its card count (`why → 3 · what → 8 · how → 10 · edge cases → 4`). A single
CTA: `begin — enter`. No rating on this screen.

## 3. Card — Q&A

The workhorse. Section label small and dimmed above; the question large and centered;
nothing else visible (active recall — no answer leakage). After `space`: the answer
appears below a hairline divider, with source chips (`src/auth.ts:42`) as small monospace
pills. The four rating keys render as a compact row of buttons — `1 again · 2 hard ·
3 good · 4 easy` — with no preselection.

## 4. Card — Cloze

A syntax-highlighted code block with masked spans rendered as `▮▮▮▮` blocks sized to the
hidden text. One line of context above the code (`what this code does`). `space` reveals
the next blank in place (highlighted briefly); when all blanks are revealed, the rating
row appears. Source chips after full reveal.

## 5. Card — Explain / What-if

The prompt as the headline (`Explain to a colleague why tokens rotate on refresh` /
`What breaks if the retry cap is removed?`). Below it a monospace textarea, autofocused,
with a dim hint (`type your answer — ⌘enter to grade`). Grading is disabled until a few
words exist. While grading: the textarea dims and a single line reads `grading…`.

**Result state (same screen, below the answer):** the rubric as a checklist — ✓ in green /
✗ in red, criterion text, and the grader's one-line note per criterion; then the model
answer in a collapsed disclosure (`model answer ▸`); then the rating row with the suggested
rating pre-highlighted (e.g. `3 good` outlined) but overridable with 1–4.

## 6. Capstone

Visually distinct from regular cards (slightly larger headline, accent rule above):
`Explain this whole change to a colleague.` A full-height textarea. Graded against the
deck-level rubric; the result state matches the Explain card, plus a single overall score
(`78%`). No rating row — the capstone records the score and proceeds to Summary.

## 7. Session Summary

One dense screen, no scrolling for typical decks. Top line: `session complete · 25 cards ·
18 min · $0.61`. Then three compact groups: **capstone** (score + missed criteria, one
line each); **weak spots** (cards rated `again` most, one line each: card front truncated +
section); **next** (`12 cards due in 2d — npx wdijd review`). A final dimmed line:
`deck saved to .wdijd/auth-rotation-3f8a2c1b/`.

## 8. Deck List

Shown when the server is opened with no fresh generation (`wdijd review` with multiple
candidate decks, or navigating home). A table, one deck per row: title, source description,
card count, due count (accent-colored when > 0), last studied. Enter or click opens the
deck's Overview (cram) or straight into due cards (review mode). A dimmed empty state when
no decks exist: `no decks yet — run npx wdijd in a repo`.

## 9. Inline errors

No dedicated error screens. Failures render as a single line in place (e.g. grading
failure under the textarea: `grading failed — retry (r) or rate it yourself (1-4)`).
Mermaid render failures fall back to the diagram source in a fenced code block.
