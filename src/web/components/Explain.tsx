import { useState } from 'preact/hooks';
import type { Card, GradeResult, RatingName } from '../../core/schema';
import { api } from '../api';
import { Chips, RateRow, useRatingKeys } from './CardView';

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

  const canGrade = answer.trim().split(/\s+/).length >= 3 && !grading && !result;

  const grade = async () => {
    if (!canGrade) return;
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

  useRatingKeys(result !== null || error !== null, onRate);

  return (
    <div class="card-view">
      <div class="section-label">{card.section.toUpperCase()}</div>
      <div class="card-front">{card.prompt}</div>
      <textarea
        class={`answer-box${grading ? ' dimmed' : ''}`}
        value={answer}
        disabled={!!result || grading}
        placeholder="type your answer — ⌘enter to grade"
        onInput={(e) => setAnswer((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void grade();
          }
        }}
        autoFocus
      />
      {grading && <div class="hint-line">grading…</div>}
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

  const canGrade = answer.trim().split(/\s+/).length >= 5 && !grading && !result;

  const grade = async () => {
    if (!canGrade) return;
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

  return (
    <div class="card-view capstone">
      <div class="capstone-rule" />
      <div class="card-front big">{prompt}</div>
      <div class="hint-line">cover what changed, why, and what you would watch for</div>
      <textarea
        class={`answer-box tall${grading ? ' dimmed' : ''}`}
        value={answer}
        disabled={!!result || grading}
        placeholder="type your answer — ⌘enter to grade"
        onInput={(e) => setAnswer((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void grade();
          }
        }}
        autoFocus
      />
      {grading && <div class="hint-line">grading…</div>}
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
