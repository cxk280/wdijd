import { useEffect, useRef, useState } from 'preact/hooks';
import { renderMarkdown } from '../markdown-render';

export function Markdown({ text }: { text: string }) {
  return <div class="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
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
        // securityLevel:'strict' sanitizes labels and blocks injected HTML/JS in
        // LLM-authored diagram code (default is already strict — pinned explicitly).
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          darkMode: true,
          securityLevel: 'strict',
        });
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
