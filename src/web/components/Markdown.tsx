import { useEffect, useRef, useState } from 'preact/hooks';
import { marked } from 'marked';

export function Markdown({ text }: { text: string }) {
  const html = marked.parse(text, { async: false });
  return <div class="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Mermaid renders lazily; on any failure we fall back to the source. */
export function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mm-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', darkMode: true });
        const out = await mermaid.render(idRef.current, code);
        if (alive) setSvg(out.svg);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  if (failed) return <pre class="diagram-fallback">{code}</pre>;
  if (!svg) return <div class="diagram-loading">diagram…</div>;
  return <div class="diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
