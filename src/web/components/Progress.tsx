export function Progress({
  source,
  lines,
  error,
}: {
  source: string;
  lines: string[];
  error: { message: string; hint?: string } | null;
}) {
  const recent = lines.slice(-14);
  const old = Math.max(0, recent.length - 2);
  return (
    <div class="progress">
      <div class="progress-source">{source}</div>
      <div class="progress-log">
        {recent.map((l, i) => (
          <div class={`log-line${i < old ? ' log-old' : ''}`} key={`${i}-${l}`}>
            {l}
          </div>
        ))}
      </div>
      {error && (
        <div class="inline-error">
          {error.message}
          {error.hint ? ` — ${error.hint}` : ''}
        </div>
      )}
    </div>
  );
}
