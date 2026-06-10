# wdijd — User Personas

20 personas for black-box browser testing of the **review/study experience** —
the surface a user actually touches in the browser after `npx wdijd` generates a
deck (or `wdijd review --cram`). The terminal wizard and CLI are out of scope for
browser personas (they're TUI). Roster: ~10 expert (`smart-user`), ~10 naive
(`dumb-user`). All study the same fixture deck *"Auth refresh-token rotation"*
(overview + mermaid, 2 Q&A, 2 cloze, 1 explain, 1 what-if, capstone) served in
cram mode so the full journey is reachable and non-depleting.

Each persona has ONE concrete goal. Findings live in `USER_PERSONAS_FINDING.md`.

| # | Name | Agent | Tech | Device / context | One-line goal |
|---|------|-------|------|------------------|---------------|
| 1 | Priya, staff eng | smart | expert | laptop, keyboard-only | Complete a full cram session using ONLY the keyboard (space, 1–4, enter, ⌘enter). |
| 2 | Marcus, eng manager | smart | high | laptop, fast | Read the overview + diagram and rate every card honestly to a summary. |
| 3 | Dana, security reviewer | smart | expert | laptop | Answer the explain card thoroughly and read the rubric/feedback to learn what they missed. |
| 4 | Sam, tech writer | smart | medium | laptop, big screen | Reach the capstone and write a full explanation; check the score is sensible. |
| 5 | Lia, backend dev | smart | high | laptop | Reveal every cloze blank one at a time and verify the code reads correctly. |
| 6 | Oskar, SRE | smart | high | laptop, flaky wifi | Mid-session, refresh the browser and see whether progress/state survives. |
| 7 | Aiko, designer | smart | medium | laptop, retina | Judge whether the dark, dense UI is readable and the typography is consistent. |
| 8 | Ravi, PM | smart | medium | laptop | Skim the deck quickly, rate everything "easy", and read the end summary. |
| 9 | Tomás, open-source maintainer | smart | expert | laptop | Verify source-ref chips point at the right files/lines and make sense. |
| 10 | Hana, accessibility advocate | smart | high | laptop + screen reader mindset | Navigate the whole session via keyboard and note any focus/aria gaps. |
| 11 | Grandpa Joe | dumb | very low | old laptop, trackpad | Just try to "use the thing" — clicks around, unsure what to do first. |
| 12 | Bella, impatient intern | dumb | low | laptop | Double-clicks and mashes keys; rates before reading; wants to finish fast. |
| 13 | Chad, ignores instructions | dumb | low | laptop | Ignores every hint line; tries to click things that aren't buttons. |
| 14 | Mimi, empty-input tester | dumb | low | laptop | Tries to submit the explain/capstone answer empty or with one word. |
| 15 | Greg, garbage typist | dumb | low | laptop | Pastes nonsense / emoji / a wall of text into the answer box and grades it. |
| 16 | Nina, refresher | dumb | low | laptop | Refreshes the page repeatedly and uses browser Back, expecting it to "reset". |
| 17 | Bob, wrong-order | dumb | low | laptop | Tries to rate a Q&A before flipping it; presses 1–4 with nothing revealed. |
| 18 | Carlos, tiny window | dumb | low | laptop, 500px-wide window | Uses the app in a cramped window; sees if anything overflows or is cut off. |
| 19 | Fatima, mobile mindset | dumb | low | small touch-ish viewport | Expects tap targets and no keyboard; tries to get through a card by clicking. |
| 20 | Derek, rage-quitter | dumb | low | laptop | Gets frustrated fast; spams the rating buttons and the textarea, looks for a way out. |

## Notes on coverage

- **Keyboard model** (1, 10, 17): space=flip/reveal, 1–4=rate, enter=begin/next, ⌘enter=grade.
- **LLM-graded cards** (3, 4, 14, 15): explain/what-if/capstone hit a real (haiku) grade
  round-trip; latency and the "grading…" state are part of the experience.
- **Resilience** (6, 16): mid-session refresh — cram restarts from the overview (state
  persists server-side; the in-page session queue resets). Expected, but worth a naive user's reaction.
- **Layout** (7, 18, 19): dense dark UI in cramped/touch contexts.
