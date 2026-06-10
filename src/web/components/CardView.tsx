import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Card, RatingName } from '../../core/schema';
import { Explain } from './Explain';

export const RATING_KEYS: { rating: RatingName; label: string; cls: string }[] = [
  { rating: 'again', label: '1 again', cls: 'r-again' },
  { rating: 'hard', label: '2 hard', cls: 'r-hard' },
  { rating: 'good', label: '3 good', cls: 'r-good' },
  { rating: 'easy', label: '4 easy', cls: 'r-easy' },
];

export function Chips({ refs }: { refs: string[] }) {
  if (refs.length === 0) return null;
  return (
    <div class="chips">
      {refs.map((r) => (
        <span class="chip" key={r}>
          {r}
        </span>
      ))}
    </div>
  );
}

export function RateRow({
  suggested,
  onRate,
}: {
  suggested: RatingName | null;
  onRate: (r: RatingName) => void;
}) {
  return (
    <div class="rate-row">
      {RATING_KEYS.map((r) => (
        <button
          key={r.rating}
          class={`rate ${r.cls}${suggested === r.rating ? ' suggested' : ''}`}
          onClick={() => onRate(r.rating)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** Map number keys 1-4 to ratings while `active`. */
export function useRatingKeys(active: boolean, onRate: (r: RatingName) => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      const i = Number(e.key) - 1;
      const entry = RATING_KEYS[i];
      if (entry) {
        e.preventDefault();
        onRate(entry.rating);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, onRate]);
}

function Qa({ card, onRate }: { card: Card & { type: 'qa' }; onRate: (r: RatingName) => void }) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === ' ' && !flipped) {
        e.preventDefault();
        setFlipped(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [flipped]);
  useRatingKeys(flipped, onRate);

  return (
    <div class="card-view">
      <div class="section-label">{card.section.toUpperCase()}</div>
      <div class="card-front">{card.front}</div>
      {flipped ? (
        <>
          <hr class="divider" />
          <div class="card-back">{card.back}</div>
          <Chips refs={card.sourceRefs} />
          <RateRow suggested={null} onRate={onRate} />
        </>
      ) : (
        <button class="reveal-btn" onClick={() => setFlipped(true)}>
          show answer — space
        </button>
      )}
    </div>
  );
}

interface ClozeSeg {
  text: string;
  blank: boolean;
}

function parseCloze(code: string): ClozeSeg[] {
  const segs: ClozeSeg[] = [];
  let rest = code;
  const re = /\{\{c\d+::(.*?)\}\}/s;
  for (;;) {
    const m = re.exec(rest);
    if (!m) break;
    if (m.index > 0) segs.push({ text: rest.slice(0, m.index), blank: false });
    segs.push({ text: m[1] ?? '', blank: true });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) segs.push({ text: rest, blank: false });
  return segs;
}

function Cloze({
  card,
  onRate,
}: {
  card: Card & { type: 'cloze' };
  onRate: (r: RatingName) => void;
}) {
  const segs = useMemo(() => parseCloze(card.code), [card.code]);
  const blanks = segs.filter((s) => s.blank).length;
  const [revealed, setRevealed] = useState(0);
  const allOut = revealed >= blanks;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === ' ' && !allOut) {
        e.preventDefault();
        setRevealed((n) => n + 1);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [allOut]);
  useRatingKeys(allOut, onRate);

  let blankIdx = -1;
  return (
    <div class="card-view">
      <div class="section-label">
        {card.section.toUpperCase()} · {card.context}
      </div>
      <pre class="code-block">
        {segs.map((s, i) => {
          if (!s.blank) return <span key={i}>{s.text}</span>;
          blankIdx += 1;
          return blankIdx < revealed ? (
            <span class="blank revealed" key={i}>
              {s.text}
            </span>
          ) : (
            <span class="blank" key={i}>
              {'▮'.repeat(Math.max(3, Math.min(s.text.length, 18)))}
            </span>
          );
        })}
      </pre>
      {allOut ? (
        <div class="hint-line">all {blanks} blanks revealed</div>
      ) : (
        <button class="reveal-btn" onClick={() => setRevealed((n) => n + 1)}>
          reveal next blank — space ({revealed}/{blanks})
        </button>
      )}
      {allOut && (
        <>
          <Chips refs={card.sourceRefs} />
          <RateRow suggested={null} onRate={onRate} />
        </>
      )}
    </div>
  );
}

export function CardView({
  deckId,
  card,
  onRate,
}: {
  deckId: string;
  card: Card;
  onRate: (r: RatingName) => void;
}) {
  switch (card.type) {
    case 'qa':
      return <Qa card={card} onRate={onRate} key={card.id} />;
    case 'cloze':
      return <Cloze card={card} onRate={onRate} key={card.id} />;
    case 'explain':
    case 'whatif':
      return <Explain deckId={deckId} card={card} onRate={onRate} key={card.id} />;
    case 'overview':
      return null; // folded into the Overview screen
  }
}
