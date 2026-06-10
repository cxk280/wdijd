import type { Summary as SummaryData } from '../api';

export function Summary({ data, costUsd }: { data: SummaryData; costUsd?: number }) {
  const cost = costUsd !== undefined ? ` · $${costUsd.toFixed(2)}` : '';
  return (
    <div class="summary">
      <div class="summary-top">
        session complete · {data.cardsRated} cards · {data.minutes} min{cost}
      </div>

      <div class="group">
        <div class="group-label">CAPSTONE</div>
        {data.capstone ? (
          <>
            <div>{Math.round(data.capstone.score * 100)}% — {data.capstone.feedback}</div>
            {data.capstone.criteria
              .filter((c) => !c.met)
              .map((c) => (
                <div class="group-line dim" key={c.id}>
                  ✗ {c.note}
                </div>
              ))}
          </>
        ) : (
          <div class="group-line dim">skipped</div>
        )}
      </div>

      <div class="group">
        <div class="group-label">WEAK SPOTS</div>
        {data.weak.length === 0 ? (
          <div class="group-line dim">none — clean run</div>
        ) : (
          data.weak.map((w) => (
            <div class="group-line mono" key={w.cardId}>
              {w.agains}× again   {w.label.slice(0, 56)}   <span class="dim">{w.section}</span>
            </div>
          ))
        )}
      </div>

      <div class="group">
        <div class="group-label">NEXT</div>
        <div class="group-line accent mono">{data.nextDue} — npx wdijd review</div>
      </div>

      <div class="saved-line">deck saved to {data.deckDir}</div>
    </div>
  );
}
