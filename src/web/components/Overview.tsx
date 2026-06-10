import type { Deck } from '../../core/schema';
import { Markdown, Mermaid } from './Markdown';

export function Overview({ deck, onBegin }: { deck: Deck; onBegin: () => void }) {
  const sections = new Map<string, number>();
  for (const c of deck.cards) {
    if (c.type === 'overview') continue;
    sections.set(c.section, (sections.get(c.section) ?? 0) + 1);
  }
  const ov = deck.cards.find((c) => c.type === 'overview');

  return (
    <div class="overview">
      <h1>{deck.title}</h1>
      <div class="overview-summary">
        <Markdown text={deck.summary} />
        {ov && ov.type === 'overview' && ov.markdown !== deck.summary && (
          <Markdown text={ov.markdown} />
        )}
      </div>
      {ov && ov.type === 'overview' && ov.mermaid && (
        <div class="overview-diagram">
          <Mermaid code={ov.mermaid} />
        </div>
      )}
      <div class="section-map">
        {[...sections.entries()].map(([name, n]) => (
          <div class="section-row" key={name}>
            {name.padEnd(12, ' ')}→ {n} cards
          </div>
        ))}
      </div>
      <button class="cta" onClick={onBegin}>begin — enter</button>
    </div>
  );
}
