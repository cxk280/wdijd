import { Marked } from 'marked';

/**
 * Card markdown originates from the LLM, which digests untrusted material
 * (repos, PDFs, fetched URLs) — so a card body can carry an XSS payload, either
 * via prompt injection or because the source literally contained one. The
 * review SPA renders this through dangerouslySetInnerHTML, so raw HTML must be
 * neutralized. We escape any raw-HTML token (block or inline) to its literal
 * text; all genuine markdown still renders. Fenced/inline code is escaped by
 * marked already.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // both block-level (Tokens.HTML) and inline (Tokens.Tag) raw HTML route
    // here; inline tokens carry `raw` rather than `text`
    html(token) {
      return escapeHtml(token.text ?? token.raw ?? '');
    },
  },
});

export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false }) as string;
}
