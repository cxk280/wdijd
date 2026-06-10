import type { DeckRow } from '../api';

function age(iso: string | null): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days === 0 ? 'today' : `${days}d ago`;
}

export function DeckList({
  decks,
  onOpen,
}: {
  decks: DeckRow[];
  onOpen: (deckId: string, mode: 'cram' | 'review') => void;
}) {
  if (decks.length === 0)
    return <div class="empty-state">no decks yet — run npx wdijd in a repo</div>;
  return (
    <div class="deck-list">
      <div class="deck-row deck-header">
        <span class="col-title">deck</span>
        <span class="col-source">source</span>
        <span class="col-n">cards</span>
        <span class="col-n">due</span>
        <span class="col-n">studied</span>
      </div>
      {decks.map((d) => (
        <button
          class="deck-row"
          key={d.deckId}
          onClick={() => onOpen(d.deckId, d.due > 0 ? 'review' : 'cram')}
        >
          <span class="col-title fg">{d.title}</span>
          <span class="col-source">{d.source}</span>
          <span class="col-n">{d.cards}</span>
          <span class={`col-n${d.due > 0 ? ' accent' : ''}`}>{d.due}</span>
          <span class="col-n">{age(d.lastStudied)}</span>
        </button>
      ))}
    </div>
  );
}
