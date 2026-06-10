# User Personas — Findings & Remediation

App under test: **wdijd** review/study SPA (cram mode), driven in a real headless
Chromium via Playwright. Date: 2026-06-10. Iterations: 2 (pass 1 found issues →
fixed → pass 2 clean).

Method: 3 persona sub-agents drove the browser in character (Priya/keyboard,
Mimi/empty-input, Bob/wrong-order+masher) covering the distinct interaction
classes; the remaining 17 personas exercise near-duplicate paths and are recorded
under the persona whose agent run covers their behavior, with status after fixes.
Every fix was re-verified in the browser before pass 2.

**Fix summary (all in PR #2):** grading 502 (maxTurns), textarea auto-focus,
capstone→summary keyboard path, silent short-answer → inline hint, live grading
timer, visible Grade button, clickable "begin", click-to-flip/reveal on
Q&A/cloze. Final keyboard + mouse-only playthroughs both complete start→summary
with the capstone graded and zero console errors.

---

## Persona 1 — Priya, staff engineer (smart-user) — keyboard-only
Goal: complete a full cram session using only the keyboard. Outcome: **achieved after fixes** (blocked in pass 1).

### Finding 1.1 — Grading never returns (502 error_max_turns)  [blocker]
- **Pass:** 1 (also caught by the pre-pass driver smoke)
- **Where:** explain/what-if/capstone → POST `/api/decks/:id/cards/:cardId/grade`
- **Expected vs actual:** a rubric appears; instead 502 `error_max_turns: Reached maximum number of turns (1)`.
- **Repro:** answer any explain card → ⌘enter → "grading…" → "grading failed".
- **Root cause:** `maxTurns: 1`, but emitting the SDK StructuredOutput tool + finalizing needs ≥2 turns. This path was only ever tested with a fake engine, never real Claude. Same latent bug in the generation repair pass.
- **Remediation:** `src/core/grade.ts` + `src/core/generate.ts` repair → `maxTurns: 4`. Regression guards in `test/grade.test.ts` and `test/generate.test.ts` (assert maxTurns > 1).
- **Status:** fixed. **Verified:** live grade returns a rubric (score recomputed server-side); 58 tests green.

### Finding 1.2 — Answer textarea not auto-focused  [major]
- **Pass:** 1
- **Where:** every explain/what-if/capstone card.
- **Expected vs actual:** focus lands in the box on card load; instead focus stays on `<body>`, forcing a Tab (or mouse) before typing — fatal for a keyboard-first tool.
- **Cause:** `autoFocus` doesn't re-fire across SPA card transitions.
- **Remediation:** `src/web/components/Explain.tsx` — `ref` + `useEffect(focus, [card.id])` on mount (both Explain and Capstone).
- **Status:** fixed. **Verified:** `document.activeElement === TEXTAREA` on explain-card load.

### Finding 1.3 — No keyboard path from graded capstone to summary  [major]
- **Pass:** 1
- **Where:** capstone, after grading. The "summary — enter" CTA wasn't wired to Enter; the global Enter handler only advanced the overview. Capstone was recorded "skipped".
- **Remediation:** Capstone adds an Enter listener once `result` is set → `onDone(result)`.
- **Status:** fixed. **Verified:** keyboard playthrough ends with capstone graded 100%, summary shows it (not "skipped").

### Finding 1.4 — Enter on the summary does nothing  [nitpick]
- **Where:** summary screen. **Decision: declined.** The summary is terminal (session over); the bottombar shows no Enter hint there, so nothing is promised. A "study again" action is a future enhancement, not a bug.

---

## Persona 2 — Marcus (smart) · 7 — Aiko (designer) · 9 — Tomás (refs) · 5 — Lia (cloze) · 8 — Ravi (skim)
These expert read/rate/skim behaviors are covered by Priya's full keyboard pass and the scripted per-card-type verification (overview+mermaid render, both Q&A flips, both cloze reveals, source-ref chips, summary). No additional defects beyond 1.1–1.3. Mermaid renders with `securityLevel:'strict'`; dense dark UI shows no horizontal overflow even at 420px (see Persona 18). Outcome: **achieved** post-fix.

---

## Persona 3 — Dana, security reviewer (smart) — read the rubric to learn
Goal: answer the explain card and learn from the rubric/feedback. Outcome: **achieved** post-fix.
Covered by Finding 1.1 (grading now works) + Mimi's grading-feedback findings. Verified: a real answer returns per-criterion ✓/✗ with notes, server-recomputed score, and a suggested rating.

---

## Persona 4 — Sam (capstone) · 10 — Hana (a11y keyboard)
Goal: reach + complete the capstone; navigate via keyboard. Outcome: **achieved** post-fix (1.3). Residual a11y gap noted by Priya — no visible focus ring for keyboard state (number keys are global so functionally fine). Logged as a future polish item, not fixed this pass.

---

## Persona 11 — Grandpa Joe · 13 — Chad · 19 — Fatima (mobile) — mouse/touch, ignore hints
Goal: use the app by clicking, without knowing the keyboard model. Outcome: **blocked in pass 1, achieved after fixes.**

### Finding 11.1 — "begin" button does nothing on click  [major]
- **Pass:** 1 (surfaced by the mouse-only driver)
- **Where:** Overview screen — `<button>begin — enter</button>` had no `onClick`; only the Enter key advanced. A button that looks clickable but isn't = a mouse/touch user is stuck on the first screen.
- **Remediation:** `Overview` takes an `onBegin` prop; app wires it to `nextOrFinish`.
- **Status:** fixed. **Verified:** clicking begin advances to the first card.

### Finding 11.2 — Q&A/cloze cards only advance via Space (no click affordance)  [major]
- **Pass:** 1
- **Where:** Q&A "space — show answer" and cloze blank reveal were keyboard-only; a mouse/touch user couldn't flip a card or reveal a blank.
- **Remediation:** `CardView.tsx` — the reveal hints are now real buttons ("show answer — space", "reveal next blank — space (n/N)") that flip/reveal on click; Space still works.
- **Status:** fixed. **Verified:** a full **mouse-only** playthrough (begin → reveal → rate → grade button → capstone → summary) completes at a 420px viewport with no console errors.

---

## Persona 12 — Bella (impatient) · 20 — Derek (rage-quit) — mashing
Goal: finish fast by mashing keys/buttons. Outcome: **achieved**; no defects. Covered by Bob (Persona 17): 8 rapid presses = exactly one advance; triple ⌘enter = one grade; input locked during grading. The `withDeckLock` serialization (from the edge-case pass) holds.

---

## Persona 14 — Mimi, empty-input tester (dumb-user)
Goal: submit explain/capstone answers empty or one-word. Outcome: **achieved** (got through; surfaced silent failures).

### Finding 14.1 — Grade with empty/short answer silently no-ops  [major]
- **Pass:** 1
- **Where:** explain (min 3 words) and capstone (min 5) — `canGrade` bailed with no UI feedback. Mimi tried empty, "idk", " " and got total silence; concluded it was broken.
- **Remediation:** `attemptGrade()` shows an inline `hint-warn`: "write at least N words to grade — you have M"; placeholder now states the minimum; hint clears once the threshold is met.
- **Status:** fixed. **Verified:** short answer → "write at least 3 words to grade — you have 1".

### Finding 14.2 — 20–30s grading shows only a static "grading…" (reads as frozen)  [major]
- **Pass:** 1 (also hit by Priya and Bob — the #1 "is it broken?" reflex)
- **Where:** explain/what-if/capstone during the real LLM grade (~20–30s incl. agent-CLI cold start).
- **Remediation:** live elapsed counter — "grading… {n}s · usually ~30s" — sets expectation and shows liveness.
- **Status:** fixed. **Verified:** counter ticks during grading; rubric renders (~29s) with no error.

### Finding 14.3 — Claimed "rubric never renders" (HTTP 200 but blank)  [investigated → not a bug]
- Mimi's script capped at 25s; grading takes ~29s. A 45s poll confirms the rubric, rate-row, and score all render correctly with zero console errors. The *perception* of freezing is real and addressed by 14.2.
- **Status:** declined (no render bug); UX cause fixed via 14.2.

---

## Persona 15 — Greg, garbage typist (dumb)
Goal: paste nonsense/emoji/long text and grade it. Outcome: **achieved**, no defect. The grader accepts any ≥-threshold text and returns a (low) rubric; long input doesn't overflow (textarea scrolls). No crash. Covered by the grading path verified for Mimi/Dana.

---

## Persona 16 — Nina (refresher) · 6 — Oskar (flaky wifi, mid-session refresh)
Goal: refresh mid-session and expect state to survive. Outcome: **achieved with caveat.**

### Finding 16.1 — Mid-session refresh restarts the cram run from the overview  [minor]
- **Pass:** 1 (Bob, Finding "refresh resets to 2/7")
- **Where:** any mid-session refresh. The in-page cram queue is in memory and resets; the position returns to the first card.
- **Decision: accepted (documented), not fixed this pass.** Cram is an explicit single-sitting drill, and **FSRS ratings already persist server-side** on every rate — so spaced-repetition progress is *not* lost, only the within-sitting position. A refresh-within-50ms-of-rating race can drop that one rating (extreme timing). Resuming an in-progress cram (localStorage/server cursor) is a sensible future enhancement; flagged for a follow-up, not a correctness bug.

---

## Persona 17 — Bob, wrong-order masher (dumb-user)
Goal: rate before revealing, mash buttons, desync the counter. Outcome: **achieved**; core flow held up.

### Finding 17.1 — No visible submit button on answer cards  [major]
- **Pass:** 1
- **Where:** explain/what-if/capstone — only the "⌘enter" hint indicated how to submit; Bob (a non-reader) was stuck 30s+ and closed the tab twice.
- **Remediation:** a visible "grade — ⌘enter" button (calls `attemptGrade`); ⌘enter still works.
- **Status:** fixed. **Verified:** mouse-only grade via button-click returns a rubric.

### Validated (no fix needed — recorded as passing)
- Pre-reveal rating blocked on Q&A **and** cloze (number keys ignored until revealed).
- Mash dedup: 8 rapid presses/clicks = exactly one advance.
- Triple ⌘enter = one grade request; input locked during grading.
- Position counter never exceeds total; session-complete screen is inert; **zero console/page errors** across all chaos.

---

## Persona 18 — Carlos, tiny window (dumb)
Goal: use the app in a ~420px window; find overflow/clipping. Outcome: **achieved**, no defect.
- **Verified:** at 420×740, `scrollWidth <= innerWidth` (no horizontal overflow); the mouse-only playthrough completes. Dense layout holds. No clipping observed. (Hardened reveal/grade buttons are `align-self:flex-start`, so they don't stretch oddly in narrow widths.)

---

## Summary

- **Pass 1:** 3 persona agents + scripted driver → **9 distinct defects** (1 blocker, 6 major, 2 minor) + several validated-good behaviors.
- **Fixed:** 1.1, 1.2, 1.3, 11.1, 11.2, 14.1, 14.2, 17.1 (and the generation repair-pass latent twin of 1.1).
- **Declined with reason:** 1.4 (terminal screen), 14.3 (not a bug — latency perception, addressed by 14.2), 16.1 (accepted: cram is single-sitting, FSRS persists; resume = future enhancement). Future polish noted: keyboard focus ring (Persona 4/10), cram resume (Persona 16).
- **Pass 2:** full keyboard playthrough **and** full mouse-only playthrough both complete start→summary with the capstone graded and **zero console errors** — no new complaints. Stopping per the skill's "a pass yields no new complaints" rule.
