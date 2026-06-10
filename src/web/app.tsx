import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Deck, GradeResult, RatingName } from '../core/schema';
import { api, type DeckRow, type Summary as SummaryData } from './api';
import { Queue } from './session';
import { CardView } from './components/CardView';
import { Capstone } from './components/Explain';
import { DeckList } from './components/DeckList';
import { Overview } from './components/Overview';
import { Progress } from './components/Progress';
import { Summary } from './components/Summary';

type View =
  | { v: 'loading' }
  | { v: 'progress' }
  | { v: 'decks'; decks: DeckRow[] }
  | { v: 'overview'; deck: Deck }
  | { v: 'card'; deck: Deck }
  | { v: 'capstone'; deck: Deck }
  | { v: 'summary'; deck: Deck; data: SummaryData }
  | { v: 'fatal'; message: string; hint?: string };

export function App() {
  const [view, setView] = useState<View>({ v: 'loading' });
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const [progressError, setProgressError] = useState<{ message: string; hint?: string } | null>(null);
  const [costUsd, setCostUsd] = useState<number | undefined>(undefined);
  const queueRef = useRef<Queue | null>(null);
  const modeRef = useRef<'cram' | 'review'>('cram');
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);

  const startSession = useCallback(async (deckId: string, mode: 'cram' | 'review') => {
    const deck = await api.deck(deckId);
    const session = await api.session(deckId, mode);
    modeRef.current = mode;
    queueRef.current = new Queue(session.cardIds, mode);
    if (mode === 'cram') setView({ v: 'overview', deck });
    else {
      skipOverviews(deck);
      setView({ v: 'card', deck });
    }
  }, []);

  // skip non-rateable overview cards inside the queue
  const skipOverviews = (deck: Deck) => {
    const q = queueRef.current;
    while (q && !q.done()) {
      const card = deck.cards.find((c) => c.id === q.current());
      if (card?.type === 'overview') q.advance(null);
      else break;
    }
  };

  useEffect(() => {
    void (async () => {
      const boot = await api.boot();
      if (boot.mode === 'generate') {
        setView({ v: 'progress' });
        const close = api.events((e) => {
          if (e.type === 'progress') setProgressLines((l) => [...l, e.line]);
          else if (e.type === 'deck') {
            setCostUsd(e.costUsd);
            close();
            void startSession(e.deckId, 'cram');
          } else if (e.type === 'error') setProgressError(e);
        });
      } else if (boot.mode === 'review' && boot.deckId) {
        await startSession(boot.deckId, 'review');
      } else {
        setView({ v: 'decks', decks: await api.decks() });
      }
    })().catch((e: unknown) =>
      setView({ v: 'fatal', message: e instanceof Error ? e.message : String(e) }),
    );
  }, [startSession]);

  const nextOrFinish = (deck: Deck) => {
    const q = queueRef.current!;
    skipOverviews(deck);
    if (!q.done()) {
      setView({ v: 'card', deck });
      rerender();
      return;
    }
    if (modeRef.current === 'cram') setView({ v: 'capstone', deck });
    else void endSession(deck, null);
  };

  const endSession = async (deck: Deck, _capstone: GradeResult | null) => {
    const data = await api.endSession(deck.id);
    setView({ v: 'summary', deck, data });
  };

  const rate = (deck: Deck, rating: RatingName) => {
    const q = queueRef.current!;
    const cardId = q.current();
    if (!cardId) return;
    void api.rate(deck.id, cardId, rating).catch(() => undefined);
    q.advance(rating);
    nextOrFinish(deck);
  };

  // enter advances on overview/summary screens
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (view.v === 'overview') {
        e.preventDefault();
        nextOrFinish(view.deck);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const chromeFor = (): { title: string; pos: string; hints: string } | null => {
    const q = queueRef.current;
    switch (view.v) {
      case 'overview':
        return {
          title: view.deck.title,
          pos: `${view.deck.cards.length} cards`,
          hints: 'enter  begin',
        };
      case 'card': {
        const card = view.deck.cards.find((c) => c.id === q?.current());
        const pos = q ? `${q.position()} / ${q.total} · ${card?.section ?? ''}` : '';
        const hints =
          card?.type === 'qa'
            ? 'space flip · 1-4 rate'
            : card?.type === 'cloze'
              ? 'space reveal · 1-4 rate'
              : '⌘enter grade · 1-4 rate';
        return { title: view.deck.title, pos, hints };
      }
      case 'capstone':
        return { title: view.deck.title, pos: 'capstone', hints: '⌘enter grade' };
      case 'summary':
        return { title: view.deck.title, pos: 'session complete', hints: '' };
      case 'decks':
        return { title: 'wdijd', pos: `${view.decks.length} decks`, hints: 'click to open' };
      default:
        return null;
    }
  };

  const chrome = chromeFor();
  const q = queueRef.current;

  return (
    <div class="shell-root">
      {chrome && (
        <div class="topbar">
          <span>{chrome.title}</span>
          <span>{chrome.pos}</span>
        </div>
      )}
      <main class="content">
        {view.v === 'loading' && <div class="hint-line">…</div>}
        {view.v === 'fatal' && (
          <div class="inline-error">
            {view.message}
            {view.hint ? ` — ${view.hint}` : ''}
          </div>
        )}
        {view.v === 'progress' && (
          <Progress source="" lines={progressLines} error={progressError} />
        )}
        {view.v === 'decks' && (
          <DeckList decks={view.decks} onOpen={(id, mode) => void startSession(id, mode)} />
        )}
        {view.v === 'overview' && <Overview deck={view.deck} />}
        {view.v === 'card' && q && (
          <CardView
            deckId={view.deck.id}
            card={view.deck.cards.find((c) => c.id === q.current())!}
            onRate={(r) => rate(view.deck, r)}
          />
        )}
        {view.v === 'capstone' && (
          <Capstone
            deckId={view.deck.id}
            prompt={view.deck.capstone.prompt}
            onDone={(res) => void endSession(view.deck, res)}
          />
        )}
        {view.v === 'summary' && <Summary data={view.data} costUsd={costUsd} />}
      </main>
      {chrome && <div class="bottombar">{chrome.hints}</div>}
    </div>
  );
}
