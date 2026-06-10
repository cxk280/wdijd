import { useEffect, useRef, useState } from 'preact/hooks';
import type { Card, GradeResult, RatingName } from '../../core/schema';
import { api } from '../api';
import { Chips, RateRow, useRatingKeys } from './CardView';

const MIN_WORDS_EXPLAIN = 3;
const MIN_WORDS_CAPSTONE = 5;

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Seconds since `active` became true — LLM grading takes ~20-30s, so the UI
 *  shows a live counter instead of a static "grading…" that reads as frozen. */
function useElapsed(active: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) {
      setN(0);
      return;
    }
    const id = setInterval(() => setN((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return n;
}

function GradingLine({ seconds }: { seconds: number }) {
  return <div class="hint-line">grading… {seconds}s · usually ~30s</div>;
}

export function RubricResult({ result }: { result: GradeResult }) {
  return (
    <div class="rubric">
      {result.criteria.map((c) => (
        <div class="criterion" key={c.id}>
          <span class={c.met ? 'crit-ok' : 'crit-miss'}>{c.met ? '✓' : '✗'}</span>
          <span class="crit-body">
            <span class="crit-text">{c.note}</span>
          </span>
        </div>
      ))}
      <div class="feedback">{result.feedback}</div>
      <div class="score-line">
        score {Math.round(result.score * 100)}% · suggested: {result.suggestedRating}
      </div>
    </div>
  );
}

export function Explain({
  deckId,
  card,
  onRate,
}: {
  deckId: string;
  card: Card & { type: 'explain' | 'whatif' };
  onRate: (r: RatingName) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModel, setShowModel] = useState(false);
  const [shortMsg, setShortMsg] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const elapsed = useElapsed(grading);

  // autoFocus doesn't re-fire across SPA card transitions — focus on mount so a
  // keyboard-first user can type without reaching for the mouse
  useEffect(() => {
    taRef.current?.focus();
  }, [card.id]);

  const grade = async () => {
    setGrading(true);
    setError(null);
    try {
      setResult(await api.grade(deckId, card.id, answer));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'grading failed');
    } finally {
      setGrading(false);
    }
  };

  // explicit, never-silent: tell the user why grading didn't fire
  const attemptGrade = () => {
    if (grading || result) return;
    const w = wordCount(answer);
    if (w < MIN_WORDS_EXPLAIN) {
      setShortMsg(`write at least ${MIN_WORDS_EXPLAIN} words to grade — you have ${w}`);
      return;
    }
    setShortMsg(null);
    void grade();
  };

  useRatingKeys(result !== null || error !== null, onRate);

  return (
    <div class="card-view">
      <div class="section-label">{card.section.toUpperCase()}</div>
      <div class="card-front">{card.prompt}</div>
      <textarea
        ref={taRef}
        class={`answer-box${grading ? ' dimmed' : ''}`}
        value={answer}
        disabled={!!result || grading}
        placeholder={`type your answer (≥${MIN_WORDS_EXPLAIN} words) — ⌘enter to grade`}
        onInput={(e) => {
          const v = (e.target as HTMLTextAreaElement).value;
          setAnswer(v);
          if (shortMsg && wordCount(v) >= MIN_WORDS_EXPLAIN) setShortMsg(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            attemptGrade();
          }
        }}
      />
      {shortMsg && !grading && !result && <div class="hint-warn">{shortMsg}</div>}
      {!result && !grading && (
        <button class="cta grade-btn" onClick={attemptGrade}>
          grade — ⌘enter
        </button>
      )}
      {grading && <GradingLine seconds={elapsed} />}
      {error && (
        <div class="inline-error">
          grading failed — <button class="linkish" onClick={() => { setError(null); void grade(); }}>retry</button> or rate it yourself (1-4)
        </div>
      )}
      {result && (
        <>
          <RubricResult result={result} />
          <button class="linkish" onClick={() => setShowModel((s) => !s)}>
            model answer {showModel ? '▾' : '▸'}
          </button>
          {showModel && <div class="model-answer">{card.modelAnswer}</div>}
          <Chips refs={card.sourceRefs} />
        </>
      )}
      {(result || error) && <RateRow suggested={result?.suggestedRating ?? null} onRate={onRate} />}
    </div>
  );
}

export function Capstone({
  deckId,
  prompt,
  onDone,
}: {
  deckId: string;
  prompt: string;
  onDone: (result: GradeResult | null) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shortMsg, setShortMsg] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const elapsed = useElapsed(grading);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  // once graded, Enter advances to the summary (keyboard parity with the CTA)
  useEffect(() => {
    if (!result) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        onDone(result);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [result, onDone]);

  const grade = async () => {
    setGrading(true);
    setError(null);
    try {
      setResult(await api.capstone(deckId, answer));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'grading failed');
    } finally {
      setGrading(false);
    }
  };

  const attemptGrade = () => {
    if (grading || result) return;
    const w = wordCount(answer);
    if (w < MIN_WORDS_CAPSTONE) {
      setShortMsg(`write at least ${MIN_WORDS_CAPSTONE} words to grade — you have ${w}`);
      return;
    }
    setShortMsg(null);
    void grade();
  };

  return (
    <div class="card-view capstone">
      <div class="capstone-rule" />
      <div class="card-front big">{prompt}</div>
      <div class="hint-line">cover what changed, why, and what you would watch for</div>
      <textarea
        ref={taRef}
        class={`answer-box tall${grading ? ' dimmed' : ''}`}
        value={answer}
        disabled={!!result || grading}
        placeholder={`type your answer (≥${MIN_WORDS_CAPSTONE} words) — ⌘enter to grade`}
        onInput={(e) => {
          const v = (e.target as HTMLTextAreaElement).value;
          setAnswer(v);
          if (shortMsg && wordCount(v) >= MIN_WORDS_CAPSTONE) setShortMsg(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            attemptGrade();
          }
        }}
      />
      {shortMsg && !grading && !result && <div class="hint-warn">{shortMsg}</div>}
      {!result && !grading && (
        <button class="cta grade-btn" onClick={attemptGrade}>
          grade — ⌘enter
        </button>
      )}
      {grading && <GradingLine seconds={elapsed} />}
      {error && (
        <div class="inline-error">
          grading failed — <button class="linkish" onClick={() => { setError(null); void grade(); }}>retry</button> or{' '}
          <button class="linkish" onClick={() => onDone(null)}>skip to summary</button>
        </div>
      )}
      {result && (
        <>
          <RubricResult result={result} />
          <button class="cta" onClick={() => onDone(result)}>
            summary — enter
          </button>
        </>
      )}
    </div>
  );
}
