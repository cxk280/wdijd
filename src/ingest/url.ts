import { SourceSpec } from './types.js';

const INLINE_CAP = 50 * 1024;
// Stop reading well before anything huge lands in memory. We only inline
// INLINE_CAP of text anyway, but markup is larger than its text, so allow ~8x.
const FETCH_CAP = 8 * 1024 * 1024;

/** Read a response body up to `cap` bytes, then stop. Guards against OOM from a
 *  giant (or lying-Content-Length) response. */
export async function readCapped(res: Response, cap: number): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, cap);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= cap) break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks)).slice(0, cap);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Crude but dependency-free HTML → text. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/** Fetched locally so both engines get the same context — no LLM-side web tools. */
export async function urlSource(url: string): Promise<SourceSpec> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'user-agent': 'wdijd (local study-deck generator)' },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  const raw = await readCapped(res, FETCH_CAP);
  const type = res.headers.get('content-type') ?? '';
  const text = type.includes('html') ? htmlToText(raw) : raw;

  return {
    kind: 'url',
    title: new URL(url).hostname + new URL(url).pathname,
    description: url,
    promptContext: `## Content of ${url}\n${text.slice(0, INLINE_CAP)}${text.length > INLINE_CAP ? '\n…(truncated)' : ''}`,
    needsRepoTools: false,
    needsGitTools: false,
    cwd: process.cwd(),
    projectPath: null,
  };
}
